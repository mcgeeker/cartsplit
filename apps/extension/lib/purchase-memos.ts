import { canonicalOrderUrl } from "./register-lookup";
import type { PurchaseReview, PurchaseMemoDraft } from "./types";

export const MEMO_LIMIT = 500;
export const memoLength = (value: string) => Array.from(value).length;
export function validMemo(value: unknown): value is string | null {
  return value === null || typeof value === "string" && value.length <= 1000 && memoLength(value) <= MEMO_LIMIT;
}
export function productMemo(item: { title: string; quantity?: number | null }): string {
  return item.title + (item.quantity != null && item.quantity > 1 ? ` (Qty: ${item.quantity})` : "");
}
export function suggestTransactionMemo(review: PurchaseReview, existing: string | null): string {
  if (!review.orderId) return existing ?? "";
  const url = canonicalOrderUrl(review.orderId), original = existing ?? "";
  const pieces = [original];
  if (review.items.length === 1) {
    const product = productMemo(review.items[0]!);
    if (!original.includes(product)) pieces.push(product);
  }
  if (!original.includes(url)) pieces.push(`Amazon.ca order ${review.orderId}: ${url}`);
  return pieces.filter(Boolean).join("\n");
}
export function validateMemoDraft(value: unknown, count: number): PurchaseMemoDraft {
  const draft = value as PurchaseMemoDraft;
  if (!draft || typeof draft.transaction !== "string" || !validMemo(draft.transaction) || !Array.isArray(draft.lines) || draft.lines.length !== count || draft.lines.some(memo => typeof memo !== "string" || !validMemo(memo))) throw Error("Shorten each memo to 500 characters before preparing changes.");
  return { transaction: draft.transaction, lines: [...draft.lines] };
}
