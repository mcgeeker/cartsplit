import { LocalDataError } from "@/lib/local-data-error";
import { browser } from "wxt/browser";
import { getPurchaseOrderSession } from "@/background/purchase-session";
import { purchasePreparationFailureText } from "@/lib/purchase-preparation-status";
import { OrderReviewError } from "@/lib/order-review-status";
import { beginPurchaseReview, purchaseReviewTabState, reopenPurchaseReviewTab, startPurchaseReview, preparePurchaseApproval, applyPurchaseApproval, invalidatePurchaseApproval, PurchaseWriteUncertainError } from "@/background/purchase-approval";
import { YNAB_RECONNECT, NOT_CONNECTED } from "@/lib/messages";
import { getSettings, getPublicSettings, clearSettings } from "@/lib/settings";
import { connectPersonalToken, resolveSelectedPlan, ConnectionInputError } from "@/background/connection";
import { withConnectionRequest, cancelConnectionRequests } from "@/background/connection-requests";
import { previewLocalDataDelete, deleteLocalData, invalidateLocalDataPreview } from "@/background/local-data-cleanup";
import { connectionCommandAllowed, CONNECTION_CHECK_MESSAGE } from "@/lib/verification";
import { createUiMessageListener } from "@/background/ui-messages";
import { getPlans, getCategories, NeedsReauthError, YnabApiError } from "@/lib/ynab";
import { putCategories, getAllCategories } from "@/lib/db";
import { switchPlan } from "@/background/plan";
import { clearPurchaseSuggestionCache } from "@/background/purchase-learning";
import type { MessageRequest } from "@/lib/types";

/** Serialize connection, category-cache and review mutations. Cancellation is
 * delivered immediately; queued requests recheck their signal before I/O.
 * A failed operation must not poison the queue for subsequent requests. */
let operationChain: Promise<unknown> = Promise.resolve();
function serializeCategoriesWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = operationChain.then(fn, fn);
  operationChain = run.then(() => undefined, () => undefined);
  return run;
}

/** Only controlled errors may cross the privileged message boundary. Storage,
 * network and model exceptions can contain private paths, identifiers or URLs. */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof NeedsReauthError) return YNAB_RECONNECT;
  if (error instanceof DOMException && error.name === "AbortError") return "Connection request canceled.";
  if (error instanceof ConnectionInputError || error instanceof YnabApiError || error instanceof LocalDataError) return error.message;
  return fallback;
}

/** Register one authenticated sidebar listener. No startup scraping, learning
 * migration, model download, background sync or financial operation. */
export default defineBackground(() => {
  if (chrome.sidePanel) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
  browser.runtime.onMessage.addListener(createUiMessageListener(handleMessage));
});

async function handleMessage(message: MessageRequest): Promise<unknown> {
  if (!connectionCommandAllowed(message.type)) return { error: CONNECTION_CHECK_MESSAGE };
  switch (message.type) {
    case "GET_PURCHASE_ORDER_SESSION": {
      try{return {session:await getPurchaseOrderSession(message.orderKey)};}catch{return {error:"Could not read this order’s session. Select the order tab."};}
    }
    case "SUSPEND_PURCHASE_REVIEW": {invalidatePurchaseApproval(message.reviewId,true);return {ok:true};}
    case "GET_PURCHASE_REVIEW_TAB": return {state:await purchaseReviewTabState(message.reviewId)};
    case "REOPEN_PURCHASE_REVIEW_TAB": {
      try {await reopenPurchaseReviewTab(message.reviewId);return {ok:true};}
      catch {return {error:"Could not reopen this order tab. It may already be open or the review expired."};}
    }
    case "PREPARE_PURCHASE_APPROVAL": {
      try {return {preview:await withConnectionRequest(s=>serializeCategoriesWrite(()=>preparePurchaseApproval(message.reviewId,message.lineTotals,message.categories,message.confirmed,s,message.split,message.adjustments))) };}
      catch(error) {return {error:purchasePreparationFailureText(error)};}
    }
    case "APPLY_PURCHASE_APPROVAL": {
      try {const result=await withConnectionRequest(s=>serializeCategoriesWrite(()=>applyPurchaseApproval(message.approvalId,message.confirmed,s)));return {ok:true,...result};}
      catch(error){return {error:error instanceof PurchaseWriteUncertainError?error.message:"Changes were not sent. Approval expired, was canceled, or no longer matches the order/transaction/categories.",uncertain:error instanceof PurchaseWriteUncertainError};}
    }
    case "CANCEL_PURCHASE_APPROVAL": {invalidatePurchaseApproval(message.id);return {ok:true};}
    case "REVIEW_CA_PURCHASE": {
      const version=beginPurchaseReview();
      try { return { review: await withConnectionRequest(signal => serializeCategoriesWrite(() => startPurchaseReview(message.confirmed, signal, version))) }; }
      catch (error) { return { error: "Purchase review stopped. No transaction changed.", ...(error instanceof OrderReviewError ? { reason: error.stage,...(error.paymentDiagnostic?{paymentDiagnostic:error.paymentDiagnostic}:{}) } : {}) }; }
    }
    case "GET_SETTINGS": {
      try {
        return await getPublicSettings();
      } catch (e) {
        return { error: "Could not load the local connection. Reopen the sidebar." };
      }
    }

    case "GET_PLANS": {
      try {
        const plans = await withConnectionRequest((signal) => getPlans(undefined, signal));
        return { plans };
      } catch (e) {
        return { error: errorMessage(e, "Failed to fetch budgets") };
      }
    }

    case "CONNECT_TOKEN": {
      clearPurchaseSuggestionCache();
      invalidatePurchaseApproval();
      invalidateLocalDataPreview();
      try {
        return await withConnectionRequest((signal) => serializeCategoriesWrite(() => {
          signal.throwIfAborted();
          return connectPersonalToken(message.token, signal);
        }));
      } catch (e) {
        return { error: errorMessage(e, "Could not validate your token.") };
      }
    }

    case "SAVE_PLAN": {
      clearPurchaseSuggestionCache();
      invalidatePurchaseApproval();
      invalidateLocalDataPreview();
      try {
        await withConnectionRequest((signal) => serializeCategoriesWrite(async () => {
          signal.throwIfAborted();
          const chosen = await resolveSelectedPlan(message.planId, signal);
          await switchPlan(chosen.id, chosen.name, { signal });
        }));
        return { ok: true };
      } catch (e) {
        return { error: errorMessage(e, "Failed to save plan") };
      }
    }

    case "REFRESH_CATEGORIES": {
      try {
        // planId is read INSIDE the serialized section so a refresh queued
        // behind a plan switch fetches the plan the switch just committed.
        return await withConnectionRequest((signal) => serializeCategoriesWrite(async () => {
          signal.throwIfAborted();
          const settings = await getSettings();
          if (!settings.accessToken || !settings.planId) {
            return { error: NOT_CONNECTED };
          }
          const categories = await getCategories(settings.planId, signal);
          signal.throwIfAborted();
          await putCategories(categories, signal, settings.planId);
          return { ok: true };
        }));
      } catch (e) {
        return { error: errorMessage(e, "Failed to refresh categories") };
      }
    }

    case "GET_CATEGORIES": {
      try {
        const { planId } = await getSettings();
        const categories = planId ? await getAllCategories(planId) : [];
        return { categories };
      } catch (e) {
        return { error: "Could not load categories. Refresh budget categories." };
      }
    }

    case "CLEAR_SETTINGS": {
      clearPurchaseSuggestionCache();
      invalidatePurchaseApproval();
      invalidateLocalDataPreview();
      const resumeRequests = cancelConnectionRequests();
      try {
        await serializeCategoriesWrite(() => clearSettings());
        return { ok: true };
      } catch (e) {
        return { error: "Could not remove the local connection. Try again." };
      } finally {
        resumeRequests();
      }
    }

    case "PREVIEW_LOCAL_DATA_DELETE":
    case "DELETE_LOCAL_DATA": {
      try {
        return await withConnectionRequest((signal) => serializeCategoriesWrite(async () => {
          signal.throwIfAborted();
          return message.type === "PREVIEW_LOCAL_DATA_DELETE"
            ? { preview: await previewLocalDataDelete(signal) }
            : { counts: await deleteLocalData(message.approvalId, message.confirmed, signal), ok: true };
        }));
      } catch (e) { return { error: errorMessage(e, "Could not complete local data removal.") }; }
    }

    case "CANCEL_LOCAL_DATA_DELETE": {
      invalidateLocalDataPreview(message.approvalId);
      return { ok: true };
    }

    default: return { error: "Unknown extension request." };
  }
}
