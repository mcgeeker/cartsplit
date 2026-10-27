import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { findCanadianCandidate } from "./ynab";
vi.mock("./auth", () => ({ getValidAccessToken: async () => "test-only-token", NeedsReauthError: class extends Error {} }));
const network = vi.fn();
const a = { id: "test-account", name: "Lineitem Test", type: "cash", on_budget: true, closed: false, deleted: false, direct_import_linked: false };
const t = { account_id: a.id, date: "2026-10-22", amount: -13560, payee_name: "Amazon.ca", category_id: null, deleted: false, subtransactions: [] };
const plan = {id:"test-plan",name:"Test Plan",currency_format:{iso_code:"CAD"}};
function seed(accounts: unknown[] = [a], transactions: unknown[] = [t], plans: unknown[] = [plan]) {
  network.mockResolvedValueOnce(new Response(JSON.stringify({data:{plans}}))).mockResolvedValueOnce(new Response(JSON.stringify({ data: { accounts } }))).mockResolvedValueOnce(new Response(JSON.stringify({ data: { transactions } })));
}
beforeEach(() => { network.mockReset(); vi.stubGlobal("fetch", network); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T16:00:00Z")); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("reads only the selected plan and returns no private transaction data or write capability", async () => {
  seed(); expect(await findCanadianCandidate("test-plan", t.date, 1356)).toBeUndefined();
  expect(network.mock.calls.map(([url]) => url)).toEqual(["https://api.ynab.com/v1/plans", "https://api.ynab.com/v1/plans/test-plan/accounts", "https://api.ynab.com/v1/plans/test-plan/transactions?since_date=2026-10-20"]);
  for (const [, options] of network.mock.calls) { expect(options.method ?? "GET").toBe("GET"); expect(options.redirect).toBe("error"); expect(options.credentials).toBe("omit"); }
});
it.each(["", "2026-02-30", "2026-12-01", "2026-10-22&x=y", "0000-01-01"])("rejects unbounded/invalid dates: %s", async (date) => {
  await expect(findCanadianCandidate("test-plan", date, 1356)).rejects.toThrow(); expect(network).not.toHaveBeenCalled();
});
it.each([0, -1, 1.1, Number.MAX_SAFE_INTEGER, NaN])("rejects bad amounts: %s", async (amount) => {
  await expect(findCanadianCandidate("test-plan", t.date, amount)).rejects.toThrow(); expect(network).not.toHaveBeenCalled();
});
it.each([[], [a, a], [{ ...a, id: undefined }], [{ ...a, type: "otherLiability" }], [{ ...a, closed: true }], [{ ...a, on_budget: false }]].map(accounts => ({ accounts })))("rejects unsuitable or duplicate accounts", async ({ accounts }) => {
  seed(accounts); await expect(findCanadianCandidate("test-plan", t.date, 1356)).rejects.toThrow(); expect(network).toHaveBeenCalledTimes(2);
});
it.each([[], [t, t], [{ ...t, category_id: "test-cat" }], [{ ...t, amount: 13560 }], [{ ...t, subtransactions: [{}] }], [{ ...t, payee_name: "Other" }], [{ ...t, import_id: 123 }], [{ ...t, transfer_account_id: "other" }], [{ ...t, matched_transaction_id: {} }]].map(transactions => ({ transactions })))("rejects unsuitable or duplicate candidates", async ({ transactions }) => {
  seed([a], transactions); await expect(findCanadianCandidate("test-plan", t.date, 1356)).rejects.toThrow();
});
it("cancels before any follow-on account transactions read", async () => {
  const c = new AbortController(); network.mockResolvedValueOnce(new Response(JSON.stringify({data:{plans:[plan]}}))).mockImplementationOnce(async () => { c.abort(); return new Response(JSON.stringify({ data: { accounts: [a] } })); });
  await expect(findCanadianCandidate("test-plan", t.date, 1356, c.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(network).toHaveBeenCalledTimes(2);
});
it("reports exact candidate failure stages without exposing account or transaction data", async () => {
  const report = vi.fn(); seed([a], []);
  await expect(findCanadianCandidate('test-plan',t.date,1356,undefined,report)).rejects.toThrow();
  expect(report.mock.calls.map(c=>c[0])).toEqual(['candidate-date','candidate-budget','candidate-currency','candidate-account','candidate-transactions','candidate-not-found']);
});
it("distinguishes ambiguous and ineligible transaction candidates", async () => {
  const report = vi.fn(); seed([a],[t,t]);
  await expect(findCanadianCandidate('test-plan',t.date,1356,undefined,report)).rejects.toThrow(); expect(report).toHaveBeenLastCalledWith('candidate-ambiguous');
  network.mockReset(); report.mockClear(); seed([a],[{...t,category_id:'test-category'}]);
  await expect(findCanadianCandidate('test-plan',t.date,1356,undefined,report)).rejects.toThrow(); expect(report).toHaveBeenLastCalledWith('candidate-eligibility');
});
it.each([[401,'candidate-auth'],[429,'candidate-rate-limit']])("reports safe status for HTTP %s without exposing response bodies", async (status, code) => {
  const report = vi.fn(); network.mockResolvedValueOnce(new Response('private-test-body',{status:Number(status)}));
  await expect(findCanadianCandidate('test-plan',t.date,1356,undefined,report)).rejects.toThrow(); expect(report).toHaveBeenLastCalledWith(code); expect(network).toHaveBeenCalledOnce();
});
it.each([{date:'2026-01-01',sinceDate:'2025-12-30'},{date:'2020-02-29',sinceDate:'2020-02-27'}])('allows a valid older purchase with a date-bounded query: %j',async ({date,sinceDate})=>{
 seed([a],[{...t,date}]);await expect(findCanadianCandidate('test-plan',date,1356)).resolves.toBeUndefined();
 expect(network.mock.calls[2]![0]).toContain(`since_date=${sinceDate}`);
});

it('can inspect saved split-shipment charges without making them writable',async()=>{
 const {inspectReviewedCharge,getReviewedTarget}=await import('./ynab');
 const saved={...t,id:'synthetic-id',approved:false,cleared:'uncleared',memo:null,payee_id:null,flag_color:null,category_id:'synthetic-category'};
 seed([a],[saved]);expect(await inspectReviewedCharge('test-plan',t.date,1356,new AbortController().signal)).toMatchObject({eligible:false,transactionId:'synthetic-id'});
 network.mockReset();seed([a],[saved]);await expect(getReviewedTarget('test-plan',t.date,1356,new AbortController().signal)).rejects.toThrow('already has a category');
 expect(network.mock.calls.every(([,o])=>!o.method||o.method==='GET')).toBe(true);
});
it('preserves existing split charges during read-only inspection but refuses to grant a writable target',async()=>{
 const {inspectReviewedCharge,getReviewedTarget}=await import('./ynab');
 const saved={...t,id:'synthetic-id',approved:false,cleared:'uncleared',memo:null,payee_id:null,flag_color:null,subtransactions:[{category_id:'synthetic-category'}]};
 seed([a],[saved]);expect(await inspectReviewedCharge('test-plan',t.date,1356,new AbortController().signal)).toMatchObject({eligible:false});
 network.mockReset();seed([a],[saved]);await expect(getReviewedTarget('test-plan',t.date,1356,new AbortController().signal)).rejects.toThrow('already split');
});
it('does not admit transfers through the read-only split inspector',async()=>{
 const {inspectReviewedCharge}=await import('./ynab');seed([a],[{...t,category_id:'synthetic',transfer_account_id:'synthetic-other'}]);
 await expect(inspectReviewedCharge('test-plan',t.date,1356,new AbortController().signal)).rejects.toThrow('without transfers');
});

it.each(['cash','checking','savings','creditCard'])('matches an imported purchase in a selected household plan’s %s account',async type=>{
 const {getReviewedTarget}=await import('./ynab');
 const card={...a,name:'Synthetic household account',type,direct_import_linked:true};
 const purchase={...t,id:'synthetic-purchase',approved:true,cleared:'cleared',memo:null,payee_id:'synthetic-payee',flag_color:null,payee_name:'AMZN Mktp CA',import_id:'synthetic-import',matched_transaction_id:'synthetic-match'};
 seed([card],[purchase],[{...plan,name:'Synthetic household plan'}]);
 expect(await getReviewedTarget(plan.id,t.date,1356,new AbortController().signal)).toMatchObject({planName:'Synthetic household plan',accountName:card.name,importId:'synthetic-import',matchedTransactionId:'synthetic-match'});
 expect(network.mock.calls.every(([,o])=>!o.method||o.method==='GET')).toBe(true);
});
it('stops ambiguous Amazon matches across eligible accounts instead of choosing the first account',async()=>{
 const second={...a,id:'synthetic-second',name:'Synthetic Visa',type:'creditCard'};
 seed([a,second],[t,{...t,date:'2026-10-24',account_id:second.id}]);const report=vi.fn();
 await expect(findCanadianCandidate(plan.id,t.date,1356,undefined,report)).rejects.toThrow('exactly one');
 expect(report).toHaveBeenLastCalledWith('candidate-ambiguous');
});

it.each(['2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24'])('accepts bank date %s within the inclusive two-day payment window',async date=>{
 const {getReviewedTarget}=await import('./ynab');
 seed([a],[{...t,date,id:'synthetic-posted',approved:false,cleared:'uncleared',memo:null,payee_id:null,flag_color:null}]);
 expect(await getReviewedTarget(plan.id,t.date,1356,new AbortController().signal)).toMatchObject({paymentDate:'2026-10-22',date});
 expect(network.mock.calls[2]![0]).toContain('since_date=2026-10-20');
});
it.each(['2026-10-19','2026-10-25','2026-10-00','2026-10-32','2026-10-21T00:00:00Z'])('rejects out-of-window or malformed bank date %s',async date=>{
 seed([a],[{...t,date}]);const report=vi.fn();
 await expect(findCanadianCandidate(plan.id,t.date,1356,undefined,report)).rejects.toThrow('exactly one');
 expect(report).toHaveBeenLastCalledWith('candidate-not-found');
});
it.each([
 {payment:'2026-01-01',posted:'2025-12-30',since:'2025-12-30'},
 {payment:'2024-02-28',posted:'2024-03-01',since:'2024-02-26'},
 {payment:'2024-03-01',posted:'2024-02-28',since:'2024-02-28'},
 {payment:'2026-03-08',posted:'2026-03-10',since:'2026-03-06'},
 {payment:'2025-11-02',posted:'2025-11-04',since:'2025-10-31'},
])('uses calendar-day bounds across year, leap-day and DST boundaries: %j',async ({payment,posted,since})=>{
 seed([a],[{...t,date:posted}]);await expect(findCanadianCandidate(plan.id,payment,1356)).resolves.toBeUndefined();
 expect(network.mock.calls[2]![0]).toContain(`since_date=${since}`);
});
it('rejects an invalid calendar date inside the apparent string window',async()=>{
 seed([a],[{...t,date:'2024-02-30'}]);
 await expect(findCanadianCandidate(plan.id,'2024-02-29',1356)).rejects.toThrow('exactly one');
});
it.each([['2026-10-22','2026-10-23'],['2026-10-20','2026-10-24']])('rejects multiple matching dates %s and %s without preferring the exact or closest date',async (first,second)=>{
 seed([a],[{...t,date:first},{...t,date:second}]);const report=vi.fn();
 await expect(findCanadianCandidate(plan.id,t.date,1356,undefined,report)).rejects.toThrow('exactly one');
 expect(report).toHaveBeenLastCalledWith('candidate-ambiguous');
});
it('keeps the amount exact when the bank date differs',async()=>{
 seed([a],[{...t,date:'2026-10-23',amount:t.amount-10}]);
 await expect(findCanadianCandidate(plan.id,t.date,1356)).rejects.toThrow('exactly one');
});
it('ignores unrelated merchants and ineligible accounts when matching across a plan',async()=>{
 const second={...a,id:'synthetic-second',name:'Synthetic second'};
 const closed={...a,id:'synthetic-closed',closed:true};
 const offBudget={...a,id:'synthetic-tracking',on_budget:false};
 seed([a,second,closed,offBudget],[t,{...t,account_id:second.id,payee_name:'Other merchant'},{...t,account_id:closed.id},{...t,account_id:offBudget.id}]);
 await expect(findCanadianCandidate(plan.id,t.date,1356)).resolves.toBeUndefined();
});
it.each([null,undefined,{iso_code:'USD'}])('stops when the selected plan’s CAD currency cannot be verified: %j',async currency_format=>{
 seed([a],[t],[{...plan,currency_format}]);const report=vi.fn();
 await expect(findCanadianCandidate(plan.id,t.date,1356,undefined,report)).rejects.toThrow('verified CAD');
 expect(report).toHaveBeenLastCalledWith('candidate-currency');expect(network).toHaveBeenCalledOnce();
});
