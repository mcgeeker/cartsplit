import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./auth", () => ({ getValidAccessToken: vi.fn(async () => "test-only-token"), NeedsReauthError: class extends Error {} }));
import { getRegisterPurchase } from "./ynab";
const network = vi.fn(), plan = { id: "test-plan", name: "Synthetic", currency_format: { iso_code: "CAD" } };
const account = { id: "test-account", type: "creditCard", on_budget: true, closed: false, deleted: false };
const purchase = { planId: plan.id, accountId: account.id, transactionId: "test-tx", cents: 1130, payee: "Amazon.ca" };
const tx = { id: "test-tx", account_id: account.id, date: "2026-10-22", amount: -11300, payee_name: "Amazon.ca", deleted: false, cleared: "reconciled", category_id: "category", subtransactions: [{ amount: -11300 }] };
const response = (data: unknown) => new Response(JSON.stringify({ data }));
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", network); });
afterEach(() => vi.unstubAllGlobals());
function seed(transaction: unknown = tx) { network.mockResolvedValueOnce(response({ plans: [plan] })).mockResolvedValueOnce(response({ accounts: [account] })).mockResolvedValueOnce(response({ transaction })); }
it("reads an exact categorized/reconciled split parent by ID without any writes", async () => {
  seed(); expect(await getRegisterPurchase(purchase, new AbortController().signal)).toEqual({ date: tx.date, cents: 1130 });
  expect(network.mock.calls.map(([, options]) => options.method ?? "GET")).toEqual(["GET", "GET", "GET"]);
  expect(network.mock.calls.at(-1)![0]).toBe("https://api.ynab.com/v1/plans/test-plan/transactions/test-tx");
});
it.each([{ account_id: "other" }, { id: "other" }, { amount: -11301 }, { deleted: true }, { payee_name: "Other" }, { transfer_account_id: "other" }, { date: "2026-02-30" }])("rejects changed or ineligible targets %j", async change => {
  seed({ ...tx, ...change }); await expect(getRegisterPurchase(purchase, new AbortController().signal)).rejects.toThrow();
});
it("requires a unique fallback match in the exact account/date/amount/payee", async () => {
  const fallback = { ...purchase, transactionId: undefined, date: tx.date };
  for (const transactions of [[tx], [tx, { ...tx, id: "duplicate" }]]) {
    network.mockResolvedValueOnce(response({ plans: [plan] })).mockResolvedValueOnce(response({ accounts: [account] })).mockResolvedValueOnce(response({ transactions }));
    const promise = getRegisterPurchase(fallback, new AbortController().signal);
    if (transactions.length === 1) expect(await promise).toMatchObject({ cents: 1130 }); else await expect(promise).rejects.toThrow();
  }
});
it("rejects unsupported currencies/accounts and malformed inputs", async () => {
  network.mockResolvedValueOnce(response({ plans: [{ ...plan, currency_format: { iso_code: "USD" } }] }));
  await expect(getRegisterPurchase(purchase, new AbortController().signal)).rejects.toThrow(); expect(network).toHaveBeenCalledOnce();
  await expect(getRegisterPurchase({ ...purchase, transactionId: "../unsafe" }, new AbortController().signal)).rejects.toThrow(); expect(network).toHaveBeenCalledOnce();
});
