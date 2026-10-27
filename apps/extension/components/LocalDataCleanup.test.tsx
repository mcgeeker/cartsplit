// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import LocalDataCleanup from "./LocalDataCleanup";
import { previewLocalDataDelete, deleteLocalData, cancelLocalDataDelete } from "@/lib/messaging";
vi.mock("@/lib/messaging", () => ({ previewLocalDataDelete: vi.fn(), deleteLocalData: vi.fn(), cancelLocalDataDelete: vi.fn() }));
const counts = { allocatedTransactions: 0, learnedProducts: 0, productEmbeddings: 0, categories: 12 };
let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(previewLocalDataDelete).mockResolvedValue({ preview: { approvalId: "test-cleanup", expiresAt: Date.now() + 300000, counts } });
  vi.mocked(deleteLocalData).mockResolvedValue({ ok: true, counts: { ...counts, categories: 0 } });
  vi.mocked(cancelLocalDataDelete).mockResolvedValue();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function mount() { await act(async () => root.render(<LocalDataCleanup />)); }
function button(text: string) { return [...host.querySelectorAll("button")].find((b) => b.textContent === text)!; }
async function show() { await act(async () => button("Preview local data removal").click()); }
async function confirm() { await act(async () => host.querySelector<HTMLInputElement>("input[type=checkbox]")!.click()); }
it("does nothing until asked, previews counts, and requires separate destructive confirmation", async () => {
  await mount(); expect(previewLocalDataDelete).not.toHaveBeenCalled(); expect(deleteLocalData).not.toHaveBeenCalled();
  await show(); expect(host.textContent).toContain("Cached categories: 12");
  expect(host.textContent).toContain("every budget in this profile"); expect(button("Delete these local records").disabled).toBe(true);
  await confirm(); await act(async () => button("Delete these local records").click());
  expect(deleteLocalData).toHaveBeenCalledExactlyOnceWith("test-cleanup", true);
  expect(host.textContent).toContain("All four counts are zero");
});
it("supports keeping all records by canceling the preview", async () => {
  await mount(); await show(); await act(async () => button("Cancel removal preview").click());
  expect(cancelLocalDataDelete).toHaveBeenCalledWith("test-cleanup"); expect(deleteLocalData).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Cached categories: 12");
});
it("offers no destructive control when there is nothing to remove", async () => {
  vi.mocked(previewLocalDataDelete).mockResolvedValue({ preview: { approvalId: "empty", expiresAt: Date.now() + 300000, counts: { ...counts, categories: 0 } } });
  await mount(); await show(); expect(host.textContent).toContain("No cached records to remove");
  expect(host.textContent).not.toContain("Delete these local records");
});
it("expires the confirmation and disables deletion", async () => {
  vi.useFakeTimers(); await mount(); await show(); await confirm();
  await act(async () => { vi.advanceTimersByTime(300001); });
  expect(button("Delete these local records").disabled).toBe(true); expect(host.textContent).toContain("preview expired");
  expect(deleteLocalData).not.toHaveBeenCalled();
});
it("does not claim removal when the result contains nonzero counts", async () => {
  vi.mocked(deleteLocalData).mockResolvedValue({ ok: true, counts }); await mount(); await show(); await confirm();
  await act(async () => button("Delete these local records").click());
  expect(host.querySelector("[role=alert]")?.textContent).toContain("Could not confirm removal"); expect(host.textContent).not.toContain("Local records removed");
});
it("ignores a late preview response after canceling the view", async () => {
  let finish!: (value: Awaited<ReturnType<typeof previewLocalDataDelete>>) => void;
  vi.mocked(previewLocalDataDelete).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  await mount(); await show(); await act(async () => root.unmount());
  await act(async () => finish({ preview: { approvalId: "late", expiresAt: Date.now() + 300000, counts } }));
  expect(host.textContent).toBe(""); expect(deleteLocalData).not.toHaveBeenCalled();
  root = createRoot(host);
});
