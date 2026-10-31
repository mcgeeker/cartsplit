// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import PurchaseReview from "./PurchaseReview";
import { reviewCanadianPurchase, preparePurchaseChanges, cancelPurchaseChanges, applyPurchaseChanges } from "@/lib/messaging";
vi.mock("./useReviewTabState", () => ({ useReviewTabState: () => "active" }));
vi.mock("./useActiveOrderTab", () => ({ useActiveOrderTab: () => true }));
vi.mock("./AmazonTransactionsLink", () => ({ default: () => null }));
vi.mock("@/lib/messaging", () => ({ reviewCanadianPurchase: vi.fn(), preparePurchaseChanges: vi.fn(), cancelPurchaseChanges: vi.fn(async () => {}), applyPurchaseChanges: vi.fn(), suspendPurchaseReview: vi.fn(), reopenPurchaseReviewTab: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function setup(single = false, unconfirmed = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const item = { title: "Synthetic product", quantity: unconfirmed ? 2 : 1, priceCents: unconfirmed ? 500 : 1000, cardCents: 1000, suggestedCategoryId: "cat" };
  vi.mocked(reviewCanadianPurchase).mockResolvedValue({ review: { orderId: "synthetic", transactionMemo: "Existing", reviewId: "review", items: single ? [item] : [item, { ...item, title: "Second product" }], totalCents: single ? 1000 : 2000, summary: { subtotalCents: single ? 1000 : 2000, shippingCents: 0, feeCents: 0, taxCents: 0, giftCents: 0 } } });
  const click = async (text: string) => { await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === text)!.click()); };
  await act(async () => root.render(<PurchaseReview categories={[{ id: "cat", name: "Synthetic category", groupName: "Test" }]} />));
  await click("Review selected order");
  return { host, click, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
async function edit(field: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
it("shows original/suggested memos, prepares every line and revokes approval on an edit", async () => {
  const { host, click, close } = await setup();
  try {
    expect(host.textContent).toContain("Existing transaction memo: Existing");
    expect(host.querySelector('button[aria-label="Purchase review information"] svg')).not.toBeNull();
    expect(host.querySelectorAll("textarea")).toHaveLength(3);
    const parent = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Transaction memo"]')!;
    expect(parent.value).toContain("Existing\nAmazon.ca order synthetic:");
    const line = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Memo for line 2"]')!;
    expect(line.value).toBe("Second product"); expect(line.closest("details")!.open).toBe(false);
    await act(async () => line.closest("details")!.querySelector("summary")!.click());
    expect(line.closest("details")!.open).toBe(true);
    await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    vi.mocked(preparePurchaseChanges).mockResolvedValue({ preview: { approvalId: "grant", expiresAt: Date.now() + 300000, date: "2026-10-22", totalCents: 2000, memo: "Approved parent", lines: [{ categoryName: "Synthetic category", cents: 1000, memo: "First" }, { categoryName: "Synthetic category", cents: 1000, memo: "Second" }] } });
    await click("Prepare changes");
    expect(preparePurchaseChanges).toHaveBeenCalledWith("review", [false, false], [{ id: "cat", name: "Synthetic category" }, { id: "cat", name: "Synthetic category" }], true, undefined, [], expect.objectContaining({ transaction: parent.value, lines: ["Synthetic product", "Second product"] }));
    expect(host.textContent).toContain("Proposed transaction memo: Approved parent"); expect(host.textContent).toContain("Line memo: Second");
    await edit(parent, "Edited parent");
    expect(parent.value).toBe("Edited parent"); expect(host.querySelector('[aria-label="Prepared changes"]')).toBeNull();
    expect(cancelPurchaseChanges).toHaveBeenCalledWith("grant"); expect(applyPurchaseChanges).not.toHaveBeenCalled();
  } finally { await close(); }
});
it("offers collapsed editable line memos before prices are confirmed and preserves their drafts", async () => {
  const { host, close } = await setup(false, true);
  try {
    expect(host.textContent).toContain("Confirm each item’s total price");
    expect([...host.querySelectorAll("button")].some(button => button.textContent === "Prepare changes")).toBe(false);
    const line = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Memo for line 1"]')!;
    expect(line).not.toBeNull(); expect(line.disabled).toBe(false); expect(line.closest("details")!.open).toBe(false);
    await act(async () => line.closest("details")!.querySelector("summary")!.click());
    await edit(line, "Edited before price confirmation");
    const confirmations = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await act(async () => confirmations.forEach(input => input.click()));
    expect(line.value).toBe("Edited before price confirmation"); expect(line.closest("details")!.open).toBe(true);
    await act(async () => host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]!.click());
    expect(line.value).toBe("Edited before price confirmation"); expect(line.closest("details")!.open).toBe(true);
    expect(preparePurchaseChanges).not.toHaveBeenCalled(); expect(applyPurchaseChanges).not.toHaveBeenCalled();
  } finally { await close(); }
});
it("blocks overlong input without truncating and keeps a sole-product memo on the parent", async () => {
  const { host, close } = await setup(true);
  try {
    expect(host.querySelectorAll("textarea")).toHaveLength(1);
    const parent = host.querySelector<HTMLTextAreaElement>("textarea")!; expect(parent.value).toContain("Synthetic product");
    await edit(parent, "x".repeat(501));
    expect(parent.value).toHaveLength(501); expect(host.textContent).toContain("501/500 characters");
    expect([...host.querySelectorAll("button")].find(button => button.textContent === "Prepare changes")!.disabled).toBe(true);
    await edit(parent, ""); expect([...host.querySelectorAll("button")].find(button => button.textContent === "Prepare changes")!.disabled).toBe(false);
  } finally { await close(); }
});
