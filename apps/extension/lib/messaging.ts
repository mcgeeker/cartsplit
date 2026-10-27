import { browser } from "wxt/browser";
import type { Category, MessageRequest, LocalDataDeletePreview, LocalDataCounts } from "./types";
import type { PublicSettings } from "./settings";
import type { YnabPlan } from "./ynab";

/** Sidebar requests contain review inputs, never a credential response.
 * Runtime sender checks and domain validation remain in the background. */
export type PlanInfo = YnabPlan;
function send(message: MessageRequest): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}

export async function previewLocalDataDelete(): Promise<{ preview?: LocalDataDeletePreview; error?: string }> {
  return await send({ type: "PREVIEW_LOCAL_DATA_DELETE" }) as { preview?: LocalDataDeletePreview; error?: string };
}

export async function deleteLocalData(approvalId: string, confirmed: boolean): Promise<{ ok?: true; counts?: LocalDataCounts; error?: string }> {
  return await send({ type: "DELETE_LOCAL_DATA", approvalId, confirmed }) as { ok?: true; counts?: LocalDataCounts; error?: string };
}

export async function cancelLocalDataDelete(approvalId: string): Promise<void> {
  await send({ type: "CANCEL_LOCAL_DATA_DELETE", approvalId });
}

export async function connectToken(token: string): Promise<{ error?: string; plans?: PlanInfo[] }> {
  return (await send({ type: "CONNECT_TOKEN", token })) as { error?: string; plans?: PlanInfo[] };
}

export async function getPlans(): Promise<{ error?: string; plans?: PlanInfo[] }> {
  return (await send({ type: "GET_PLANS" })) as { error?: string; plans?: PlanInfo[] };
}

export async function savePlan(planId: string, planName: string): Promise<{ error?: string }> {
  return (await send({ type: "SAVE_PLAN", planId, planName })) as { error?: string };
}

export async function refreshCategories(): Promise<{ error?: string }> {
  return (await send({ type: "REFRESH_CATEGORIES" })) as { error?: string };
}

export async function clearSettings(): Promise<void> {
  const result = await send({ type: "CLEAR_SETTINGS" }) as { error?: string };
  if (result?.error) throw new Error(result.error);
}

export async function getSettings(): Promise<Partial<PublicSettings> & { error?: string }> {
  return (await send({ type: "GET_SETTINGS" })) as Partial<PublicSettings> & { error?: string };
}

export async function getCategories(): Promise<{ categories?: Category[]; error?: string }> {
  return (await send({ type: "GET_CATEGORIES" })) as { categories?: Category[]; error?: string };
}

export async function reviewCanadianPurchase(confirmed: boolean): Promise<{review?: import("./types").PurchaseReview; error?: string; reason?: string;paymentDiagnostic?:import("./order-review-status").PaymentDiagnostic}> {
 return await send({type:"REVIEW_CA_PURCHASE",confirmed}) as {review?: import("./types").PurchaseReview;error?:string;reason?:string;paymentDiagnostic?:import("./order-review-status").PaymentDiagnostic};
}

export async function preparePurchaseChanges(reviewId:string,lineTotals:boolean[],categories:{id:string;name:string}[],confirmed:boolean,split?:import("./types").SplitChargeSelection,adjustments?:import("./types").AdjustmentPolicy[]):Promise<{preview?:import("./types").PurchaseApprovalPreview;error?:string}>{
 return await send({type:"PREPARE_PURCHASE_APPROVAL",reviewId,lineTotals,categories,confirmed,...(split?{split}:{}),...(adjustments?{adjustments}:{})}) as {preview?:import("./types").PurchaseApprovalPreview;error?:string};
}

export async function applyPurchaseChanges(approvalId:string,confirmed:boolean):Promise<{ok?:boolean;error?:string;uncertain?:boolean;learningSaved?:boolean;savedChargeIndex?:number}>{return await send({type:"APPLY_PURCHASE_APPROVAL",approvalId,confirmed}) as {ok?:boolean;error?:string;uncertain?:boolean;learningSaved?:boolean;savedChargeIndex?:number};}

export async function cancelPurchaseChanges(id?:string):Promise<void>{await send({type:"CANCEL_PURCHASE_APPROVAL",id});}

export async function getPurchaseReviewTab(reviewId:string):Promise<{state:import("@/background/purchase-approval").ReviewTabState}>{return await send({type:"GET_PURCHASE_REVIEW_TAB",reviewId}) as {state:import("@/background/purchase-approval").ReviewTabState};}

export async function reopenPurchaseReviewTab(reviewId:string):Promise<{ok?:boolean;error?:string}>{return await send({type:"REOPEN_PURCHASE_REVIEW_TAB",reviewId}) as {ok?:boolean;error?:string};}

export async function getPurchaseOrderSession(orderKey:string):Promise<{session?:import('./types').PurchaseOrderSession|null;error?:string}>{return await send({type:'GET_PURCHASE_ORDER_SESSION',orderKey}) as {session?:import('./types').PurchaseOrderSession|null;error?:string};}

export async function suspendPurchaseReview(reviewId?:string):Promise<void>{await send({type:'SUSPEND_PURCHASE_REVIEW',reviewId});}
