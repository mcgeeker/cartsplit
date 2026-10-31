import type { CanadianPreviewFailure } from "./canadian-preview-status";
import type { Category } from "./types";
import { getValidAccessToken, NeedsReauthError } from "./auth";
import { CONNECTION_CHECK_MESSAGE } from "./verification";
import { calendarDate, isIdentifier, isAmazonPayee, type RegisterPurchase } from "./register-lookup";
import { validMemo } from "./purchase-memos";

const BASE_URL = "https://api.ynab.com/v1";
const INTERNAL_CATEGORY_GROUP = "Internal Master Category";
const DAY_MS = 86400000;
const PAYMENT_DATE_VARIANCE_MS = 2 * DAY_MS;

/** Calendar days use UTC so month/year boundaries and local DST cannot shift a match. */
function calendarDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
// Private capabilities: only the reviewed target reader/writer below can use them.
const CANADIAN_READ = Symbol("canadian-single-candidate-read");
const REVIEW_WRITE = Symbol("reviewed-purchase-write");
const LOOKUP_READ = Symbol("register-read-only");

interface YnabCategoryGroup {
  id?: string;
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
  scope?: typeof CANADIAN_READ | typeof REVIEW_WRITE | typeof LOOKUP_READ, beforeSend?: (token: string) => void): Promise<T> {
  const method = options?.method ?? "GET";
  const allowedRead = method === "GET" &&
    (path === "/plans" || /^\/plans\/[^/]+\/categories$/.test(path) ||
      (scope === CANADIAN_READ && (/^\/plans\/[^/]+\/accounts$/.test(path) ||
        /^\/plans\/[^/]+\/transactions\?since_date=\d{4}-\d{2}-\d{2}$/.test(path))) ||
      (scope === LOOKUP_READ && /^\/plans\/[\w-]+\/(?:accounts|transactions\/[\w-]+|transactions\?since_date=\d{4}-\d{2}-\d{2})$/.test(path)));
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
  currencyCode?: string;
}

/** A supplied token is used only by background onboarding validation. Never
 * choose the first budget or rely on OAuth's default-plan selection. */
export async function getPlans(suppliedToken?: string, signal?: AbortSignal): Promise<YnabPlan[]> {
  const payload = await ynabFetch<YnabApiResponse<{ plans: (YnabPlan & {currency_format?: {iso_code?: string} | null})[] }>>("/plans", { signal }, suppliedToken);
  const plans = payload?.data?.plans;
  if (!Array.isArray(plans) || plans.some((p) => !p || typeof p.id !== "string" || !p.id || typeof p.name !== "string")) {
    throw new Error("YNAB returned an unreadable budget list. Try again.");
  }
  return plans.map((p) => ({ id: p.id, name: p.name,
    ...(typeof p.currency_format?.iso_code === "string" ? {currencyCode: p.currency_format.iso_code} : {}) }));
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
      result.push({ id: category.id, name: category.name, groupName: group.name,
        ...(typeof group.id === "string" ? { groupId: group.id } : {}) });
    }
  }
  return result;
}

// Preserve the typed authentication error at the transport boundary.
export { NeedsReauthError } from "./auth";

async function readCanadianCandidate(planId: string, date: string, cents: number, signal?: AbortSignal, report?: (stage: CanadianPreviewFailure) => void, allowCategorized=false) {
  try {
  report?.("candidate-date");
  const paymentDay = calendarDay(date);
  if (!/^[\w-]+$/.test(planId) || paymentDay === null || Date.now() - paymentDay < -DAY_MS ||
    !Number.isSafeInteger(cents) || cents <= 0 || !Number.isSafeInteger(cents * 10)) throw new Error("Invalid Canadian purchase candidate.");
  const sinceDate = new Date(paymentDay - PAYMENT_DATE_VARIANCE_MS).toISOString().slice(0, 10);
  if (calendarDay(sinceDate) === null) throw new Error("Invalid Canadian purchase date window.");
  report?.("candidate-budget");
  const plans = (await getPlans(undefined, signal)).filter(plan => plan.id === planId);
  if (plans.length !== 1) throw new Error("The selected YNAB plan is missing or ambiguous.");
  report?.("candidate-currency");
  if (plans[0]!.currencyCode !== "CAD") throw new Error("Select a YNAB plan with verified CAD currency.");
  report?.("candidate-account");
  const base = `/plans/${encodeURIComponent(planId)}`;
  const accounts = await ynabFetch<YnabApiResponse<{ accounts: Array<{ id: string; name: string; type: string; on_budget: boolean; closed: boolean; deleted: boolean; direct_import_linked?: boolean }> }>>(`${base}/accounts`, { signal }, undefined, CANADIAN_READ);
  if (!Array.isArray(accounts?.data?.accounts) || accounts.data.accounts.length > 1000 || accounts.data.accounts.some(a => !a ||
      typeof a.id !== "string" || !/^[\w-]+$/.test(a.id) || typeof a.name !== "string" || !a.name.trim() || typeof a.type !== "string" ||
      typeof a.deleted !== "boolean" || typeof a.closed !== "boolean" || typeof a.on_budget !== "boolean" ||
      (a.direct_import_linked !== undefined && typeof a.direct_import_linked !== "boolean"))) throw new Error("Unreadable YNAB accounts.");
  const matches = accounts.data.accounts.filter(a => a && a.deleted === false && a.closed === false && a.on_budget === true &&
    ["cash", "checking", "savings", "creditCard"].includes(a.type));
  if (!matches.length || matches.some(a => typeof a.id !== "string" || !/^[\w-]+$/.test(a.id) || typeof a.name !== "string" || !a.name.trim()) ||
      new Set(accounts.data.accounts.map(a => a?.id)).size !== accounts.data.accounts.length) throw new Error("Could not validate open on-budget bank or card accounts.");
  report?.("candidate-transactions");
  const payload = await ynabFetch<YnabApiResponse<{ transactions: Array<{ id: string; approved: boolean; cleared: string; memo: string | null; payee_id: string | null; flag_color: string | null; account_id: string; date: string; amount: number; payee_name?: string | null; category_id?: string | null; deleted: boolean; subtransactions: unknown[]; transfer_account_id?: string | null; transfer_transaction_id?: string | null; matched_transaction_id?: string | null; import_id?: string | null }> }>>(`${base}/transactions?since_date=${sinceDate}`, { signal }, undefined, CANADIAN_READ);
  if (!Array.isArray(payload?.data?.transactions) || payload.data.transactions.length > 50000) throw new Error("Unreadable or oversized YNAB transaction list.");
  const candidates = payload.data.transactions.filter(t => {
    const day = calendarDay(t?.date);
    return t?.deleted === false && day !== null && Math.abs(day - paymentDay) <= PAYMENT_DATE_VARIANCE_MS && t.amount === -cents * 10 &&
      matches.some(a => a.id === t.account_id) && typeof t.payee_name === "string" && /^(?:amazon(?:\.ca)?|amzn)(?:\b|[ *])/i.test(t.payee_name);
  });
  if (candidates.length !== 1) {
    report?.(candidates.length === 0 ? "candidate-not-found" : "candidate-ambiguous");
    throw new Error("Expected exactly one transaction within two days of the payment date for the exact amount.");
  }
  report?.("candidate-eligibility");
  const t = candidates[0]!;
  const a = matches.find(account => account.id === t.account_id)!;
  if (!allowCategorized && Array.isArray(t.subtransactions) && t.subtransactions.length) throw new Error("The matching transaction is already split.");
  if (!allowCategorized && typeof t.category_id === "string") throw new Error("The matching transaction already has a category.");
  if (t.account_id !== a.id || (!allowCategorized && t.category_id !== null) || !(t.category_id === null || typeof t.category_id === "string") || !Array.isArray(t.subtransactions) || (!allowCategorized && t.subtransactions.length) ||
    t.transfer_account_id != null || t.transfer_transaction_id != null ||
    (t.import_id != null && typeof t.import_id !== "string") || (t.matched_transaction_id != null && typeof t.matched_transaction_id !== "string")) throw new Error("The candidate must be an uncategorized, unsplit Amazon purchase without transfers.");
  signal?.throwIfAborted();
  return { planName: plans[0]!.name, account: a, transaction: t };
  } catch (error) {
    if (error instanceof NeedsReauthError) report?.("candidate-auth");
    else if (error instanceof YnabApiError && error.status === 429) report?.("candidate-rate-limit");
    throw error;
  }
}


/** Existing read-only callers intentionally receive no target identifiers. */
export async function findCanadianCandidate(planId: string, date: string, cents: number, signal?: AbortSignal, report?: (stage: CanadianPreviewFailure) => void): Promise<void> {
  await readCanadianCandidate(planId, date, cents, signal, report);
}

/** Background-only snapshot bound to the selected CAD plan and exact account. */
export async function getReviewedTarget(planId:string,date:string,cents:number,signal:AbortSignal,report?:(stage:CanadianPreviewFailure)=>void) {
  const { planName, account, transaction: t } = await readCanadianCandidate(planId, date, cents, signal, report);
  return {planName,paymentDate:date,...reviewedTargetDetails(account,t)};
}
/** Read-only inspection allows saved rows to be preserved when resuming an order.
 * Write helpers still require the strict uncategorized target reader above. */
export async function inspectReviewedCharge(planId:string,date:string,cents:number,signal:AbortSignal,report?:(stage:CanadianPreviewFailure)=>void){
 const {planName,account,transaction}=await readCanadianCandidate(planId,date,cents,signal,report,true);
 return {planName,paymentDate:date,...reviewedTargetDetails(account,transaction),eligible:transaction.category_id===null&&transaction.subtransactions.length===0};
}
function reviewedTargetDetails(account:Awaited<ReturnType<typeof readCanadianCandidate>>['account'],t:Awaited<ReturnType<typeof readCanadianCandidate>>['transaction']){
  if (typeof t.id !== "string" || !/^[\w-]+$/.test(t.id) || typeof t.approved !== "boolean" ||
      !["uncleared", "cleared"].includes(t.cleared) || !(t.memo === null || typeof t.memo === "string") ||
      !(t.payee_id === null || typeof t.payee_id === "string") ||
      !(t.flag_color === null || typeof t.flag_color === "string")) throw new Error("The target is incomplete or reconciled.");
  return { transactionId: t.id, accountId: account.id, accountName: account.name, date: t.date,
    amount: t.amount, payeeName: t.payee_name!, payeeId: t.payee_id, memo: t.memo,
    approved: t.approved, cleared: t.cleared, flagColor: t.flag_color,
    importId: t.import_id ?? null, matchedTransactionId: t.matched_transaction_id ?? null };
}
/** Lookup permits categorized/split/reconciled purchases, but owns no write capability. */
export async function getRegisterPurchase(input: RegisterPurchase, signal: AbortSignal) {
  if (!input || !isIdentifier(input.planId) || !isIdentifier(input.accountId) || !isAmazonPayee(input.payee) || !Number.isSafeInteger(input.cents) || input.cents <= 0 || !Number.isSafeInteger(input.cents * 10) ||
      (input.transactionId !== undefined ? !isIdentifier(input.transactionId) : calendarDate(input.date) === null)) throw Error("Unreadable register purchase.");
  const plans = (await getPlans(undefined, signal)).filter(plan => plan.id === input.planId && plan.currencyCode === "CAD");
  if (plans.length !== 1) throw Error("Select the matching CAD plan in CartSplit.");
  const base = `/plans/${input.planId}`;
  const accounts = await ynabFetch<YnabApiResponse<{ accounts: { id: string; type: string; deleted: boolean; closed: boolean; on_budget: boolean }[] }>>(`${base}/accounts`, { signal }, undefined, LOOKUP_READ);
  if (!Array.isArray(accounts?.data?.accounts) || accounts.data.accounts.length > 1000) throw Error("Unreadable account list.");
  const account = accounts.data.accounts.filter(a => a?.id === input.accountId);
  if (account.length !== 1 || account[0]!.deleted !== false || account[0]!.closed !== false || account[0]!.on_budget !== true || !["cash", "checking", "savings", "creditCard"].includes(account[0]!.type)) throw Error("Use a supported open on-budget account.");
  type LookupTransaction = { id: string; account_id: string; date: string; amount: number; payee_name: string; deleted: boolean; transfer_account_id?: string | null; transfer_transaction_id?: string | null };
  let rows: LookupTransaction[];
  if (input.transactionId) {
    const result = await ynabFetch<YnabApiResponse<{ transaction: LookupTransaction }>>(`${base}/transactions/${input.transactionId}`, { signal }, undefined, LOOKUP_READ);
    rows = [result?.data?.transaction];
  } else {
    const result = await ynabFetch<YnabApiResponse<{ transactions: LookupTransaction[] }>>(`${base}/transactions?since_date=${input.date}`, { signal }, undefined, LOOKUP_READ);
    if (!Array.isArray(result?.data?.transactions) || result.data.transactions.length > 50000) throw Error("Unreadable transaction list.");
    rows = result.data.transactions.filter(t => t?.date === input.date);
  }
  const matches = rows.filter(t => t && isIdentifier(t.id) && (!input.transactionId || t.id === input.transactionId) && t.account_id === input.accountId && t.deleted === false &&
    t.amount === -input.cents * 10 && isAmazonPayee(t.payee_name) && t.payee_name.trim() === input.payee.trim() && calendarDate(t.date) !== null && t.transfer_account_id == null && t.transfer_transaction_id == null);
  if (matches.length !== 1) throw Error("The register purchase changed or is ambiguous. Refresh YNAB and try again.");
  return { date: matches[0]!.date, cents: input.cents };
}
export type ReviewedTarget = Awaited<ReturnType<typeof getReviewedTarget>>;
export type ReviewedLine = { categoryId: string; categoryName: string; amountMilliunits: number; memo: string | null };

/** Only the reviewed single-target helper owns this private write capability. */
export async function writeReviewedSplit(planId:string,target:ReviewedTarget,lines:ReviewedLine[],signal:AbortSignal,beforeSend:(token:string)=>void,validateContext:()=>Promise<void>,parentMemo?:string|null):Promise<void>{
 if(!lines.length||lines.length>202||lines.some(l=>!/^[\w-]+$/.test(l.categoryId)||!Number.isSafeInteger(l.amountMilliunits)||l.amountMilliunits>=0||!validMemo(l.memo))||(parentMemo!==undefined&&!validMemo(parentMemo))||!Number.isSafeInteger(target.amount)||target.amount>=0||lines.reduce((n,l)=>n+BigInt(l.amountMilliunits),BigInt(0))!==BigInt(target.amount))throw Error("Invalid reviewed split.");
  // Recheck plan membership/currency, account eligibility and the complete target.
  // A rename or changed import/match metadata requires a new review.
  // Keep the search anchored to Amazon's original date at every check; using the
  // matched YNAB date here would silently move the permitted window.
  const fresh = await getReviewedTarget(planId, target.paymentDate, -target.amount / 10, signal);
  if (JSON.stringify(fresh) !== JSON.stringify(target)) throw new Error("The transaction changed.");
  await validateContext(); signal.throwIfAborted();
  const result = await ynabFetch<YnabApiResponse<{ transaction: {
    category_id: string | null; category_name?: string | null; id: string; account_id: string; date: string; amount: number; memo: string | null;
    payee_name: string; payee_id: string | null; cleared: string; approved: boolean; deleted: boolean; flag_color: string | null;
    transfer_account_id?: string | null; transfer_transaction_id?: string | null; import_id?: string | null; matched_transaction_id?: string | null;
    subtransactions: Array<{ amount: number; category_id: string; memo: string | null; deleted: boolean; payee_id?: string | null; transfer_account_id?: string | null; transfer_transaction_id?: string | null }>;
  } }>>(`/plans/${encodeURIComponent(planId)}/transactions/${encodeURIComponent(target.transactionId)}`, {
    signal, method: "PUT", body: JSON.stringify({ transaction: { ...(parentMemo!==undefined?{memo:parentMemo}:{}), ...(lines.length===1 ? {category_id:lines[0]!.categoryId,approved:target.approved} : { category_id: null, approved: target.approved,
      subtransactions: lines.map(l => ({ amount: l.amountMilliunits, category_id: l.categoryId, memo: l.memo })) }) } }),
  }, undefined, REVIEW_WRITE, beforeSend);
  const t = result?.data?.transaction;
  if (!t || t.id !== target.transactionId || t.account_id !== target.accountId || t.date !== target.date ||
      t.amount !== target.amount || t.memo !== (parentMemo!==undefined?parentMemo:target.memo) || t.payee_name !== target.payeeName || t.payee_id !== target.payeeId ||
      t.cleared !== target.cleared || t.approved !== target.approved || t.flag_color !== target.flagColor || t.deleted !== false ||
      t.transfer_account_id != null || t.transfer_transaction_id != null || (t.import_id ?? null) !== target.importId || (t.matched_transaction_id ?? null) !== target.matchedTransactionId ||
      !Array.isArray(t.subtransactions)) throw new Error("Could not verify the YNAB response.");
  if(t.subtransactions.some(l=>!l||typeof l.deleted!=="boolean"))throw Error("Unreadable saved split.");
  const active = t.subtransactions.filter(l => l.deleted === false);
  if(lines.length===1){if(t.category_id!==lines[0]!.categoryId||active.length!==0)throw Error("Could not verify saved category.");return;}
  const expectedLines=lines.map(l=>JSON.stringify([l.categoryId,l.amountMilliunits,l.memo])).sort();
  const actualLines=active.map(l=>JSON.stringify([l.category_id,l.amount,l.memo])).sort();
  // A split is requested with category_id: null, but YNAB can return its internal
  // category ID labelled "Split". Its complete child allocation must still match.
  const splitCategoryMatches = t.category_id === null || isIdentifier(t.category_id) && t.category_name === "Split";
  if (!splitCategoryMatches || active.length !== lines.length || active.some(l => l.payee_id != null || l.transfer_account_id != null || l.transfer_transaction_id != null) ||
      JSON.stringify(expectedLines)!==JSON.stringify(actualLines)) {
    throw new Error("Could not verify the YNAB split.");
  }
}
