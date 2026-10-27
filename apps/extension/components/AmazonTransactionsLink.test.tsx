// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import AmazonTransactionsLink from "./AmazonTransactionsLink";
const api = vi.hoisted(() => ({ query: vi.fn(), create: vi.fn(), onCreated: { addListener: vi.fn(), removeListener: vi.fn() }, onRemoved: { addListener: vi.fn(), removeListener: vi.fn() }, onUpdated: { addListener: vi.fn(), removeListener: vi.fn() } }));
vi.mock("wxt/browser", () => ({ browser: { tabs: api } }));
const url = "https://www.amazon.ca/cpe/yourpayments/transactions";
beforeEach(() => { vi.resetAllMocks(); api.query.mockResolvedValue([]); api.create.mockResolvedValue({}); });
it.each(["open", "existing", "raced", "removed", "error"])("handles %s tab state without automatic creation", async mode => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (mode === "existing") api.query.mockResolvedValue([{ id: 5, url }]);
  if (mode === "error") api.create.mockRejectedValue(new Error("private browser error"));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<AmazonTransactionsLink />));
    expect(api.create).not.toHaveBeenCalled();
    expect(api.query).toHaveBeenCalledWith({ currentWindow: true, url: url + "*" });
    if (mode === "existing") { expect(host.querySelector("button")).toBeNull(); return; }
    if (mode === "raced") api.query.mockResolvedValue([{ id: 5, url }]);
    await act(async () => host.querySelector("button")!.click());
    if (mode === "raced") expect(api.create).not.toHaveBeenCalled();
    else expect(api.create).toHaveBeenCalledExactlyOnceWith({ url, active: true });
    if (mode === "error") { expect(host.textContent).toContain("Could not open"); expect(host.textContent).not.toContain("private browser error"); }
    else expect(host.querySelector("button")).toBeNull();
    if (mode === "removed") {
      // Firefox may still return the closing tab while processing onRemoved.
      api.query.mockResolvedValue([{id: 5, url}]);
      await act(async () => api.onRemoved.addListener.mock.calls[0]![0](5));
      expect(host.querySelector("button")?.textContent).toBe("Open Amazon Transactions/Payments");
    }
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
    expect(api.onRemoved.removeListener).toHaveBeenCalledOnce();
  }
});
