import { putLearnedProduct, putProductEmbedding, putAllocatedTransactions, getAllocatedTransaction } from "../test-support/local-data";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";

let db: typeof import("./db");
beforeEach(async () => { vi.resetModules(); indexedDB = new IDBFactory(); db = await import("./db"); });
afterEach(() => vi.restoreAllMocks());
async function seed() {
  await db.putCategories([{ id: "category", name: "Test category", groupName: "Test" }]);
  await putAllocatedTransactions([{ ynabTransactionId: "test-tx", orderKey: "test-order", retailer: "synthetic", date: "2000-01-01", amountCents: 1000, isRefund: false, items: [] }]);
  await putLearnedProduct({ id: "test-product", planId: "test-plan", categoryId: "category" });
  await putLearnedProduct({ id: "other-plan-product", planId: "other-plan", categoryId: "category" });
  await putProductEmbedding({ id: "test-vector", planId: "test-plan", categoryId: "category", title: "Private test title", embedding: new Float32Array([1, 0]), lastSeen: "2000-01-01" });
}
it("previews all four stores without removing records, including learning from another budget", async () => {
  await seed(); const snapshot = await db.captureLocalData();
  expect(snapshot.counts).toEqual({ allocatedTransactions: 1, learnedProducts: 2, productEmbeddings: 1, categories: 1 });
  expect(await getAllocatedTransaction("test-tx")).toBeDefined(); expect(await db.getAllCategories()).toHaveLength(1);
});
it("atomically clears the previewed stores and preserves the separate credential database", async () => {
  await seed(); const settings = await import("./settings");
  await settings.saveSettings({ accessToken: "test-only-token", planId: "test-plan", planName: "Test" });
  const snapshot = await db.captureLocalData();
  expect(await db.clearLocalDataIfUnchanged(snapshot)).toEqual({ allocatedTransactions: 0, learnedProducts: 0, productEmbeddings: 0, categories: 0 });
  expect((await db.captureLocalData()).counts).toEqual({ allocatedTransactions: 0, learnedProducts: 0, productEmbeddings: 0, categories: 0 });
  expect((await settings.getSettings()).accessToken).toBe("test-only-token");
});
it("refuses changed record keys even when counts are unchanged, preserving every store", async () => {
  await seed(); const snapshot = await db.captureLocalData();
  await db.putCategories([{ id: "replacement", name: "New category", groupName: "Test" }]);
  await expect(db.clearLocalDataIfUnchanged(snapshot)).rejects.toThrow("records changed");
  expect((await db.captureLocalData()).counts).toEqual(snapshot.counts);
  expect(await getAllocatedTransaction("test-tx")).toBeDefined();
});
it("rejects canceled operations without deleting data", async () => {
  await seed(); const snapshot = await db.captureLocalData(); const controller = new AbortController(); controller.abort();
  await expect(db.clearLocalDataIfUnchanged(snapshot, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect((await db.captureLocalData()).counts).toEqual(snapshot.counts);
});
it("aborts before clearing when the final confirmation/expiry check fails", async () => {
  await seed(); const snapshot = await db.captureLocalData();
  await expect(db.clearLocalDataIfUnchanged(snapshot, undefined, () => { throw new Error("preview canceled"); })).rejects.toThrow("preview canceled");
  expect((await db.captureLocalData()).counts).toEqual(snapshot.counts);
});
it("rolls back earlier queued clears if a later store clear fails", async () => {
  await seed(); const snapshot = await db.captureLocalData();
  const original = IDBObjectStore.prototype.clear; let calls = 0;
  vi.spyOn(IDBObjectStore.prototype, "clear").mockImplementation(function (this: IDBObjectStore) {
    if (++calls === 2) throw new Error("test-only-clear-failure"); return original.call(this);
  });
  await expect(db.clearLocalDataIfUnchanged(snapshot)).rejects.toThrow("test-only-clear-failure");
  expect((await db.captureLocalData()).counts).toEqual(snapshot.counts);
});

it("rolls back learned choices and vectors together if canceled before commit", async () => {
  await seed(); const before = await db.captureLocalData(); const controller = new AbortController();
  const original = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, row: unknown) {
    const request = original.call(this, row); controller.abort(); return request;
  });
  await expect(db.putReviewedLearning([{ id: "new-choice", planId: "test-plan", categoryId: "category" }], [], controller.signal, [], ["test-vector"])).rejects.toMatchObject({ name: "AbortError" });
  expect((await db.captureLocalData()).counts).toEqual(before.counts);
  expect(await db.getLearnedProduct("new-choice")).toBeUndefined();
  expect(await db.getAllProductEmbeddings("test-plan")).toHaveLength(1);
});

it("rolls back canceled category replacement", async () => {
  await seed(); const controller = new AbortController();
  const original = IDBObjectStore.prototype.clear;
  vi.spyOn(IDBObjectStore.prototype, "clear").mockImplementation(function (this: IDBObjectStore) {
    const request = original.call(this); controller.abort(); return request;
  });
  await expect(db.putCategories([], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(await db.getAllCategories()).toHaveLength(1);
  expect(await getAllocatedTransaction("test-tx")).toBeDefined();
});
