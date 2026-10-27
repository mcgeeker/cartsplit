/** Synthetic fixtures only. Production never adopts unscoped history or
 * creates allocated-transaction records. Open the schema through db.ts first. */
import type { LearnedProduct, ProductEmbedding } from "../lib/types";
async function storeRequest(name: string, value: unknown, mode: "get" | "put") {
  await (await import("../lib/db")).captureLocalData();
  return new Promise<any>((resolve, reject) => {
    const request = indexedDB.open("lineitem", 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(name, mode === "put" ? "readwrite" : "readonly");
      const query = mode === "put" ? tx.objectStore(name).put(value) : tx.objectStore(name).get(value as IDBValidKey);
      tx.oncomplete = () => { db.close(); resolve(query.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
export const putLearnedProduct = (value: LearnedProduct) => storeRequest("learnedProducts", value, "put");
export const putProductEmbedding = (value: ProductEmbedding) => storeRequest("productEmbeddings", value, "put");
export const putAllocatedTransactions = async (rows: Record<string, unknown>[]) => { for (const row of rows) await storeRequest("allocatedTransactions", row, "put"); };
export const getAllocatedTransaction = (id: string) => storeRequest("allocatedTransactions", id, "get");
