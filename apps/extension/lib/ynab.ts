import type { CanadianPreviewFailure } from "./canadian-preview-status";
import type { Category } from "./types";
import { getValidAccessToken, NeedsReauthError } from "./auth";
import { CONNECTION_CHECK_MESSAGE } from "./verification";

const BASE_URL = "https://api.ynab.com/v1";
const INTERNAL_CATEGORY_GROUP = "Internal Master Category";
// Private capabilities: only the reviewed target reader/writer below can use them.
const CANADIAN_READ = Symbol("canadian-single-candidate-read");
const REVIEW_WRITE = Symbol("reviewed-test-plan-write");

interface YnabCategoryGroup {
  name: string;
  hidden: boolean;
  deleted: boolean;
  categories: YnabCategory[];
}

interface YnabCategory {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
}

function isVisible(item: { hidden: boolean; deleted: boolean }): boolean {
  return !item.hidden && !item.deleted;
}

/** Shape YNAB wraps every response in. Each endpoint's `data` differs, so
 *  callers specialize via the generic. */
type YnabApiResponse<T> = { data: T };

/** Deliberately excludes response bodies and arbitrary network errors. */
export class YnabApiError extends Error {
  constructor(readonly status: number) {
    super(status === 429
      ? "YNAB request limit reached. Wait before trying again."
      : status === 403
        ? "YNAB denied access. Check your subscription and token permissions."
        : status === 404
          ? "This YNAB budget or transaction is no longer available."
          : `YNAB request failed (HTTP ${status}). Try again later.`);
  }
}

async function ynabFetch<T = unknown>(path: string, options?: RequestInit, suppliedToken?: string,
  scope?: typeof CANADIAN_READ | typeof REVIEW_WRITE, beforeSend?: (token: string) => void): Promise<T> {
  const method = options?.method ?? "GET";
  const allowedRead = method === "GET" &&
    (path === "/plans" || /^\/plans\/[^/]+\/categories$/.test(path) ||
      (scope === CANADIAN_READ && (/^\/plans\/[^/]+\/accounts$/.test(path) ||
        /^\/plans\/[^/]+\/accounts\/[^/]+\/transactions\?since_date=\d{4}-\d{2}-\d{2}$/.test(path))));
  const allowedReviewedWrite = method === "PUT" && scope === REVIEW_WRITE && beforeSend !== undefined &&
    /^\/plans\/[\w-]+\/transactions\/[\w-]+$/.test(path);
  if (!allowedRead && !allowedReviewedWrite) throw new Error(CONNECTION_CHECK_MESSAGE);
  options?.signal?.throwIfAborted();
  const token = suppliedToken ?? await getValidAccessToken();
  options?.signal?.throwIfAborted();
  // The connection can change while the token read awaits IndexedDB.
  beforeSend?.(token);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      // A redirect must never forward a credential to another origin.
      redirect: "error",
      credentials: "omit",
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch {
    options?.signal?.throwIfAborted();
    throw new Error("Could not reach YNAB. Check your connection and try again.");
  }
  options?.signal?.throwIfAborted();
  // A personal token is never refreshed or retried after rejection.
  if (response.status === 401) throw new NeedsReauthError();
  if (!response.ok) throw new YnabApiError(response.status);
  try {
    const data = await response.json() as T;
    options?.signal?.throwIfAborted();
    return data;
  } catch {
    options?.signal?.throwIfAborted();
    throw new Error("YNAB returned an unreadable response. Try again.");
  }
}

export interface YnabPlan {
  id: string;
  name: string;
}

/** A supplied token is used only by background onboarding validation. Never
 * choose the first budget or rely on OAuth's default-plan selection. */
export async function getPlans(suppliedToken?: string, signal?: AbortSignal): Promise<YnabPlan[]> {
  const payload = await ynabFetch<YnabApiResponse<{ plans: YnabPlan[] }>>("/plans", { signal }, suppliedToken);
  const plans = payload?.data?.plans;
  if (!Array.isArray(plans) || plans.some((p) => !p || typeof p.id !== "string" || !p.id || typeof p.name !== "string")) {
    throw new Error("YNAB returned an unreadable budget list. Try again.");
  }
  return plans.map((p) => ({ id: p.id, name: p.name }));
}

export async function getCategories(planId: string, signal?: AbortSignal): Promise<Category[]> {
  const payload = await ynabFetch<YnabApiResponse<{ category_groups: YnabCategoryGroup[] }>>(
    `/plans/${encodeURIComponent(planId)}/categories`, { signal },
  );
  const groups = payload?.data?.category_groups;
  const invalid = () => new Error("YNAB returned an unreadable category list. Refresh categories.");
  const flag = (value: unknown) => typeof value === "boolean";
  if (!Array.isArray(groups) || groups.length > 1000) throw invalid();
  const result: Category[] = [], ids = new Set<string>();
  for (const group of groups) {
    if (!group || typeof group.name !== "string" || !flag(group.hidden) || !flag(group.deleted) || !Array.isArray(group.categories)) throw invalid();
    if (!isVisible(group) || group.name === INTERNAL_CATEGORY_GROUP) continue;
    for (const category of group.categories) {
      if (!category || !flag(category.hidden) || !flag(category.deleted)) throw invalid();
      if (!isVisible(category)) continue;
      if (typeof category.id !== "string" || !/^[\w-]+$/.test(category.id) || ids.has(category.id) ||
          typeof category.name !== "string" || !category.name.trim() || category.name.length > 1000 || result.length >= 10000) throw invalid();
      ids.add(category.id);
      result.push({ id: category.id, name: category.name, groupName: group.name });
    }
  }
  return result;
}

// Preserve the typed authentication error at the transport boundary.
export { NeedsReauthError } from "./auth";

async function readCanadianTestCandidate(planId: string, date: string, cents: number, signal?: AbortSignal, report?: (stage: CanadianPreviewFailure) => void, allowCategorized=false) {
  try {
  report?.("candidate-date");
  const parsed = new Date(`${date}T00:00:00Z`); const age = Date.now() - parsed.getTime();
  if (!/^[\w-]+$/.test(planId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(age) ||
    parsed.toISOString().slice(0, 10) !== date || age < -86400000 ||
    !Number.isSafeInteger(cents) || cents <= 0 || !Number.isSafeInteger(cents * 10)) throw new Error("Invalid Canadian test candidate.");
  report?.("candidate-account");
  const base = `/plans/${encodeURIComponent(planId)}`;
  const accounts = await ynabFetch<YnabApiResponse<{ accounts: Array<{ id: string; name: string; type: string; on_budget: boolean; closed: boolean; deleted: boolean; direct_import_linked?: boolean }> }>>(`${base}/accounts`, { signal }, undefined, CANADIAN_READ);
  if (!Array.isArray(accounts?.data?.accounts)) throw new Error("Unreadable test accounts.");
  const matches = accounts.data.accounts.filter((a) => a?.name === "Lineitem Test" && a.deleted === false);
  if (matches.length !== 1) throw new Error("Expected one Lineitem Test account.");
  const a = matches[0]!;
  if (typeof a.id !== "string" || !/^[\w-]+$/.test(a.id) || a.type !== "cash" || a.on_budget !== true || a.closed !== false ||
    (a.direct_import_linked !== undefined && a.direct_import_linked !== false)) throw new Error("Lineitem Test must remain an open unlinked Cash account.");
  report?.("candidate-transactions");
  const payload = await ynabFetch<YnabApiResponse<{ transactions: Array<{ id: string; approved: boolean; cleared: string; memo: string | null; payee_id: string | null; flag_color: string | null; account_id: string; date: string; amount: number; payee_name?: string | null; category_id?: string | null; deleted: boolean; subtransactions: unknown[]; transfer_account_id?: string | null; transfer_transaction_id?: string | null; matched_transaction_id?: string | null; import_id?: string | null }> }>>(`${base}/accounts/${encodeURIComponent(a.id)}/transactions?since_date=${date}`, { signal }, undefined, CANADIAN_READ);
  if (!Array.isArray(payload?.data?.transactions)) throw new Error("Unreadable test transactions.");
  const candidates = payload.data.transactions.filter((t) => t?.deleted === false && t.date === date && t.amount === -cents * 10);
  if (candidates.length !== 1) {
    report?.(candidates.length === 0 ? "candidate-not-found" : "candidate-ambiguous");
    throw new Error("Expected exactly one transaction for the chosen date and amount.");
  }
  report?.("candidate-eligibility");
  const t = candidates[0]!;
  if (!allowCategorized && Array.isArray(t.subtransactions) && t.subtransactions.length) throw new Error("The matching transaction is already split.");
  if (!allowCategorized && typeof t.category_id === "string") throw new Error("The matching transaction already has a category.");
  if (t.account_id !== a.id || (!allowCategorized && t.category_id !== null) || !(t.category_id === null || typeof t.category_id === "string") || !Array.isArray(t.subtransactions) || (!allowCategorized && t.subtransactions.length) ||
    typeof t.payee_name !== "string" || !/^amazon(?:\.ca)?(?:\b|[ *])/i.test(t.payee_name) ||
    t.transfer_account_id != null || t.transfer_transaction_id != null || t.import_id != null || t.matched_transaction_id != null) throw new Error("The candidate must be an uncategorized, unsplit manual Amazon purchase.");
  signal?.throwIfAborted();
  return { account: a, transaction: t };
  } catch (error) {
    if (error instanceof NeedsReauthError) report?.("candidate-auth");
    else if (error instanceof YnabApiError && error.status === 429) report?.("candidate-rate-limit");
    throw error;
  }
}


/** Existing read-only callers intentionally receive no target identifiers. */
export async function findCanadianTestCandidate(planId: string, date: string, cents: number, signal?: AbortSignal, report?: (stage: CanadianPreviewFailure) => void): Promise<void> {
  await readCanadianTestCandidate(planId, date, cents, signal, report);
}

/** Background-only snapshot for a reviewed amount; still confined to Lineitem Test. */
export async function getReviewedTestTarget(planId:string,date:string,cents:number,signal:AbortSignal,report?:(stage:CanadianPreviewFailure)=>void) {
  const { account, transaction: t } = await readCanadianTestCandidate(planId, date, cents, signal, report);
  return reviewedTargetDetails(account,t);
}
/** Read-only inspection allows saved rows to be preserved when resuming an order.
 * Write helpers still require the strict uncategorized target reader above. */
export async function inspectReviewedTestCharge(planId:string,date:string,cents:number,signal:AbortSignal,report?:(stage:CanadianPreviewFailure)=>void){
 const {account,transaction}=await readCanadianTestCandidate(planId,date,cents,signal,report,true);
 return {...reviewedTargetDetails(account,transaction),eligible:transaction.category_id===null&&transaction.subtransactions.length===0};
}
function reviewedTargetDetails(account:Awaited<ReturnType<typeof readCanadianTestCandidate>>['account'],t:Awaited<ReturnType<typeof readCanadianTestCandidate>>['transaction']){
  if (typeof t.id !== "string" || !/^[\w-]+$/.test(t.id) || typeof t.approved !== "boolean" ||
      !["uncleared", "cleared"].includes(t.cleared) || !(t.memo === null || typeof t.memo === "string") ||
      !(t.payee_id === null || typeof t.payee_id === "string") ||
      !(t.flag_color === null || typeof t.flag_color === "string")) throw new Error("The test target is incomplete or reconciled.");
  return { transactionId: t.id, accountId: account.id, accountName: account.name, date: t.date,
    amount: t.amount, payeeName: t.payee_name!, payeeId: t.payee_id, memo: t.memo,
    approved: t.approved, cleared: t.cleared, flagColor: t.flag_color };
}
export type CanadianTestTarget = Awaited<ReturnType<typeof getReviewedTestTarget>>;
export type CanadianTestLine = { categoryId: string; categoryName: string; amountMilliunits: number; memo: null };

/** Only the reviewed single-target helper owns this private write capability. */
export async function writeReviewedTestSplit(planId:string,target:CanadianTestTarget,lines:CanadianTestLine[],signal:AbortSignal,beforeSend:(token:string)=>void,validateContext:()=>Promise<void>):Promise<void>{
 if(!lines.length||lines.length>202||lines.some(l=>!/^[\w-]+$/.test(l.categoryId)||!Number.isSafeInteger(l.amountMilliunits)||l.amountMilliunits>0||l.memo!==null)||new Set(lines.map(l=>l.categoryId)).size!==lines.length||!Number.isSafeInteger(target.amount)||target.amount>=0||lines.reduce((n,l)=>n+BigInt(l.amountMilliunits),BigInt(0))!==BigInt(target.amount))throw Error("Invalid reviewed split.");
  // Stored plan labels can become stale after a rename. Recheck the actual
  // destination immediately before the guarded target/context preflight.
  const plans = await getPlans(undefined, signal);
  if (plans.filter(plan => plan.id === planId && plan.name === "Test Plan").length !== 1 ||
      plans.filter(plan => plan.id === planId).length !== 1) throw new Error("The destination must still be Test Plan.");
  const fresh = await getReviewedTestTarget(planId, target.date, -target.amount / 10, signal);
  if (JSON.stringify(fresh) !== JSON.stringify(target)) throw new Error("The test transaction changed.");
  await validateContext(); signal.throwIfAborted();
  const result = await ynabFetch<YnabApiResponse<{ transaction: {
    category_id: string | null; id: string; account_id: string; date: string; amount: number; memo: string | null;
    payee_name: string; payee_id: string | null; cleared: string; approved: boolean; deleted: boolean; flag_color: string | null;
    transfer_account_id?: string | null; transfer_transaction_id?: string | null; import_id?: string | null; matched_transaction_id?: string | null;
    subtransactions: Array<{ amount: number; category_id: string; memo: string | null; deleted: boolean; payee_id?: string | null; transfer_account_id?: string | null; transfer_transaction_id?: string | null }>;
  } }>>(`/plans/${encodeURIComponent(planId)}/transactions/${encodeURIComponent(target.transactionId)}`, {
    signal, method: "PUT", body: JSON.stringify({ transaction: lines.length===1 ? {category_id:lines[0]!.categoryId,approved:target.approved} : { category_id: null, approved: target.approved,
      subtransactions: lines.map(l => ({ amount: l.amountMilliunits, category_id: l.categoryId, memo: null })) } }),
  }, undefined, REVIEW_WRITE, beforeSend);
  const t = result?.data?.transaction;
  if (!t || t.id !== target.transactionId || t.account_id !== target.accountId || t.date !== target.date ||
      t.amount !== target.amount || t.memo !== target.memo || t.payee_name !== target.payeeName || t.payee_id !== target.payeeId ||
      t.cleared !== target.cleared || t.approved !== target.approved || t.flag_color !== target.flagColor || t.deleted !== false ||
      t.transfer_account_id != null || t.transfer_transaction_id != null || t.import_id != null || t.matched_transaction_id != null ||
      !Array.isArray(t.subtransactions)) throw new Error("Could not verify the Canadian test response.");
  if(t.subtransactions.some(l=>!l||typeof l.deleted!=="boolean"))throw Error("Unreadable saved split.");
  const active = t.subtransactions.filter(l => l.deleted === false);
  if(lines.length===1){if(t.category_id!==lines[0]!.categoryId||active.length!==0)throw Error("Could not verify saved category.");return;}
  if (active.length !== lines.length || active.some(l => l.payee_id != null || l.transfer_account_id != null || l.transfer_transaction_id != null) ||
      !lines.every(l => active.filter(a => a.category_id === l.categoryId && a.amount === l.amountMilliunits && a.memo === null).length === 1)) {
    throw new Error("Could not verify the Canadian test split.");
  }
}
