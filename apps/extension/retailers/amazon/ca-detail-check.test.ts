// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { inspectAmazonCaDetail, isAmazonCaDetailUrl, sanitizeAmazonCaDetail } from "./ca-detail-check";
const url = "https://www.amazon.ca/your-orders/order-details?orderID=synthetic-only";
function doc(price = "$12.00", subtotal = "$12.00", lang = "en-CA") {
  const d = new DOMParser().parseFromString(`<html lang="${lang}"><body><div class="a-fixed-left-grid-inner"><span class="a-color-price">${price}</span></div><div class="a-row"><span>Item(s) Subtotal:</span><span>${subtotal}</span></div></body></html>`, "text/html");
  return d;
}
it("returns only counts and equality for the explicit Canadian detail path", () => {
  expect(inspectAmazonCaDetail(doc(), url)).toEqual({ language: "english", itemRows: 1, readablePrices: 1, subtotalReadable: true, subtotalStatus: "readable", singleItemPriceMatchesSubtotal: true, orderSummary: { readableRows: 1, currencyLabelsConsistent: null, beforeTaxMatches: null, grandTotalMatches: null } });
  expect(inspectAmazonCaDetail(doc("$12.00", "$13.00"), url).singleItemPriceMatchesSubtotal).toBe(false);
});
it.each(["https://www.amazon.com/your-orders/order-details", "http://www.amazon.ca/your-orders/order-details", "https://www.amazon.ca.evil.invalid/your-orders/order-details", "https://www.amazon.ca/your-orders/order-details-extra", "https://user@www.amazon.ca/your-orders/order-details", "invalid"])("rejects unapproved URLs: %s", (href) => {
  expect(isAmazonCaDetailUrl(href)).toBe(false); expect(() => inspectAmazonCaDetail(doc(), href)).toThrow();
});
it.each(["USD 12.00", "$12.00 garbage", "", "-$12.00 extra"])("does not claim a readable price for %s", (price) => {
  const r = inspectAmazonCaDetail(doc(price), url); expect(r.readablePrices).toBe(0); expect(r.singleItemPriceMatchesSubtotal).toBeNull();
});
it("does not compare conflicting explicit/unspecified currencies", () => {
  expect(inspectAmazonCaDetail(doc("CAD 12.00"), url).singleItemPriceMatchesSubtotal).toBeNull();
});
it.each(["fr-CA", ""])("does not inspect unsupported or unknown language %s", (lang) => {
  expect(inspectAmazonCaDetail(doc("$12.00", "$12.00", lang), url).itemRows).toBe(0);
});
it("handles fallback layouts and unknown/duplicate subtotal without fabricating success", () => {
  const d = doc(); d.querySelector(".a-fixed-left-grid-inner")!.className = "yo-item";
  expect(inspectAmazonCaDetail(d, url).itemRows).toBe(1);
  d.body.append(d.querySelector(".a-row")!.cloneNode(true));
  expect(inspectAmazonCaDetail(d, url).subtotalReadable).toBe(false);
  expect(inspectAmazonCaDetail(d, url).singleItemPriceMatchesSubtotal).toBeNull();
});
it("does not compare multiple items and bounds rows", () => {
  const d = doc(); d.body.append(d.querySelector(".a-fixed-left-grid-inner")!.cloneNode(true));
  expect(inspectAmazonCaDetail(d, url).singleItemPriceMatchesSubtotal).toBeNull();
  d.body.innerHTML = '<div class="yo-item"></div>'.repeat(201);
  expect(() => inspectAmazonCaDetail(d, url)).toThrow("Too many");
});
it("drops private fields and rejects impossible or malformed replies", () => {
  const result = inspectAmazonCaDetail(doc(), url);
  expect(sanitizeAmazonCaDetail({ ...result, orderId: "synthetic", html: "private", amount: 1200 })).toEqual(result);
  for (const value of [null, {}, { ...result, itemRows: -1 }, { ...result, readablePrices: 2 }, { ...result, itemRows: 2 }, { ...result, language: "other" }, { ...result, subtotalReadable: false }]) expect(() => sanitizeAmazonCaDetail(value)).toThrow();
});

it.each([
  '<div><div>Item(s) Subtotal:</div><div>$12.00</div></div>',
  '<div><div><span>Item(s) Subtotal:</span></div><div><span>$12.00</span></div></div>',
  '<table><tr><td>Items Subtotal:</td><td>$12.00</td></tr></table>',
  '<dl><dt>Item Subtotal:</dt><dd>$12.00</dd><dt>Tax:</dt><dd>$1.56</dd></dl>',
  '<div><label>Item(s)\u00a0Subtotal:</label><span> $12.00 </span></div>',
])("recognizes bounded modern subtotal rows without legacy classes: %s", (html) => {
  const d = doc(); d.querySelector(".a-row")!.outerHTML = html;
  const r = inspectAmazonCaDetail(d, url);
  expect(r.subtotalStatus).toBe("readable"); expect(r.singleItemPriceMatchesSubtotal).toBe(true);
});
it.each([
  ['<div>Grand Total: $12.00</div>', 'label-not-found'],
  ['<div><div>Item(s) Subtotal:</div><div>$12.00 Tax: $1.56</div></div>', 'amount-not-readable'],
  ['<div><div>Item(s) Subtotal:</div><div>USD 12.00</div></div>', 'amount-not-readable'],
  ['<div><div>Item(s) Subtotal:</div><div>-$12.00</div></div>', 'amount-not-readable'],
  ['<div><span>Item(s) Subtotal:</span><span>$12.00</span></div><div><span>Item(s) Subtotal:</span><span>$12.00</span></div>', 'ambiguous'],
])("does not fabricate subtotal from ambiguous or unrelated totals: %s", (html, status) => {
  const d = doc(); d.querySelector(".a-row")!.outerHTML = html;
  const r = inspectAmazonCaDetail(d, url); expect(r.subtotalReadable).toBe(false); expect(r.subtotalStatus).toBe(status);
  expect(r.singleItemPriceMatchesSubtotal).toBeNull();
});
it("rejects forged subtotal status fields rather than echoing arbitrary text", () => {
  const r = inspectAmazonCaDetail(doc(), url);
  expect(() => sanitizeAmazonCaDetail({ ...r, subtotalStatus: "private-test-order" })).toThrow();
  expect(() => sanitizeAmazonCaDetail({ ...r, subtotalStatus: "ambiguous" })).toThrow();
});
