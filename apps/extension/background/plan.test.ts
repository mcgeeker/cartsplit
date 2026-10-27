import { beforeEach, expect, it, vi } from "vitest";
import { switchPlan } from "./plan";
import { getCategories } from "@/lib/ynab";
import { saveSettings } from "@/lib/settings";
import { putCategories } from "@/lib/db";
vi.mock("@/lib/ynab", () => ({ getCategories: vi.fn() }));
vi.mock("@/lib/settings", () => ({ saveSettings: vi.fn() }));
vi.mock("@/lib/db", () => ({ putCategories: vi.fn() }));
const categories = [{ id: "cat", name: "Synthetic", groupName: "Test" }];
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getCategories).mockResolvedValue(categories); });
it("persists nothing if the category fetch fails", async () => {
  vi.mocked(getCategories).mockRejectedValueOnce(Error("Synthetic offline"));
  await expect(switchPlan("test-b", "Test B")).rejects.toThrow();
  expect(putCategories).not.toHaveBeenCalled(); expect(saveSettings).not.toHaveBeenCalled();
});
it("tags categories with the new plan before committing the connection", async () => {
  await switchPlan("test-b", "Test B");
  expect(putCategories).toHaveBeenCalledWith(categories, undefined, "test-b");
  expect(saveSettings).toHaveBeenCalledWith({ planId: "test-b", planName: "Test B" });
  expect(vi.mocked(putCategories).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(saveSettings).mock.invocationCallOrder[0]!);
});
it("does not change settings after cancellation during the cache commit", async () => {
  const controller = new AbortController();
  vi.mocked(putCategories).mockImplementationOnce(async () => controller.abort());
  await expect(switchPlan("test-b", "Test B", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(saveSettings).not.toHaveBeenCalled();
});
