import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { paymentPageFingerprint } from "@/retailers/amazon/payment-lookup";
const io = vi.hoisted(() => ({ settings: vi.fn(), purchase: vi.fn(), page: vi.fn(), get: vi.fn(), create: vi.fn(), query: vi.fn(), update: vi.fn(), reload:vi.fn(), focus:vi.fn(),sidebarOpen:vi.fn(),listeners:new Set<(id:number,change:{status:string})=>void>() }));
vi.mock("@/lib/settings", () => ({ getSettings: io.settings }));
vi.mock("@/lib/ynab", () => ({ getRegisterPurchase: io.purchase }));
vi.mock("./page-request", () => ({ requestOrderPage: io.page }));
vi.mock("wxt/browser", () => ({ browser: { runtime: { id: "test-extension", getURL: (path: string) => "moz-extension://test" + path }, tabs: { get: io.get, create: io.create, query: io.query, update: io.update,reload:io.reload,onUpdated:{addListener:(fn:typeof io.listeners extends Set<infer T>?T:never)=>io.listeners.add(fn),removeListener:(fn:typeof io.listeners extends Set<infer T>?T:never)=>io.listeners.delete(fn)} },windows:{update:io.focus},sidebarAction:{isOpen:io.sidebarOpen} } }));
let service: typeof import("./order-lookup");
const source = "https://app.ynab.com/test-plan/accounts/test-account";
const sender = { id: "test-extension", url: source, frameId: 0, tab: { id: 1, windowId: 3 } };
const ui = { id: "test-extension", url: "moz-extension://test/order-lookup.html" };
const request = { type: "LOOKUP_START", purchase: { planId: "test-plan", accountId: "test-account", transactionId: "test-tx", cents: 1130, payee: "Amazon.ca" } };
function page(orderId = "synthetic", date = "2026-10-22", next = "end", extra = {}) {
  const rows = [{ date, amountCents: 1130, orderId, refund: false, currency: "CAD", funding: "card", ...extra }];
  return { rows, next, fingerprint: paymentPageFingerprint(rows as import("@/retailers/amazon/ca-preview").CaPayment[]) };
}
const status = async () => (await service.handleLookupMessage({ type: "LOOKUP_STATUS" }, ui) as { lookup: import("@/lib/register-lookup").LookupView }).lookup;
function navigated(id:number){queueMicrotask(()=>{for(const fn of io.listeners)fn(id,{status:'loading'});for(const fn of io.listeners)fn(id,{status:'complete'});});}
beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks();io.listeners.clear(); service = await import("./order-lookup");
  io.settings.mockResolvedValue({ accessToken: "test-only-token", planId: "test-plan" }); io.purchase.mockResolvedValue({ date: "2026-10-22", cents: 1130 });
  io.get.mockImplementation(async (id: number) => ({ id,windowId:3, url: id === 1 ? source : "https://www.amazon.ca/cpe/yourpayments/transactions", status: "complete" }));
  io.create.mockResolvedValue({ id: 2 }); io.query.mockResolvedValue([]); io.update.mockImplementation(async(id:number,change:{url?:string})=>{if(change.url)navigated(id);return{id,windowId:3};}); io.page.mockResolvedValue(page());io.focus.mockResolvedValue({});io.sidebarOpen.mockResolvedValue(true);io.reload.mockImplementation(async(id:number)=>{navigated(id);});
});
afterEach(() => { service.cancelOrderLookup(); vi.useRealTimers(); });
async function start() { await service.handleLookupMessage(request, sender); }
it("accepts lookup status from the actual top-level extension tab Firefox supplies",async()=>{
 const tabUi={...ui,frameId:0,tab:{id:40,url:ui.url,windowId:3}};
 io.get.mockResolvedValueOnce({id:40,url:ui.url});
 await expect(service.handleLookupMessage({type:'LOOKUP_STATUS'},tabUi)).resolves.toMatchObject({lookup:{state:'idle'}});
 expect(io.purchase).not.toHaveBeenCalled();expect(io.settings).not.toHaveBeenCalled();
});
it('accepts sidebar lookup controls without granting them to web-page tabs',async()=>{
 const sidebar={id:ui.id,url:'moz-extension://test/sidepanel.html'};
 await expect(service.handleLookupMessage({type:'LOOKUP_STATUS'},sidebar)).resolves.toMatchObject({lookup:{state:'idle'}});
 await expect(service.handleLookupMessage({type:'LOOKUP_STATUS'},{...sidebar,tab:{id:8},frameId:0})).rejects.toThrow();
 await expect(service.handleLookupMessage({type:'LOOKUP_STATUS'},{...sidebar,frameId:1})).rejects.toThrow();
});
it('dismisses completed progress from review without discarding lookup evidence, then resets for the next lookup',async()=>{
 const sidebar={id:ui.id,url:'moz-extension://test/sidepanel.html'};
 await start();await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 const opened=await status();await service.handleLookupMessage({type:'LOOKUP_DISMISS'},sidebar);
 expect(await status()).toEqual({...opened,dismissed:true});expect(io.purchase).toHaveBeenCalledOnce();
 await start();await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 expect((await status()).dismissed).toBeUndefined();
 await expect(service.handleLookupMessage({type:'LOOKUP_DISMISS'},sender)).rejects.toThrow();
});
it('keeps active search controls visible when review asks to dismiss prior progress',async()=>{
 let finish!:(value:unknown)=>void;io.page.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await start();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 await service.handleLookupMessage({type:'LOOKUP_DISMISS'},{id:ui.id,url:'moz-extension://test/sidepanel.html'});
 expect((await status()).state).toBe('searching');expect((await status()).dismissed).toBeUndefined();
 service.cancelOrderLookup();finish(page());
});
it('shows progress in the sidebar without creating a lookup tab, including repeated starts while busy',async()=>{
 let finish!:(value:unknown)=>void;io.page.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 io.sidebarOpen.mockResolvedValue(false);
 expect(await service.handleLookupMessage(request,sender)).toMatchObject({ok:true,sidebarOpen:false});
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 expect(await service.handleLookupMessage(request,sender)).toMatchObject({ok:true,busy:true});
 expect(io.create.mock.calls.some(([tab])=>tab.url.includes('order-lookup'))).toBe(false);
 service.cancelOrderLookup();finish(page());
});
it('reuses an existing Payments tab and reuses it again on the next lookup',async()=>{
 io.query.mockResolvedValue([{id:9,windowId:3,url:'https://www.amazon.ca/cpe/yourpayments/transactions?ref=existing'}]);
 await start();await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 await start();await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 expect(io.update.mock.calls.filter(([id,change])=>id===9&&change.url==='https://www.amazon.ca/cpe/yourpayments/transactions?ie=UTF8')).toHaveLength(2);
 expect(io.reload).not.toHaveBeenCalled();
 expect(io.create.mock.calls.filter(([tab])=>tab.url==='about:blank')).toHaveLength(0);
 expect(io.focus).toHaveBeenCalledWith(3,{focused:true});
});
it('replaces a closed tracked Payments tab without navigating a different-window or unrelated tab',async()=>{
 await start();await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 io.get.mockImplementation(async(id:number)=>{if(id===2)throw Error('closed');return{id,windowId:3,url:source,status:'complete'};});
 io.query.mockResolvedValue([{id:99,windowId:4,url:'https://www.amazon.ca/cpe/yourpayments/transactions'},{id:88,windowId:3,url:'https://www.amazon.ca/your-orders/order-details?orderID=other'}]);
 await start();await vi.waitFor(async()=>expect(io.create.mock.calls.filter(([tab])=>tab.url==='about:blank')).toHaveLength(2));
 expect(io.update.mock.calls.some(([id])=>id===99||id===88)).toBe(false);
});
it('waits through unreadable intermediate markup after advancing beyond the first page',async()=>{
 io.page.mockResolvedValueOnce(page('newer','2026-10-29','available')).mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({lookupFailure:'unreadable'}).mockResolvedValueOnce(page());
 await start();await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 expect((await status()).pages).toBe(2);expect(io.focus).toHaveBeenCalledWith(3,{focused:true});
});
it('waits for canceled tab navigation to settle before starting a replacement lookup',async()=>{
 let finishReload!:()=>void;
 io.query.mockResolvedValue([{id:9,windowId:3,url:'https://www.amazon.ca/cpe/yourpayments/transactions'}]);
 io.update.mockImplementationOnce((id:number)=>new Promise(resolve=>{finishReload=()=>{navigated(id);resolve({id,windowId:3});};}));
 await start();await vi.waitFor(()=>expect(finishReload).toBeTypeOf('function'));
 service.cancelOrderLookup();const replacement=start();
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 expect(io.purchase).toHaveBeenCalledOnce();
 finishReload();await replacement;await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 expect(io.purchase).toHaveBeenCalledTimes(2);expect(io.update.mock.calls.filter(([id,change])=>id===9&&change.url)).toHaveLength(2);
});
it('does not read stale content when a navigation promise resolves before loading begins',async()=>{
 let finish!:()=>void;
 io.query.mockResolvedValue([{id:9,windowId:3,url:'https://www.amazon.ca/cpe/yourpayments/transactions'}]);
 io.update.mockImplementationOnce(async(id:number)=>{finish=()=>navigated(id);return{id,windowId:3};});
 await start();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 expect(io.page).not.toHaveBeenCalled();finish();
 await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 expect(io.listeners.size).toBe(0);
});
it('bounds a stalled navigation and removes its listener without reading stale content',async()=>{
 vi.useFakeTimers();io.query.mockResolvedValue([{id:9,windowId:3,url:'https://www.amazon.ca/cpe/yourpayments/transactions'}]);
 io.update.mockResolvedValue({id:9,windowId:3});
 await start();await vi.advanceTimersByTimeAsync(0);expect(io.page).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(15000);
 expect(await status()).toMatchObject({state:'stopped',message:expect.stringContaining('did not finish changing')});
 expect(io.listeners.size).toBe(0);expect(io.page).not.toHaveBeenCalled();
});
it('includes return-page navigation in the 120-second segment deadline',async()=>{
 vi.useFakeTimers();const began=Date.now();
 const first=page('synthetic','2026-10-22','available'),last=page('older','2026-10-19','end');
 io.page.mockResolvedValueOnce(first).mockResolvedValueOnce({ok:true}).mockImplementationOnce(async()=>{vi.setSystemTime(began+119999);return last;});
 io.update.mockImplementation(async(id:number,change:{url?:string})=>{if(change.url==='https://www.amazon.ca/cpe/yourpayments/transactions')navigated(id);return{id,windowId:3};});
 await start();await vi.advanceTimersByTimeAsync(0);expect((await status()).state).toBe('searching');
 await vi.advanceTimersByTimeAsync(1);expect((await status()).state).toBe('paused');expect(io.listeners.size).toBe(0);
});
it('navigates a Payments URL with a query back to the canonical first page',async()=>{
 io.query.mockResolvedValue([{id:9,windowId:3,url:'https://www.amazon.ca/cpe/yourpayments/transactions?ref=page'}]);
 io.get.mockImplementation(async(id:number)=>({id,windowId:3,url:id===1?source:'https://www.amazon.ca/cpe/yourpayments/transactions?ref=page',status:'complete'}));
 await start();await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 expect(io.update).toHaveBeenCalledWith(9,{url:'https://www.amazon.ca/cpe/yourpayments/transactions',active:false});
 expect(io.reload).not.toHaveBeenCalled();
});
it.each([
 {...ui,frameId:1,tab:{id:40,url:ui.url}},
 {...ui,url:ui.url+'?forged=1',frameId:0,tab:{id:40,url:ui.url}},
 {...ui,frameId:0,tab:{id:40,url:'https://www.amazon.ca/'}},
 {...ui,id:'foreign',frameId:0,tab:{id:40,url:ui.url}},
])('rejects framed, foreign and inconsistent lookup tab context',async bad=>{
 await expect(service.handleLookupMessage({type:'LOOKUP_STATUS'},bad)).rejects.toThrow();
 expect(io.purchase).not.toHaveBeenCalled();
});
it("checks the live tab URL before accepting a claimed extension-page sender",async()=>{
 io.get.mockResolvedValueOnce({id:40,url:'https://evil.invalid/'});
 await expect(service.handleLookupMessage({type:'LOOKUP_STATUS'},{...ui,frameId:0,tab:{id:40,url:ui.url}})).rejects.toThrow();
});
it("validates once, searches read-only and opens a unique order without leaking target/token", async () => {
  await start(); await vi.waitFor(async () => expect((await status()).state).toBe("opened"));
  expect(io.purchase).toHaveBeenCalledOnce(); expect(io.create).toHaveBeenCalledWith(expect.objectContaining({ url: "https://www.amazon.ca/your-orders/order-details?orderID=synthetic", active: true }));
  expect(JSON.stringify(await status())).not.toMatch(/test-only-token|test-tx|test-account/);
});
it('waits for a newly created payment tab to navigate before validating its destination',async()=>{
  let firstPaymentRead=true;
  io.get.mockImplementation(async(id:number)=>{
    if(id===1)return{id,url:source,status:'complete'};
    if(firstPaymentRead){firstPaymentRead=false;return{id,url:'about:blank',status:'loading'};}
    return{id,url:'https://www.amazon.ca/cpe/yourpayments/transactions',status:'complete'};
  });
  await start();await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
  expect(io.page).toHaveBeenCalled();
});
it("checks the entire date window and shows choices found on later pages", async () => {
  const first = page("first", "2026-10-22", "available"), second = page("second", "2026-10-20", "end");
  io.page.mockResolvedValueOnce(first).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(second);
  await start(); await vi.waitFor(async () => expect((await status()).state).toBe("choices"));
  expect((await status()).candidates.map(c => c.orderId)).toEqual(["first", "second"]);
  expect(io.create.mock.calls.filter(([arg]) => arg.url.includes("order-details"))).toHaveLength(0);
  await expect(service.handleLookupMessage({ type: "LOOKUP_OPEN", orderId: "forged" }, ui)).rejects.toThrow();
  await service.handleLookupMessage({ type: "LOOKUP_OPEN", orderId: "second" }, ui); expect((await status()).state).toBe("opened");
});
it.each([{ refund: true }, { funding: "gift_card" }, { amountCents: 1131 }])("excludes unsupported payment candidates %j", async extra => {
  io.page.mockResolvedValue(page("synthetic", "2026-10-22", "end", extra)); await start(); await vi.waitFor(async () => expect((await status()).state).toBe("missing"));
});
it("reports incomplete coverage rather than selecting a match on an unpageable page", async () => {
  io.page.mockResolvedValue(page("synthetic", "2026-10-22", "unknown")); await start(); await vi.waitFor(async () => expect((await status()).state).toBe("stopped")); expect((await status()).candidates).toEqual([]);
});
it("uses a verified chronological cutoff, including month boundaries", async () => {
  io.purchase.mockResolvedValue({ date: "2026-11-01", cents: 1130 });
  const rows = [page("inside", "2026-10-30").rows[0], page("outside", "2026-10-29").rows[0]];
  io.page.mockResolvedValue({ rows, next: "unknown", fingerprint: paymentPageFingerprint(rows as import("@/retailers/amazon/ca-preview").CaPayment[]) });
  await start(); await vi.waitFor(async () => expect((await status()).state).toBe("opened")); expect((await status()).candidates).toHaveLength(1);
});
it("deduplicates the same order/payment across pages and reuses an existing order tab", async () => {
  const rows = [page("synthetic").rows[0], page("older", "2026-10-19").rows[0]];
  io.page.mockResolvedValueOnce(page("synthetic", "2026-10-22", "available")).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ rows, next: "end", fingerprint: paymentPageFingerprint(rows as import("@/retailers/amazon/ca-preview").CaPayment[]) });
  io.query.mockResolvedValue([{ id: 8, url: "https://www.amazon.ca/your-orders/order-details?orderID=synthetic&ref=test" }]);
  await start(); await vi.waitFor(async () => expect((await status()).state).toBe("opened")); expect(io.update).toHaveBeenCalledWith(8, { active: true });
});
it("restores the matching payment page after searching older pages, so review can reread it",async()=>{
 const first=page('synthetic','2026-10-22','available'),last=page('older','2026-10-19','end');
 io.page.mockResolvedValueOnce(first).mockResolvedValueOnce({ok:true}).mockResolvedValueOnce(last).mockResolvedValueOnce(first);
 await start();await vi.waitFor(async()=>expect((await status()).state).toBe('opened'));
 expect(io.update).toHaveBeenCalledWith(2,{url:'https://www.amazon.ca/cpe/yourpayments/transactions?ie=UTF8',active:false});
 expect(service.lookupPaymentsForOrder('synthetic')).toBe(2);expect(service.lookupPaymentsForOrder('other')).toBeUndefined();
});
it("pauses for sign-in and never resumes merely from a status poll", async () => {
  io.get.mockImplementation(async (id: number) => ({ windowId:3,url: id === 1 ? source : "https://www.amazon.ca/ap/signin", status: "complete" }));
  await start(); await vi.waitFor(async () => expect((await status()).state).toBe("signin")); expect(io.page).not.toHaveBeenCalled(); await status(); expect(io.page).not.toHaveBeenCalled();
  io.get.mockImplementation(async (id: number) => ({ windowId:3,url: id === 1 ? source : "https://www.amazon.ca/cpe/yourpayments/transactions", status: "complete" }));
  await service.handleLookupMessage({ type: "LOOKUP_CONTINUE" }, ui); await vi.waitFor(async () => expect((await status()).state).toBe("opened"));
  expect(io.update).toHaveBeenCalledWith(2,{url:'https://www.amazon.ca/cpe/yourpayments/transactions?ie=UTF8',active:false});
});
it("cancels pending work and stops after a connection or register route change", async () => {
  let resolve!: (value: unknown) => void; io.page.mockImplementation(() => new Promise(r => { resolve = r; }));
  await start(); await vi.waitFor(() => expect(resolve).toBeTypeOf("function")); service.cancelOrderLookup(); resolve(page());
  await vi.waitFor(async () => expect((await status()).state).toBe("canceled"));
  expect(io.create.mock.calls.filter(([arg]) => arg.url.includes("order-details"))).toHaveLength(0);
});
it.each([
  { ...sender, id: "foreign" }, { ...sender, frameId: 1 }, { ...sender, url: "https://evil.invalid" }, { ...sender, tab: undefined },
])("rejects foreign and framed register requests", async bad => { await expect(service.handleLookupMessage(request, bad)).rejects.toThrow(); expect(io.purchase).not.toHaveBeenCalled(); });
it("does not allow register/Amazon scripts to control lookup or call financial commands", async () => {
  for (const type of ["LOOKUP_STATUS", "LOOKUP_CANCEL", "LOOKUP_CONTINUE", "LOOKUP_OPEN", "APPLY_PURCHASE_APPROVAL", "CONNECT_TOKEN"]) await expect(service.handleLookupMessage({ type }, sender)).rejects.toThrow();
  const respond = vi.fn(); expect(service.createLookupListener()({ type: "APPLY_PURCHASE_APPROVAL" }, ui, respond)).toBe(false); expect(respond).not.toHaveBeenCalled();
});
it("pauses after exactly fifty pages and requires explicit Continue", async () => {
  let index = 0;
  io.purchase.mockResolvedValue({ date: "2026-01-01", cents: 1130 });
  io.page.mockImplementation(async (_id, _signal, type) => type === "LOOKUP_ADVANCE_PAYMENT_PAGE" ? { ok: true } : page(`order-${index++}`, "2026-10-22", "available"));
  await start(); await vi.waitFor(async () => expect((await status()).state).toBe("paused")); expect((await status()).pages).toBe(50);
  io.page.mockResolvedValue(page("last", "2025-12-28", "end"));
  await service.handleLookupMessage({ type: "LOOKUP_CONTINUE" }, ui); await vi.waitFor(async () => expect((await status()).state).toBe("missing"));
});
it("stops if the original register route changes while reading a payment page",async()=>{
 io.page.mockImplementation(async()=>{io.get.mockResolvedValue({url:'https://app.ynab.com/test-plan/accounts/other-account'});return page();});
 await start();await vi.waitFor(async()=>expect((await status()).state).toBe('stopped'));
 expect(io.create.mock.calls.filter(([arg])=>arg.url.includes('order-details'))).toHaveLength(0);
});
it("pauses at the time budget before reading another page",async()=>{
 const initial=Date.now();let clock=initial;
 const now=vi.spyOn(Date,'now').mockImplementation(()=>clock);
 io.page.mockImplementation(async(_id,_signal,type)=>{if(type==='LOOKUP_ADVANCE_PAYMENT_PAGE'){clock+=120001;return{ok:true};}return page('too-new','2026-10-29','available');});
 try{await start();await vi.waitFor(async()=>expect((await status()).state).toBe('paused'));expect((await status()).pages).toBe(1);}finally{now.mockRestore();}
});
it("cancels an in-flight page read at the segment deadline and keeps the search resumable",async()=>{
 vi.useFakeTimers();
 io.page.mockImplementation(async(_id,signal:AbortSignal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Canceled','AbortError')),{once:true})));
 await start();await vi.advanceTimersByTimeAsync(0);expect(io.page).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(120000);expect((await status()).state).toBe('paused');
});
it.each([{orderId:null},{funding:undefined},{funding:'unknown'}])("never opens a payment with incomplete identity/funding %j",async extra=>{
 io.page.mockResolvedValue(page('synthetic','2026-10-22','end',extra));await start();await vi.waitFor(async()=>expect((await status()).state).toBe('stopped'));
});
