import { LocalDataError } from "./local-data-error";
import type {
  Category,
  LearnedProduct,
  ProductEmbedding,
  LocalDataCounts,
} from "./types";

const DB_NAME = "lineitem";
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  let abandoned = false;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      if (abandoned) { request.transaction?.abort(); return; }
      const db = request.result;

      if (event.oldVersion < 1) {
        // allocatedTransactions: primary key = ynabTransactionId, secondary index = orderKey
        const txStore = db.createObjectStore("allocatedTransactions", { keyPath: "ynabTransactionId" });
        txStore.createIndex("orderKey", "orderKey", { unique: false });

        // learnedProducts: forever-row exact-match cache (id → categoryId).
        db.createObjectStore("learnedProducts", { keyPath: "id" });

        // productEmbeddings: bounded embedding pool, evicted oldest-first.
        db.createObjectStore("productEmbeddings", { keyPath: "id" });

        db.createObjectStore("categories", { keyPath: "id" });
      }

      if (event.oldVersion < 2) {
        // v2: plan-scoped embeddings. Unscoped historical rows stay dormant;
        // their origin must never be inferred from the current connection.
        request
          .transaction!.objectStore("productEmbeddings")
          .createIndex("planId", "planId", { unique: false });
      }
    };
    const fail = () => {
      abandoned = true;
      reject(new Error("Could not open local data. Close other CartSplit panels and reopen."));
    };
    request.onblocked = fail;
    request.onerror = fail;
    request.onsuccess = () => {
      const db = request.result;
      if (abandoned) { db.close(); return; }
      const reset = () => { if (dbPromise === pending) dbPromise = null; };
      db.onversionchange = () => { db.close(); reset(); };
      db.onclose = reset;
      resolve(db);
    };
  });
  dbPromise = pending;
  void pending.catch(() => { if (dbPromise === pending) dbPromise = null; });
  return pending;
}

async function getStore(
  storeName: string,
  mode: IDBTransactionMode = "readonly",
): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}


/** Await commit, and roll back a pending mutation if its operation is canceled. */
async function mutateStores(names: string[], write: (tx: IDBTransaction) => void, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const db = await openDB();
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, "readwrite");
    let failure: unknown;
    const abort = () => { try { tx.abort(); } catch { /* Commit already finished. */ } };
    const cleanup = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    tx.oncomplete = () => { cleanup(); resolve(); };
    tx.onabort = () => { cleanup(); reject(signal?.aborted ? signal.reason : failure ?? tx.error ?? new Error("Local data update aborted.")); };
    try { signal?.throwIfAborted(); write(tx); }
    catch (error) { failure = error; abort(); }
  });
}

/** Atomically replace reviewed product choices and forget ambiguous assignments. */
export function putReviewedLearning(rows:LearnedProduct[], removed:string[], signal?:AbortSignal, embeddings:ProductEmbedding[]=[], removedVectors:string[]=[]):Promise<void>{
  return mutateStores(["learnedProducts", "productEmbeddings"],tx=>{
    const store=tx.objectStore("learnedProducts"), vectors=tx.objectStore("productEmbeddings");
    for(const id of removed)store.delete(id);
    for(const row of rows)store.put(row);
    for(const id of [...removed,...removedVectors])vectors.delete(id);
    for(const row of embeddings)vectors.put(row);
  },signal);
}

// --- Learned Products (forever-row cache) ---

/** Storage key for a learned row. Plan-scoped so the same product learned on
 *  two plans never collides — categoryId only exists in the plan it was
 *  learned on. */
export function learnedKey(planId: string, retailer: string, productId: string): string {
  return `${planId}:${retailer}:${productId}`;
}

export async function getLearnedProduct(id: string): Promise<LearnedProduct | undefined> {
  const store = await getStore("learnedProducts");
  return requestToPromise(store.get(id));
}


// --- Product Embeddings (capped similarity pool) ---

/** The connected plan's embedding pool only — other plans' rows stay dormant
 *  until the user switches back. */
export async function getAllProductEmbeddings(planId: string): Promise<ProductEmbedding[]> {
  const store = await getStore("productEmbeddings");
  return requestToPromise(store.index("planId").getAll(planId));
}

// --- Categories ---

export async function getAllCategories(planId?: string): Promise<Category[]> {
  const store = await getStore("categories");
  const rows = await requestToPromise<(Category & { planId?: string; position?: number })[]>(store.getAll());
  return rows.filter(row => planId === undefined || row.planId === planId)
    // IndexedDB reads in primary-key order. Restore the sequence from YNAB;
    // old caches have no positions until the owner refreshes categories.
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
    .map(({ id, name, groupName, groupId }) => ({ id, name, groupName,
      ...(groupId !== undefined ? { groupId } : {}) }));
}

/** Replace all categories atomically. */
export async function putCategories(categories: Category[], signal?: AbortSignal, planId?: string): Promise<void> {
  return mutateStores(["categories"], (tx) => {
    const store = tx.objectStore("categories");
    store.clear();
    categories.forEach((cat, position) => store.put({ ...cat, position, ...(planId ? { planId } : {}) }));
  }, signal);
}

const LOCAL_DATA_STORES = ["allocatedTransactions", "learnedProducts", "productEmbeddings", "categories"] as const;
type LocalDataStore = typeof LOCAL_DATA_STORES[number];
/** Background-only keys. The UI gets counts, never record identifiers/titles. */
export interface LocalDataSnapshot {
  keys: Record<LocalDataStore, IDBValidKey[]>;
  counts: LocalDataCounts;
}

/** Capture all four stores in one snapshot, or compare and clear them in one
 * atomic transaction. No connection DB, browser cache, or storage.local access. */
async function localDataTransaction(expected?: LocalDataSnapshot, signal?: AbortSignal, beforeClear?: () => void): Promise<LocalDataSnapshot> {
  signal?.throwIfAborted();
  const db = await openDB();
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...LOCAL_DATA_STORES], expected ? "readwrite" : "readonly");
    const keys = {} as LocalDataSnapshot["keys"];
    let remaining = LOCAL_DATA_STORES.length;
    let failure: unknown;
    const abort = () => { try { tx.abort(); } catch { /* Already completed. */ } };
    const cleanup = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    tx.onabort = () => {
      cleanup();
      reject(signal?.aborted ? signal.reason : failure ?? new Error("Could not update the local data. No deletion was committed."));
    };
    tx.oncomplete = () => {
      cleanup();
      const counts = Object.fromEntries(LOCAL_DATA_STORES.map((store) => [store, keys[store].length])) as unknown as LocalDataCounts;
      resolve({ keys, counts });
    };
    for (const name of LOCAL_DATA_STORES) {
      const request = tx.objectStore(name).getAllKeys();
      request.onsuccess = () => {
        keys[name] = request.result;
        if (--remaining || !expected) return;
        try {
          signal?.throwIfAborted();
          if (LOCAL_DATA_STORES.some((store) => JSON.stringify(keys[store]) !== JSON.stringify(expected.keys[store]))) {
            throw new LocalDataError("Local records changed. Preview local data removal again.");
          }
          beforeClear?.();
          for (const store of LOCAL_DATA_STORES) { tx.objectStore(store).clear(); keys[store] = []; }
        } catch (error) { failure = error; abort(); }
      };
    }
  });
}

export function captureLocalData(signal?: AbortSignal): Promise<LocalDataSnapshot> {
  return localDataTransaction(undefined, signal);
}

export async function clearLocalDataIfUnchanged(expected: LocalDataSnapshot, signal?: AbortSignal, beforeClear?: () => void): Promise<LocalDataCounts> {
  return (await localDataTransaction(expected, signal, beforeClear)).counts;
}
