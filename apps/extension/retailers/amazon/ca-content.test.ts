// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const readers = vi.hoisted(() => ({ order: vi.fn(), payments: vi.fn() }));
vi.mock("./order-summary", () => ({ readOrderSummary: readers.order }));
vi.mock("./ca-preview", () => ({ readCanadianPayments: readers.payments }));
let listener: (message: unknown, sender: { id?: string; tab?: unknown }) => unknown;
beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks(); readers.order.mockReturnValue({ orderId: "synthetic" }); readers.payments.mockReturnValue([]);
  const addListener = vi.fn();
  vi.stubGlobal("browser", { runtime: { id: "test-extension", onMessage: { addListener } } });
  vi.stubGlobal("defineContentScript", (value: unknown) => value);
  const entry = await import("../../entrypoints/amazon-ca.content");
  (entry.default as unknown as { main: () => void }).main(); listener = addListener.mock.calls[0]![0];
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(["READ_CA_ORDER_SUMMARY", "READ_CA_PREVIEW_PAYMENTS"])("only reads %s for an explicit own-background request", async type => {
  expect(readers.order).not.toHaveBeenCalled(); expect(readers.payments).not.toHaveBeenCalled();
  listener({ type }, { id: "foreign" }); listener({ type }, { id: "test-extension", tab: { id: 1 } }); listener(null, { id: "test-extension" });
  expect(readers.order).not.toHaveBeenCalled(); expect(readers.payments).not.toHaveBeenCalled();
  await listener({ type }, { id: "test-extension" });
  expect(type === "READ_CA_ORDER_SUMMARY" ? readers.order : readers.payments).toHaveBeenCalledExactlyOnceWith(document, location.href);
});
it.each(["READ_CA_FUNDED_ORDER", "COMPARE_CA_FUNDED_AMOUNT", "READ_CA_PREVIEW_ORDER", "COMPARE_AMAZON_CA_AMOUNT", "INSPECT_AMAZON_CA_DETAIL", "INSPECT_AMAZON_CA_PAYMENTS", "DESCRIBE"])("rejects retired %s even from our extension", type => {
  expect(listener({ type }, { id: "test-extension" })).toBeUndefined();
  expect(readers.order).not.toHaveBeenCalled(); expect(readers.payments).not.toHaveBeenCalled();
});
it.each(["order", "payments"] as const)("keeps raw %s errors out of responses", async kind => {
  readers[kind].mockImplementationOnce(() => { throw Error("private page values"); });
  const result = await listener({ type: kind === "order" ? "READ_CA_ORDER_SUMMARY" : "READ_CA_PREVIEW_PAYMENTS" }, { id: "test-extension" });
  expect(result).toEqual(kind === "order" ? { orderReadFailure: "read" } : { paymentsReadFailure: "paymentsRead" });
});

it("registers the passive reader at document start, before idle timing", async () => {
  const entry = await import("../../entrypoints/amazon-ca.content");
  expect(entry.default).toMatchObject({ runAt: "document_start" });
  expect(readers.order).not.toHaveBeenCalled(); expect(readers.payments).not.toHaveBeenCalled();
});
it.each(["order", "payments"] as const)("rejects an early %s read until the document is ready", async kind => {
  const readiness = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
  const type = kind === "order" ? "READ_CA_ORDER_SUMMARY" : "READ_CA_PREVIEW_PAYMENTS";
  expect(await listener({ type }, { id: "test-extension" })).toEqual(kind === "order"
    ? { orderReadFailure: "orderLoading" } : { paymentsReadFailure: "paymentsLoading" });
  expect(readers.order).not.toHaveBeenCalled(); expect(readers.payments).not.toHaveBeenCalled();
  readiness.mockReturnValue("interactive");
  await listener({ type }, { id: "test-extension" });
  expect(readers[kind]).toHaveBeenCalledOnce();
});
