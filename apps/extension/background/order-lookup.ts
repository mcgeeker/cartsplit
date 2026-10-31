import { browser } from "wxt/browser";
import { getSettings } from "@/lib/settings";
import { getRegisterPurchase } from "@/lib/ynab";
import { calendarDate, canonicalOrderUrl, registerContext, LOOKUP_COMMANDS, type RegisterPurchase, type LookupView, type LookupCandidate } from "@/lib/register-lookup";
import { sanitizeLookupPage } from "@/retailers/amazon/payment-lookup";
import { amazonCaCheckPage } from "@/retailers/amazon/storefront";
import { orderKeyFromUrl } from "@/lib/order-context";
import { requestOrderPage } from "./page-request";

const PAYMENTS = "https://www.amazon.ca/cpe/yourpayments/transactions";
const empty = (): LookupView => ({ state: "idle", pages: 0, message: "Start from an Amazon purchase in a YNAB account register.", candidates: [] });
type Search = {
  controller: AbortController; view: LookupView; planId: string; token: string; sourceTab: number; sourceUrl: string; windowId: number;
  amazonTab?: number; date?: string; cents?: number; seen: Set<string>; lastOldest?: number;
  running: boolean; advancing: boolean; previous?: string;
  history: string[]; orderPages: Map<string, number>; opening?: { orderId: string; pageIndex: number; position: number };
  task?: Promise<unknown>;
  resetBeforeRead?: boolean;
};
let current: Search | null = null;
// Reuse only a verified Payments tab in the lookup's own browser window.
const paymentTabs = new Map<number, number>();
class LookupSegmentLimit extends Error {}
function incompleteMessage(error: unknown): string {
  // Closed explanations only: storage/network exceptions may contain private data.
  const reasons: Record<string, string> = {
    "Could not prove the end of payment history.": "Amazon's next-page control could not be read safely.",
    "Could not advance payment history.": "Amazon's next-page control changed before it could be used.",
    "Payment navigation timed out.": "Amazon did not finish changing payment pages in time.",
    "Payment pagination repeated.": "Amazon repeated a payment page.",
    "Payment pagination order changed.": "Payment dates changed order across Amazon's pages.",
    "A matching payment has unreadable order or funding details.": "A matching amount was found, but its order link or card funding could not be verified.",
    "Unreadable payment page.": "Amazon returned an unreadable payment page.",
    "Unreadable or unsorted payment page.": "Amazon's payment amounts or date order could not be verified.",
    "Unsupported Amazon page.": "The Payments tab moved to an unsupported page.",
    "Lookup context changed.": "The selected plan or original register changed.",
  };
  const reason = error instanceof Error && Object.hasOwn(reasons, error.message) ? reasons[error.message] : "The page, connection, or register changed, or payment history could not be read safely.";
  return `Search incomplete. ${reason} No order was selected.`;
}
export function cancelOrderLookup() {
  if (!current) return;
  current.controller.abort(); current.view = { ...current.view, state: "canceled", message: "Lookup canceled. No YNAB transaction changed.", candidates: [] };
}
async function context(search: Search) {
  search.controller.signal.throwIfAborted();
  const settings = await getSettings();
  const source = await browser.tabs.get(search.sourceTab);
  search.controller.signal.throwIfAborted();
  if (current !== search || settings.accessToken !== search.token || settings.planId !== search.planId || source.url !== search.sourceUrl) throw Error("Lookup context changed.");
}
async function pause(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException("Canceled", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
async function pageRequest(search:Search,type:"LOOKUP_READ_PAYMENT_PAGE"|"LOOKUP_ADVANCE_PAYMENT_PAGE",deadline:number,fingerprint?:string){
  const signal=search.controller.signal;signal.throwIfAborted();
  if(Date.now()>=deadline)throw new LookupSegmentLimit();
  const controller=new AbortController(),abort=()=>controller.abort();
  signal.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(abort,Math.max(0,deadline-Date.now()));
  try{return await requestOrderPage(search.amazonTab!,controller.signal,type,fingerprint);}
  catch(error){signal.throwIfAborted();if(Date.now()>=deadline)throw new LookupSegmentLimit();throw error;}
  finally{clearTimeout(timer);signal.removeEventListener("abort",abort);}
}
async function navigatePayments(search: Search, id: number, url: string, deadline = Infinity) {
  if (Date.now() >= deadline) throw new LookupSegmentLimit();
  let started = false, timer: ReturnType<typeof setTimeout> | undefined;
  let complete!: () => void;
  const loaded = new Promise<void>((resolve, reject) => {
    complete = resolve; timer = setTimeout(() => reject(Date.now() >= deadline ? new LookupSegmentLimit() : Error("Payment navigation timed out.")), Math.min(15000, deadline - Date.now()));
  });
  const updated = (tabId: number, change: { status?: string }) => {
    if (tabId !== id) return;
    if (change.status === "loading") started = true;
    if (started && change.status === "complete") complete();
  };
  browser.tabs.onUpdated.addListener(updated);
  try {
    // update() resolves before navigation even starts in Firefox. Old
    // content is not a new first page. Keep the wait bounded, including after
    // Cancel, so a replacement lookup cannot race the pending navigation.
    await Promise.all([browser.tabs.update(id, { url, active: false }), loaded]);
    await context(search);
  } finally { clearTimeout(timer); browser.tabs.onUpdated.removeListener(updated); }
}
async function resetPaymentsPage(search: Search, id: number, deadline?: number) {
  const tab = await browser.tabs.get(id);
  await context(search);
  if (tab.windowId !== search.windowId || !["transactions", "login"].includes(amazonCaCheckPage(tab.url ?? ""))) throw Error("Payment tab changed.");
  // Pagination can leave this tab on a POST response. Reload would resubmit it;
  // navigating to the same URL may do nothing. Alternate the canonical URL and
  // Amazon's UTF-8 encoding query to force a fresh GET, never a form resend.
  await navigatePayments(search, id, tab.url === PAYMENTS ? `${PAYMENTS}?ie=UTF8` : PAYMENTS, deadline);
}
async function acquirePaymentsTab(search: Search, deadline: number): Promise<number> {
  let existing: number | undefined;
  const tracked = paymentTabs.get(search.windowId);
  if (tracked !== undefined) {
    try {
      const tab = await browser.tabs.get(tracked);
      if (tab.windowId === search.windowId && ["transactions", "login"].includes(amazonCaCheckPage(tab.url ?? ""))) existing = tracked;
    } catch { /* Closed tabs are replaced, never assumed to still be Payments. */ }
  }
  if (existing === undefined) {
    paymentTabs.delete(search.windowId);
    const tabs = await browser.tabs.query({ windowId: search.windowId });
    existing = tabs.find(tab => tab.windowId === search.windowId && amazonCaCheckPage(tab.url ?? "") === "transactions")?.id;
  }
  await context(search);
  // Every fresh lookup starts at page one so competing matches cannot be missed.
  if (existing !== undefined) { await resetPaymentsPage(search, existing, deadline); paymentTabs.set(search.windowId, existing); return existing; }
  const tab = await browser.tabs.create({ url: "about:blank", windowId: search.windowId, active: false });
  if (tab?.id === undefined) throw Error("Could not open payment tab.");
  paymentTabs.set(search.windowId, tab.id);
  await navigatePayments(search, tab.id, PAYMENTS, deadline);
  return tab.id;
}
async function readPage(search: Search, segmentDeadline: number) {
  const signal = search.controller.signal;
  // Wait for navigation/async pagination, never interpret the previous page as new.
  const deadline = Math.min(Date.now() + 15000,segmentDeadline);
  while (Date.now() < deadline) {
    await context(search);
    const tab = await browser.tabs.get(search.amazonTab!);
    // A new Firefox tab can still report about:blank while navigating to the
    // requested Payments URL. Wait within the existing deadline before reading
    // or validating the final destination; never read an unsupported URL.
    if (tab.status === "loading") { await pause(200, signal); continue; }
    if (amazonCaCheckPage(tab.url ?? "") === "login") {
      search.view = { ...search.view, state: "signin", message: "Sign in to Amazon, then return here and choose Resume." };
      return null;
    }
    if (amazonCaCheckPage(tab.url ?? "") !== "transactions") throw Error("Unsupported Amazon page.");
    let raw: unknown;
    try { raw = await pageRequest(search,"LOOKUP_READ_PAYMENT_PAGE",segmentDeadline); }
    catch(error) { signal.throwIfAborted();if(error instanceof LookupSegmentLimit)throw error; await pause(200, signal); continue; }
    const failure = (raw as { lookupFailure?: string })?.lookupFailure;
    if (failure === "loading" || search.advancing && failure === "unreadable") { await pause(200, signal); continue; }
    const page = sanitizeLookupPage(raw);
    if (search.advancing && page.fingerprint === search.previous) { await pause(200, signal); continue; }
    return page;
  }
  if(Date.now()>=segmentDeadline)throw new LookupSegmentLimit();
  throw Error("Payment navigation timed out.");
}
async function finishOpen(search: Search, orderId: string) {
  await context(search);
  const url = canonicalOrderUrl(orderId);
  const tabs = await browser.tabs.query({ windowId: search.windowId });
  await context(search);
  const existing = tabs.find(tab => orderKeyFromUrl(tab.url) === orderId);
  if (existing?.id !== undefined) await browser.tabs.update(existing.id, { active: true });
  else await browser.tabs.create({ url, windowId: search.windowId, active: true });
  await browser.windows.update(search.windowId, { focused: true });
  search.view = { ...search.view, state: "opened", message: "Amazon order opened. Choose Review selected order in CartSplit when ready." };
}
/** Return the dedicated payments tab to the chosen order's freshly verified page.
 * Searching the whole date window can otherwise leave it on an older page. */
async function positionAndOpen(search: Search,deadline=Date.now()+120000,pageLimit=50) {
  let pages=0;
  while(search.opening){
    await context(search);
    if(pages>=pageLimit||Date.now()>=deadline){search.view={...search.view,state:"paused",message:"Returning to the matched payment page. Choose Continue to finish opening the order."};return;}
    const page=await readPage(search,deadline);await context(search);if(!page)return;
    const opening=search.opening;
    if(page.fingerprint!==search.history[opening.position])throw Error("Payment history changed while returning to the matched page.");
    pages++;search.advancing=false;
    if(opening.position===opening.pageIndex){delete search.opening;await finishOpen(search,opening.orderId);return;}
    if(page.next!=="available")throw Error("Matched payment page is no longer available.");
    search.previous=page.fingerprint;search.advancing=true;
    const result=await pageRequest(search,"LOOKUP_ADVANCE_PAYMENT_PAGE",deadline,page.fingerprint) as {ok?:unknown};
    if(result?.ok!==true)throw Error("Could not return to the payment page.");
    opening.position++;
  }
}
async function openCandidate(search: Search, orderId: string,deadline=Date.now()+120000,pageLimit=50) {
  await context(search);
  const pageIndex=search.orderPages.get(orderId);
  if(pageIndex===undefined)throw Error("Matched payment page is missing.");
  if(search.previous===search.history[pageIndex]&&!search.advancing){await finishOpen(search,orderId);return;}
  search.opening={orderId,pageIndex,position:0};
  search.view={...search.view,state:"searching",message:"Returning to the matched payment page before opening the order…"};
  // The canonical URL starts at the latest payments page. Replay only the
  // already verified pagination sequence, checking every page identity again.
  search.advancing=true;
  await resetPaymentsPage(search, search.amazonTab!, deadline);
  await positionAndOpen(search,deadline,pageLimit);
}
export function lookupPaymentsForOrder(orderId:string):number|undefined{
  return current?.view.state==="opened"&&current.view.candidates.some(c=>c.orderId===orderId)?current.amazonTab:undefined;
}
async function run(search: Search) {
  if (search.running) return;
  search.running = true; const start = Date.now(); let pages = 0;
  search.view = { ...search.view, state: "searching", message: "Searching Amazon payment pages…" };
  try {
    await context(search);
    if(search.opening){await positionAndOpen(search,start+120000);return;}
    if(search.resetBeforeRead && search.amazonTab !== undefined){await resetPaymentsPage(search,search.amazonTab,start+120000);delete search.resetBeforeRead;}
    if (search.amazonTab === undefined) {
      search.amazonTab = await acquirePaymentsTab(search,start+120000);
    }
    while (true) {
      await context(search);
      if (pages >= 50 || Date.now() - start >= 120000) {
        search.view = { ...search.view, state: "paused", message: "Search segment complete; the date window is not fully checked. Choose Continue." }; return;
      }
      const page = await readPage(search,start+120000);
      await context(search);
      if (!page) return;
      if (search.seen.has(page.fingerprint)) throw Error("Payment pagination repeated.");
      const newest = calendarDate(page.rows[0]!.date)!, oldest = calendarDate(page.rows.at(-1)!.date)!;
      if (search.lastOldest !== undefined && newest > search.lastOldest) throw Error("Payment pagination order changed.");
      search.seen.add(page.fingerprint); search.lastOldest = oldest; search.advancing = false;
      const pageIndex=search.history.length;search.history.push(page.fingerprint);search.previous=page.fingerprint;
      const day = calendarDate(search.date)!;
      const candidates = [...search.view.candidates];
      for (const row of page.rows) if (row.amountCents === search.cents && Math.abs(calendarDate(row.date)! - day) <= 2 * 86400000 && !row.refund && row.funding !== "gift_card") {
        if (!row.orderId || row.funding !== "card") throw Error("A matching payment has unreadable order or funding details.");
        if (!candidates.some(c => c.orderId === row.orderId && c.date === row.date && c.cents === row.amountCents)) candidates.push({ orderId: row.orderId, date: row.date, cents: row.amountCents });
        search.orderPages.set(row.orderId,pageIndex);
      }
      pages++; search.view = { state: "searching", pages: search.view.pages + 1, candidates, message: "Checking the complete payment-date window…" };
      if (oldest < day - 2 * 86400000 || page.next === "end") {
        await context(search);
        const orders = new Set(candidates.map(c => c.orderId));
        if (orders.size === 1) await openCandidate(search, candidates[0]!.orderId,start+120000,50-pages);
        else search.view = { ...search.view, state: orders.size ? "choices" : "missing", message: orders.size ? "Several orders match. Choose the order to open." : "No matching card payment was found in the complete date window." };
        return;
      }
      if (page.next !== "available") throw Error("Could not prove the end of payment history.");
      search.previous = page.fingerprint; search.advancing = true;
      const advanced = await pageRequest(search,"LOOKUP_ADVANCE_PAYMENT_PAGE",start+120000,page.fingerprint) as { ok?: unknown };
      if (advanced?.ok !== true) throw Error("Could not advance payment history.");
    }
  } catch(error) {
    if (current === search && !search.controller.signal.aborted) search.view = error instanceof LookupSegmentLimit?{...search.view,state:"paused",message:"Search segment reached 120 seconds. Choose Continue to resume the incomplete search."}:{ ...search.view, state: "stopped", message: incompleteMessage(error), candidates: [] };
  } finally { search.running = false; }
}
type Sender = { id?: string; url?: string; frameId?: number; tab?: { id?: number; url?: string; windowId?: number } };
export async function handleLookupMessage(message: unknown, sender: Sender): Promise<unknown> {
  const request = message as { type?: unknown; purchase?: RegisterPurchase; orderId?: unknown };
  if (!request || typeof request.type !== "string" || !LOOKUP_COMMANDS.has(request.type) || sender.id !== browser.runtime.id) throw Error("Invalid lookup request.");
  if (request.type === "LOOKUP_START") {
    if (sender.frameId !== 0 || sender.tab?.id === undefined || sender.tab.windowId === undefined || !sender.url) throw Error("Use a YNAB account register.");
    const route = registerContext(sender.url), settings = await getSettings();
    const tab = await browser.tabs.get(sender.tab.id);
    if (!route || tab.url !== sender.url || !settings.accessToken || settings.planId !== route.planId || request.purchase?.planId !== route.planId || request.purchase?.accountId !== route.accountId) throw Error("Select the matching plan in CartSplit.");
    // A normal web-page click cannot open Firefox's sidebar. Report its state so
    // the register can prompt the owner if needed; never create a progress tab.
    const firefox = browser as typeof browser & { sidebarAction?: { isOpen: (details: { windowId: number }) => Promise<boolean> } };
    const sidebarOpen = await firefox.sidebarAction?.isOpen({ windowId: sender.tab.windowId }).catch(() => false) ?? false;
    if (current && !["idle", "opened", "missing", "stopped", "canceled"].includes(current.view.state)) {
      return { ok: true, sidebarOpen, busy: true };
    }
    const previous = current;
    cancelOrderLookup();
    const search: Search = { controller: new AbortController(), view: { ...empty(), state: "searching", message: "Validating the selected YNAB purchase…" }, planId: route.planId, token: settings.accessToken, sourceTab: sender.tab.id, sourceUrl: sender.url, windowId: sender.tab.windowId, seen: new Set(), history:[],orderPages:new Map(),running: true, advancing: false };
    current = search;
    try {
      // Let an older canceled navigation settle before reusing the same tab.
      await previous?.task?.catch(() => {});
      const target = await getRegisterPurchase(request.purchase!, search.controller.signal);
      await context(search); search.date = target.date; search.cents = target.cents;
      search.running = false; search.task = run(search); return { ok: true, sidebarOpen };
    } catch { search.running = false; search.view = { ...empty(), state: "stopped", message: "Could not validate this purchase. Check the selected CAD plan and refresh YNAB." }; throw Error("Could not validate purchase."); }
  }
  const sidebar = sender.url === browser.runtime.getURL("/sidepanel.html") && sender.tab === undefined;
  const lookupUrl = browser.runtime.getURL("/order-lookup.html");
  if ((!sidebar && sender.url !== lookupUrl) || (sender.frameId !== undefined && sender.frameId !== 0)) throw Error("Use the CartSplit lookup interface.");
  // Firefox supplies tab metadata when this extension page is opened in a tab.
  // Verify that actual tab instead of rejecting our own lookup interface.
  if (sender.tab !== undefined) {
    if (sender.frameId !== 0 || sender.tab.id === undefined || (sender.tab.url !== undefined && sender.tab.url !== lookupUrl)) throw Error("Use the CartSplit lookup page.");
    const tab = await browser.tabs.get(sender.tab.id);
    if (tab.url !== lookupUrl) throw Error("Use the CartSplit lookup page.");
  }
  if (request.type === "LOOKUP_STATUS") return { lookup: structuredClone(current?.view ?? empty()) };
  if (!current) return { ok: true };
  const search = current;
  if (request.type === "LOOKUP_CANCEL") { cancelOrderLookup(); return { ok: true }; }
  // Presentation only: preserve completed lookup evidence for the review and
  // never hide an active search, its choices, or its cancellation controls.
  if (request.type === "LOOKUP_DISMISS") {
    if (search.view.state === "opened") search.view = { ...search.view, dismissed: true };
    return { ok: true };
  }
  await context(search);
  if (request.type === "LOOKUP_CONTINUE" && ["paused", "signin"].includes(search.view.state)) {
    // Sign-in can reset Amazon to its first page. Recheck from the start rather
    // than combining pages from two different sessions or treating them as a loop.
    if(search.view.state === "signin") {
      search.seen.clear();search.history=[];search.orderPages.clear();delete search.opening; search.lastOldest=undefined; search.previous=undefined; search.advancing=false; search.view={...search.view,pages:0,candidates:[]};
      // An auth redirect may return to an older page; resume coverage from the
      // canonical first page so newer competing matches cannot be missed.
      if(search.amazonTab!==undefined)search.resetBeforeRead=true;
    }
    search.task = run(search); return { ok: true };
  }
  if (request.type === "LOOKUP_SIGNIN" && search.view.state === "signin" && search.amazonTab !== undefined) { await browser.tabs.update(search.amazonTab, { active: true }); return { ok: true }; }
  if (request.type === "LOOKUP_OPEN" && !search.running && search.view.state === "choices" && typeof request.orderId === "string" && search.view.candidates.some((c: LookupCandidate) => c.orderId === request.orderId)) {
    search.running=true;
    const open = (async () => {
    try{await openCandidate(search,request.orderId as string);return {ok:true};}
    catch(error){if(error instanceof LookupSegmentLimit){search.view={...search.view,state:"paused",message:"Returning to the matched payment page reached 120 seconds. Choose Continue."};return {ok:true};}if(!search.controller.signal.aborted)search.view={...search.view,state:"stopped",message:"The matching payment page could not be restored. Start a fresh lookup.",candidates:[]};throw Error("Could not open order.");}
    finally{search.running=false;}
    })();
    search.task = open;
    return open;
  }
  throw Error("Lookup action unavailable.");
}
export function createLookupListener() {
  return (message: unknown, sender: Sender, respond: (value: unknown) => void) => {
    if (!message || typeof message !== "object" || !LOOKUP_COMMANDS.has((message as { type: string }).type)) return false;
    handleLookupMessage(message, sender).then(respond).catch(() => respond({ error: "Lookup could not continue. Check the selected CartSplit plan and start again from YNAB." }));
    return true;
  };
}
