import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getSettings } from "@/lib/settings";
import { captureLocalData, clearLocalDataIfUnchanged } from "@/lib/db";
vi.mock("@/lib/settings", () => ({ getSettings: vi.fn() }));
vi.mock("@/lib/db", () => ({ captureLocalData: vi.fn(), clearLocalDataIfUnchanged: vi.fn() }));
let service: typeof import("./local-data-cleanup");
const zeros = { allocatedTransactions: 0, learnedProducts: 0, productEmbeddings: 0, categories: 0 };
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); service = await import("./local-data-cleanup");
  vi.mocked(getSettings).mockResolvedValue({ accessToken: null, planId: null, planName: null });
  vi.mocked(captureLocalData).mockResolvedValue({ keys: { allocatedTransactions: [], learnedProducts: ["private-test-key"], productEmbeddings: [], categories: [] }, counts: { ...zeros, learnedProducts: 1 } });
  vi.mocked(clearLocalDataIfUnchanged).mockImplementation(async (_snapshot, _signal, beforeClear) => { beforeClear?.(); return zeros; });
});
afterEach(() => vi.useRealTimers());
it("returns only counts and a one-use approval, requiring explicit confirmation before deletion", async () => {
  const preview = await service.previewLocalDataDelete();
  expect(preview.counts.learnedProducts).toBe(1); expect(JSON.stringify(preview)).not.toContain("private-test-key");
  await expect(service.deleteLocalData(preview.approvalId, false)).rejects.toThrow("Confirm deletion");
  expect(clearLocalDataIfUnchanged).not.toHaveBeenCalled();
  expect(await service.deleteLocalData(preview.approvalId, true)).toEqual(zeros);
  await expect(service.deleteLocalData(preview.approvalId, true)).rejects.toThrow("was used");
  expect(clearLocalDataIfUnchanged).toHaveBeenCalledOnce();
});
it("blocks preview and deletion while any YNAB connection remains", async () => {
  const preview = await service.previewLocalDataDelete();
  vi.mocked(getSettings).mockResolvedValue({ accessToken: "test-only-token", planId: "test-plan", planName: "Test" });
  await expect(service.deleteLocalData(preview.approvalId, true)).rejects.toThrow("Disconnect");
  await expect(service.previewLocalDataDelete()).rejects.toThrow("Disconnect");
  expect(clearLocalDataIfUnchanged).not.toHaveBeenCalled();
});
it("rejects unknown, superseded, canceled, and expired approvals", async () => {
  await expect(service.deleteLocalData("forged", true)).rejects.toThrow("expired");
  const first = await service.previewLocalDataDelete(); const second = await service.previewLocalDataDelete();
  await expect(service.deleteLocalData(first.approvalId, true)).rejects.toThrow("expired");
  service.invalidateLocalDataPreview(second.approvalId);
  await expect(service.deleteLocalData(second.approvalId, true)).rejects.toThrow("expired");
  const third = await service.previewLocalDataDelete(); vi.setSystemTime(third.expiresAt + 1);
  await expect(service.deleteLocalData(third.approvalId, true)).rejects.toThrow("expired"); expect(clearLocalDataIfUnchanged).not.toHaveBeenCalled();
});
it("does not issue a stale preview after connection invalidation during the read", async () => {
  vi.mocked(captureLocalData).mockImplementationOnce(async () => {
    service.invalidateLocalDataPreview(); return { keys: { allocatedTransactions: [], learnedProducts: [], productEmbeddings: [], categories: [] }, counts: zeros };
  });
  await expect(service.previewLocalDataDelete()).rejects.toThrow("connection changed");
});
it("rechecks cancellation before the atomic clear", async () => {
  const preview = await service.previewLocalDataDelete();
  vi.mocked(clearLocalDataIfUnchanged).mockImplementationOnce(async (_s, _signal, beforeClear) => { service.invalidateLocalDataPreview(); beforeClear?.(); return zeros; });
  await expect(service.deleteLocalData(preview.approvalId, true)).rejects.toThrow("canceled");
});
it("consumes approval before awaiting, rejecting a second simultaneous deletion", async () => {
  const preview = await service.previewLocalDataDelete();
  const first = service.deleteLocalData(preview.approvalId, true);
  await expect(service.deleteLocalData(preview.approvalId, true)).rejects.toThrow("was used");
  await first; expect(clearLocalDataIfUnchanged).toHaveBeenCalledOnce();
});
