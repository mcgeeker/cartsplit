import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { findCanadianTestCandidate } from "./ynab";
vi.mock("./auth", () => ({ getValidAccessToken: async () => "test-only-token", NeedsReauthError: class extends Error {} }));
const network = vi.fn();
const a = { id: "test-account", name: "Lineitem Test", type: "cash", on_budget: true, closed: false, deleted: false, direct_import_linked: false };
const t = { account_id: a.id, date: "2026-10-22", amount: -13560, payee_name: "Amazon.ca", category_id: null, deleted: false, subtransactions: [] };
function seed(accounts: unknown[] = [a], transactions: unknown[] = [t]) {
  network.mockResolvedValueOnce(new Response(JSON.stringify({ data: { accounts } }))).mockResolvedValueOnce(new Response(JSON.stringify({ data: { transactions } })));
}
beforeEach(() => { network.mockReset(); vi.stubGlobal("fetch", network); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T16:00:00Z")); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("reads only Lineitem Test and returns no private transaction data or write capability", async () => {
  seed(); expect(await findCanadianTestCandidate("test-plan", t.date, 1356)).toBeUndefined();
  expect(network.mock.calls.map(([url]) => url)).toEqual(["https://api.ynab.com/v1/plans/test-plan/accounts", "https://api.ynab.com/v1/plans/test-plan/accounts/test-account/transactions?since_date=2026-10-22"]);
  for (const [, options] of network.mock.calls) { expect(options.method ?? "GET").toBe("GET"); expect(options.redirect).toBe("error"); expect(options.credentials).toBe("omit"); }
});
it.each(["", "2026-02-30", "2026-12-01", "2026-10-22&x=y"])("rejects unbounded/invalid dates: %s", async (date) => {
  await expect(findCanadianTestCandidate("test-plan", date, 1356)).rejects.toThrow(); expect(network).not.toHaveBeenCalled();
});
it.each([0, -1, 1.1, Number.MAX_SAFE_INTEGER, NaN])("rejects bad amounts: %s", async (amount) => {
  await expect(findCanadianTestCandidate("test-plan", t.date, amount)).rejects.toThrow(); expect(network).not.toHaveBeenCalled();
});
it.each([[], [a, a], [{ ...a, id: undefined }], [{ ...a, type: "checking" }], [{ ...a, closed: true }], [{ ...a, direct_import_linked: true }]].map(accounts => ({ accounts })))("rejects unsuitable or duplicate accounts", async ({ accounts }) => {
  seed(accounts); await expect(findCanadianTestCandidate("test-plan", t.date, 1356)).rejects.toThrow(); expect(network).toHaveBeenCalledOnce();
});
it.each([[], [t, t], [{ ...t, category_id: "test-cat" }], [{ ...t, amount: 13560 }], [{ ...t, subtransactions: [{}] }], [{ ...t, payee_name: "Other" }], [{ ...t, import_id: "imported" }], [{ ...t, transfer_account_id: "other" }], [{ ...t, matched_transaction_id: "matched" }]].map(transactions => ({ transactions })))("rejects unsuitable or duplicate candidates", async ({ transactions }) => {
  seed([a], transactions); await expect(findCanadianTestCandidate("test-plan", t.date, 1356)).rejects.toThrow();
});
it("cancels before any follow-on account transactions read", async () => {
  const c = new AbortController(); network.mockImplementationOnce(async () => { c.abort(); return new Response(JSON.stringify({ data: { accounts: [a] } })); });
  await expect(findCanadianTestCandidate("test-plan", t.date, 1356, c.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(network).toHaveBeenCalledOnce();
});
it("reports exact candidate failure stages without exposing account or transaction data", async () => {
  const report = vi.fn(); seed([a], []);
  await expect(findCanadianTestCandidate('test-plan',t.date,1356,undefined,report)).rejects.toThrow();
  expect(report.mock.calls.map(c=>c[0])).toEqual(['candidate-date','candidate-account','candidate-transactions','candidate-not-found']);
});
it("distinguishes ambiguous and ineligible transaction candidates", async () => {
  const report = vi.fn(); seed([a],[t,t]);
  await expect(findCanadianTestCandidate('test-plan',t.date,1356,undefined,report)).rejects.toThrow(); expect(report).toHaveBeenLastCalledWith('candidate-ambiguous');
  network.mockReset(); report.mockClear(); seed([a],[{...t,category_id:'test-category'}]);
  await expect(findCanadianTestCandidate('test-plan',t.date,1356,undefined,report)).rejects.toThrow(); expect(report).toHaveBeenLastCalledWith('candidate-eligibility');
});
it.each([[401,'candidate-auth'],[429,'candidate-rate-limit']])("reports safe status for HTTP %s without exposing response bodies", async (status, code) => {
  const report = vi.fn(); network.mockResolvedValueOnce(new Response('private-test-body',{status:Number(status)}));
  await expect(findCanadianTestCandidate('test-plan',t.date,1356,undefined,report)).rejects.toThrow(); expect(report).toHaveBeenLastCalledWith(code); expect(network).toHaveBeenCalledOnce();
});
it.each(['2026-01-01','2020-02-29'])('allows a valid older purchase dated %s without a 90-day cutoff',async date=>{
 seed([a],[{...t,date}]);await expect(findCanadianTestCandidate('test-plan',date,1356)).resolves.toBeUndefined();
 expect(network.mock.calls[1]![0]).toContain(`since_date=${date}`);
});

it('can inspect saved split-shipment charges without making them writable',async()=>{
 const {inspectReviewedTestCharge,getReviewedTestTarget}=await import('./ynab');
 const saved={...t,id:'synthetic-id',approved:false,cleared:'uncleared',memo:null,payee_id:null,flag_color:null,category_id:'synthetic-category'};
 seed([a],[saved]);expect(await inspectReviewedTestCharge('test-plan',t.date,1356,new AbortController().signal)).toMatchObject({eligible:false,transactionId:'synthetic-id'});
 network.mockReset();seed([a],[saved]);await expect(getReviewedTestTarget('test-plan',t.date,1356,new AbortController().signal)).rejects.toThrow('already has a category');
 expect(network.mock.calls.every(([,o])=>!o.method||o.method==='GET')).toBe(true);
});
it('preserves existing split charges during read-only inspection but refuses to grant a writable target',async()=>{
 const {inspectReviewedTestCharge,getReviewedTestTarget}=await import('./ynab');
 const saved={...t,id:'synthetic-id',approved:false,cleared:'uncleared',memo:null,payee_id:null,flag_color:null,subtransactions:[{category_id:'synthetic-category'}]};
 seed([a],[saved]);expect(await inspectReviewedTestCharge('test-plan',t.date,1356,new AbortController().signal)).toMatchObject({eligible:false});
 network.mockReset();seed([a],[saved]);await expect(getReviewedTestTarget('test-plan',t.date,1356,new AbortController().signal)).rejects.toThrow('already split');
});
it('does not admit imported charges through the read-only split inspector',async()=>{
 const {inspectReviewedTestCharge}=await import('./ynab');seed([a],[{...t,category_id:'synthetic',import_id:'synthetic-import'}]);
 await expect(inspectReviewedTestCharge('test-plan',t.date,1356,new AbortController().signal)).rejects.toThrow('manual Amazon');
});
