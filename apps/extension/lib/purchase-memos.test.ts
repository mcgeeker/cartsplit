import { expect, it } from "vitest";
import { memoLength, productMemo, suggestTransactionMemo, validMemo, validateMemoDraft } from "./purchase-memos";
import type { PurchaseReview } from "./types";
const review: PurchaseReview = { orderId: "synthetic-order", items: [{ title: "Synthetic product", quantity: 2, cardCents: 1000 }], totalCents: 1000 };
it("preserves existing text, suggests quantity/product and canonical order link, and avoids duplicates", () => {
  const memo = suggestTransactionMemo(review, "Existing bank memo");
  expect(memo).toBe("Existing bank memo\nSynthetic product (Qty: 2)\nAmazon.ca order synthetic-order: https://www.amazon.ca/your-orders/order-details?orderID=synthetic-order");
  expect(suggestTransactionMemo(review, memo)).toBe(memo);
  expect(productMemo({ title: "Synthetic", quantity: 1 })).toBe("Synthetic");
  expect(suggestTransactionMemo({ ...review, items: [...review.items, ...review.items] }, null)).not.toContain("Synthetic product");
});
it("counts Unicode characters without truncation and rejects overlong or malformed drafts", () => {
  expect(memoLength("🎢".repeat(500))).toBe(500); expect(validMemo("🎢".repeat(500))).toBe(true); expect(validMemo("🎢".repeat(501))).toBe(false);
  expect(validateMemoDraft({ transaction: "", lines: [""] }, 1)).toEqual({ transaction: "", lines: [""] });
  for (const draft of [{ transaction: "x".repeat(501), lines: [""] }, { transaction: "", lines: [null] }, { transaction: "", lines: [] }]) expect(() => validateMemoDraft(draft, 1)).toThrow("500 characters");
});
