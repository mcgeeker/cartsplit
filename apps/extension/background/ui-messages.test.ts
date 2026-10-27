import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUiMessageListener } from "./ui-messages";

const SIDEBAR = "moz-extension://test-only-extension/sidepanel.html";
vi.mock("wxt/browser", () => ({ browser: { runtime: {
  id: "cartsplit@mcgeeker", getURL: () => "moz-extension://test-only-extension/sidepanel.html",
} } }));
const trusted = { id: "cartsplit@mcgeeker", url: SIDEBAR };
const dispatch = vi.fn();
const respond = vi.fn();
const listen = createUiMessageListener(dispatch);
beforeEach(() => { vi.clearAllMocks(); dispatch.mockResolvedValue({ ok: true }); });

describe("sidebar-only command boundary", () => {
  it.each(["CONNECT_TOKEN", "CHECK_MODEL", "PREVIEW_LOCAL_DATA_DELETE", "DELETE_LOCAL_DATA", "CANCEL_LOCAL_DATA_DELETE", "PREVIEW_TEST_SPLIT", "PREVIEW_DUMMY_SPLIT", "APPLY_DUMMY_SPLIT", "CANCEL_DUMMY_SPLIT", "GET_SETTINGS", "GET_PLANS", "SAVE_PLAN", "CLEAR_SETTINGS", "APPROVE_BATCH", "SYNC"])("blocks content scripts from %s", (type) => {
    expect(listen({ type }, { ...trusted, url: "https://www.amazon.com/orders", tab: { id: 1 } }, respond)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith({ error: expect.stringContaining("only available") });
  });

  it.each([
    {}, { ...trusted, id: "another-extension" }, { ...trusted, url: "https://example.com/sidepanel.html" },
    { ...trusted, url: `${SIDEBAR}/extra` }, { ...trusted, tab: { id: 1 } },
    { ...trusted, url: "moz-extension://other-extension/sidepanel.html" },
  ])("rejects missing, foreign, or forged sender context", (sender) => {
    listen({ type: "GET_SETTINGS" }, sender, respond);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("accepts the actual sidebar and sends only its response", async () => {
    dispatch.mockResolvedValueOnce({ hasToken: true, planId: null, planName: null });
    expect(listen({ type: "GET_SETTINGS" }, trusted, respond)).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ hasToken: true, planId: null, planName: null }));
  });

  it.each([null, "test-only-secret", {}, { type: "test-only-secret" }, { type: "SAVE_PLAN", planId: {} }])("rejects malformed requests without echoing the payload", (message) => {
    listen(message, trusted, respond);
    expect(dispatch).not.toHaveBeenCalled();
    expect(JSON.stringify(respond.mock.calls)).not.toContain("test-only-secret");
  });

  it("sanitizes unhandled dispatch errors", async () => {
    dispatch.mockRejectedValueOnce(new Error("test-only-secret"));
    listen({ type: "GET_SETTINGS" }, trusted, respond);
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());
    expect(JSON.stringify(respond.mock.calls)).not.toContain("test-only-secret");
  });

  it.each(["PAGE_RESULT", "BACKFILL_PROGRESS"])("rejects retired %s without dispatch", (type) => {
    expect(listen({ type }, {}, respond)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith({ error: expect.any(String) });
  });
});
