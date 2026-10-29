import { putLearnedProduct, putProductEmbedding } from "../test-support/local-data";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";

/**
 * Runs against a real (in-memory) IndexedDB — the point is the v1→v2 schema
 * migration and preservation of dormant historical rows, which mocks can't exercise. beforeEach
 * swaps in a fresh IDBFactory; freshDb only resets the module cache (db.ts
 * caches its open connection at module scope), so anything seeded into the
 * current factory — e.g. a v1 database — is what the fresh module opens.
 */
async function freshDb() {
  vi.resetModules();
  return import("./db");
}

/** Create the database at v1 (pre-plan-scoping schema) and seed unscoped
 *  learning rows, exactly as an existing install would have on disk. */
function seedV1(rows: { id: string; categoryId: string; title?: string }[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("lineitem", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const txStore = db.createObjectStore("allocatedTransactions", { keyPath: "ynabTransactionId" });
      txStore.createIndex("orderKey", "orderKey", { unique: false });
      db.createObjectStore("learnedProducts", { keyPath: "id" });
      db.createObjectStore("productEmbeddings", { keyPath: "id" });
      db.createObjectStore("categories", { keyPath: "id" });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["learnedProducts", "productEmbeddings"], "readwrite");
      for (const row of rows) {
        tx.objectStore("learnedProducts").put({ id: row.id, categoryId: row.categoryId });
        if (row.title !== undefined) {
          tx.objectStore("productEmbeddings").put({
            id: row.id,
            categoryId: row.categoryId,
            title: row.title,
            embedding: new Float32Array([1, 0, 0]),
            lastSeen: "2026-01-01T00:00:00Z",
          });
        }
      }
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
}

beforeEach(() => {
  indexedDB = new IDBFactory();
});

describe("learnedKey", () => {
  it("builds the plan-scoped storage key", async () => {
    const db = await freshDb();
    expect(db.learnedKey("plan-a", "amazon", "B0XXXX")).toBe("plan-a:amazon:B0XXXX");
  });
});

describe("v1 → v2 migration", () => {
  it("opens a v1 database and keeps its rows, invisible to plan-scoped reads", async () => {
    await seedV1([{ id: "amazon:A", categoryId: "cat-1", title: "Paper towels" }]);
    const db = await freshDb();

    // The legacy row survives the upgrade under its old key…
    expect(await db.getLearnedProduct("amazon:A")).toEqual({
      id: "amazon:A",
      categoryId: "cat-1",
    });
    // …but has no planId, so it's a cache miss for scoped reads and absent
    // from the planId index — a missed suggestion, never a wrong one.
    expect(await db.getLearnedProduct(db.learnedKey("plan-a", "amazon", "A"))).toBeUndefined();
    expect(await db.getAllProductEmbeddings("plan-a")).toEqual([]);
  });
});

describe("plan-scoped reads and writes", () => {
  it("getAllProductEmbeddings returns only the requested plan's pool", async () => {
    const db = await freshDb();
    const embedding = new Float32Array([0, 1, 0]);
    await putProductEmbedding({
      id: "plan-a:amazon:A",
      planId: "plan-a",
      categoryId: "cat-1",
      title: "A",
      embedding,
      lastSeen: "2026-01-01T00:00:00Z",
    });
    await putProductEmbedding({
      id: "plan-b:amazon:A",
      planId: "plan-b",
      categoryId: "cat-9",
      title: "A on the other plan",
      embedding,
      lastSeen: "2026-01-01T00:00:00Z",
    });

    const pool = await db.getAllProductEmbeddings("plan-a");
    expect(pool.map((r) => r.id)).toEqual(["plan-a:amazon:A"]);
  });

  it("round-trips a learned product under its plan-scoped key", async () => {
    const db = await freshDb();
    const id = db.learnedKey("plan-a", "amazon", "B0XXXX");
    await putLearnedProduct({ id, planId: "plan-a", categoryId: "cat-1" });
    expect(await db.getLearnedProduct(id)).toEqual({ id, planId: "plan-a", categoryId: "cat-1" });
  });
});

it('atomically replaces reviewed choices and deletes ambiguous keys without changing other local stores',async()=>{
 const db=await freshDb();
 await db.putReviewedLearning([{id:'plan:amazon-ca-reviewed:A',planId:'plan',categoryId:'old'},{id:'plan:amazon-ca-reviewed:B',planId:'plan',categoryId:'old'}],[]);
 await db.putReviewedLearning([{id:'plan:amazon-ca-reviewed:A',planId:'plan',categoryId:'new'}],['plan:amazon-ca-reviewed:B']);
 expect(await db.getLearnedProduct('plan:amazon-ca-reviewed:A')).toMatchObject({categoryId:'new'});
 expect(await db.getLearnedProduct('plan:amazon-ca-reviewed:B')).toBeUndefined();
 const canceled=new AbortController();canceled.abort();
 await expect(db.putReviewedLearning([],['plan:amazon-ca-reviewed:A'],canceled.signal)).rejects.toThrow();
 expect(await db.getLearnedProduct('plan:amazon-ca-reviewed:A')).toMatchObject({categoryId:'new'});
});

it('commits reviewed choices and vectors together, removes conflicting vectors and rolls back clone failure',async()=>{
 const db=await freshDb();const row={id:'p:amazon-ca-reviewed:A',planId:'p',categoryId:'a'};
 const v={...row,title:'',embedding:new Float32Array([1,0]),lastSeen:'2026-10-24',modelId:'test'};
 await db.putReviewedLearning([row],[],undefined,[v]);
 expect(await db.getAllProductEmbeddings('p')).toEqual([v]);
 // A non-cloneable field aborts the transaction after its category put was queued.
 await expect(db.putReviewedLearning([{...row,categoryId:'b'}],[],undefined,[{...v,title:(()=>{}) as unknown as string}])).rejects.toThrow();
 expect(await db.getLearnedProduct(row.id)).toEqual(row);expect(await db.getAllProductEmbeddings('p')).toEqual([v]);
 await db.putReviewedLearning([], [row.id]);
 expect(await db.getLearnedProduct(row.id)).toBeUndefined();expect(await db.getAllProductEmbeddings('p')).toEqual([]);
});

it("hides categories from an uncommitted or different plan without migrating old cache rows", async () => {
  const db = await freshDb(), category = { id: "cat", name: "Synthetic", groupName: "Test" };
  await db.putCategories([category]);
  expect(await db.getAllCategories("plan-a")).toEqual([]);
  await db.putCategories([category], undefined, "plan-b");
  expect(await db.getAllCategories("plan-a")).toEqual([]);
  expect(await db.getAllCategories("plan-b")).toEqual([category]);
});

it("preserves YNAB category order across cache reopening, refreshes and plan switches", async () => {
  const db = await freshDb();
  // Deliberately differs from both alphabetical and primary-key order.
  const categories = [
    { id: "z", name: "🛒 Groceries", groupName: "Everyday", groupId: "group-z" },
    { id: "b", name: "Transport", groupName: "Everyday", groupId: "group-z" },
    { id: "a", name: "Annual fees", groupName: "Annual", groupId: "group-a" },
  ];
  await db.putCategories(categories, undefined, "plan-a");
  const reopened = await freshDb();
  expect(await reopened.getAllCategories("plan-a")).toEqual(categories);
  const reordered = [categories[2]!, categories[1]!, categories[0]!];
  await reopened.putCategories(reordered, undefined, "plan-a");
  expect(await reopened.getAllCategories("plan-a")).toEqual(reordered);
  await reopened.putCategories([categories[1]!], undefined, "plan-b");
  expect(await reopened.getAllCategories("plan-a")).toEqual([]);
  expect(await reopened.getAllCategories("plan-b")).toEqual([categories[1]]);
});

it("reads a legacy cache without positions and acquires order on refresh without a schema upgrade", async () => {
  const db = await freshDb();
  await db.getAllCategories();
  const categories = [
    { id: "z", name: "Zed", groupName: "Test" },
    { id: "a", name: "Alpha", groupName: "Test" },
  ];
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("lineitem", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const handle = request.result;
      const tx = handle.transaction("categories", "readwrite");
      for (const category of categories) tx.objectStore("categories").put({ ...category, planId: "plan-a" });
      tx.oncomplete = () => { handle.close(); resolve(); };
      tx.onabort = () => { handle.close(); reject(tx.error); };
    };
  });
  expect(await db.getAllCategories("plan-a")).toEqual([categories[1], categories[0]]);
  await db.putCategories(categories, undefined, "plan-a");
  expect(await db.getAllCategories("plan-a")).toEqual(categories);
});
it("rejects a blocked upgrade promptly and recovers after the old connection closes", async () => {
  await seedV1([]);
  const held = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lineitem", 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const db = await freshDb();
  try { await expect(db.getAllCategories("plan-a")).rejects.toThrow("Close other CartSplit panels"); }
  finally { held.close(); }
  expect(await db.getAllCategories("plan-a")).toEqual([]);
});
it("reopens its cached handle after an external version-change close", async () => {
  const db = await freshDb(); await db.getAllCategories("plan-a");
  const open = indexedDB.open("lineitem", 2);
  const handle = await new Promise<IDBDatabase>(resolve => { open.onsuccess = () => resolve(open.result); });
  // A version-change event tells the cached production handle to close.
  handle.close();
  const upgrade = indexedDB.open("lineitem", 3);
  upgrade.onupgradeneeded = () => upgrade.transaction!.abort();
  await new Promise<void>(resolve => { upgrade.onerror = () => resolve(); });
  expect(await db.getAllCategories("plan-a")).toEqual([]);
});
