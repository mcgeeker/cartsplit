// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { compareCanadianOrderAmount, inspectAmazonCaDetail, sanitizeAmazonCaDetail } from "./ca-detail-check";
const url = "https://www.amazon.ca/your-orders/order-details?orderID=synthetic";
const labels = ["Item(s) Subtotal:", "Shipping & Handling:", "Total before tax:", "Estimated PST/RST/ QST:", "Estimated GST/HST:", "Grand Total:"];
// Synthetic amounts, unrelated to the user's order.
function doc(amounts = ["$10.00", "$2.00", "$12.00", "$0.00", "$1.56", "$13.56"]) {
  return new DOMParser().parseFromString('<html lang="en-CA"><body>'+labels.map((label, i) => `<div><div><span>${label}</span></div><div>${amounts[i]}</div></div>`).join('')+'</body></html>', 'text/html');
}
it("checks all six rows and both equations, including zero PST and shipping", () => {
  expect(inspectAmazonCaDetail(doc(), url).orderSummary).toEqual({ readableRows: 6, currencyLabelsConsistent: true, beforeTaxMatches: true, grandTotalMatches: true });
  expect(inspectAmazonCaDetail(doc(["$10.00", "$0.00", "$10.00", "$0.00", "$1.30", "$11.30"]), url).orderSummary?.grandTotalMatches).toBe(true);
});
it("reports inconsistent totals without masking them through rounding", () => {
  const r = inspectAmazonCaDetail(doc(["$10.00", "$2.00", "$12.01", "$0.00", "$1.56", "$13.56"]), url).orderSummary!;
  expect(r.beforeTaxMatches).toBe(false); expect(r.grandTotalMatches).toBe(false);
});
it.each(["", "USD 2.00", "-$2.00", "$2 garbage", "$2.001"])("does not replace unreadable/missing shipping with zero: %s", (shipping) => {
  const r = inspectAmazonCaDetail(doc(["$10.00", shipping, "$12.00", "$0.00", "$1.56", "$13.56"]), url).orderSummary!;
  expect(r.readableRows).toBe(5); expect(r.beforeTaxMatches).toBeNull(); expect(r.grandTotalMatches).toBeNull();
});
it("does not combine bare dollars with explicit CAD labels", () => {
  const r = inspectAmazonCaDetail(doc(["CAD 10.00", "$2.00", "$12.00", "$0.00", "$1.56", "$13.56"]), url).orderSummary!;
  expect(r.readableRows).toBe(6); expect(r.currencyLabelsConsistent).toBe(false); expect(r.grandTotalMatches).toBeNull();
});
it("accepts uniform explicit CAD labels and tax-label whitespace", () => {
  const d = doc(["CAD 10.00", "CAD 2.00", "CAD 12.00", "CAD 0.00", "CAD 1.56", "CAD 13.56"]);
  expect(inspectAmazonCaDetail(d, url).orderSummary?.grandTotalMatches).toBe(true);
});
it("does not accept duplicate summary rows or substitute grand total for subtotal", () => {
  const d = doc(); d.body.append(d.body.children[0]!.cloneNode(true));
  expect(inspectAmazonCaDetail(d, url).orderSummary?.readableRows).toBe(5);
  expect(inspectAmazonCaDetail(d, url).orderSummary?.grandTotalMatches).toBeNull();
});
it("rejects unsafe summed cents rather than comparing rounded large values", () => {
  const d = doc(["$90071992547409.90", "$1.00", "$90071992547409.90", "$0.00", "$0.00", "$90071992547409.90"]);
  expect(inspectAmazonCaDetail(d, url).orderSummary?.beforeTaxMatches).toBeNull();
});
it("returns only arithmetic flags/counts and drops extra monetary/private fields", () => {
  const r = inspectAmazonCaDetail(doc(), url);
  const safe = sanitizeAmazonCaDetail({ ...r, orderSummary: { ...r.orderSummary, subtotal: 1000, grandTotal: 1356, orderId: "private-test" } });
  expect(safe).toEqual(r); expect(JSON.stringify(safe)).not.toMatch(/1356|1000|private-test/);
  for (const bad of [null, {}, { ...r.orderSummary, readableRows: 7 }, { ...r.orderSummary, readableRows: 2 }, { ...r.orderSummary, currencyLabelsConsistent: false }, { ...r.orderSummary, beforeTaxMatches: "yes" }]) expect(() => sanitizeAmazonCaDetail({ ...r, orderSummary: bad })).toThrow();
});

it("compares the entered charge without returning the order monetary values", () => {
  function candidate(amounts?: string[]) { const d = doc(amounts); d.body.insertAdjacentHTML("afterbegin", '<div class="a-fixed-left-grid-inner"><span class="a-color-price">$10.00</span></div>'); return d; }
  expect(compareCanadianOrderAmount(candidate(), url, 1356)).toEqual({ matches: true });
  expect(compareCanadianOrderAmount(candidate(), url, 1357)).toEqual({ matches: false });
  expect(() => compareCanadianOrderAmount(candidate(), url, "13.56")).toThrow();
  expect(compareCanadianOrderAmount(candidate(["$10.00", "$2.00", "$12.00", "$0.00", "$1.56", "$13.57"]), url, 1357)).toEqual({ matches: false });
});
