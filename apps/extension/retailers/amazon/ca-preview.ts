import { OrderReviewError, type OrderReviewFailure } from "@/lib/order-review-status";
import type { CanadianPreviewFailure } from "@/lib/canadian-preview-status";
import { SELECTORS, ASIN_REGEX } from "./selectors";
import { inspectDollarAmount, isEnglishCalendarDate } from "./ca-page-check";
import { amazonCaCheckPage } from "./storefront";
import { inspectAmazonCaDetail, isAmazonCaDetailUrl, findLabeledAmount } from "./ca-detail-check";

export type PaymentFunding = "card" | "gift_card" | "unknown";
export type CaPayment = { funding?:PaymentFunding; date: string; amountCents: number; orderId: string | null; refund: boolean; currency: "CAD" | "unspecified" };
export type CaOrder = { orderId: string; productId: string; title: string; subtotalCents: number; totalCents: number; currency: "CAD" | "unspecified" };
const ID = /^[A-Za-z0-9-]{1,64}$/;
export class CanadianOrderIdentityError extends Error {
  constructor(readonly stage: CanadianPreviewFailure) { super(`Order identity check stopped: ${stage}`); }
}
export function canadianOrderId(href: string): string {
  let u: URL;
  try { u = new URL(href); } catch { throw new CanadianOrderIdentityError("order-url"); }
  if (u.origin !== "https://www.amazon.ca" || u.username || u.password ||
      !/^\/(?:your-orders\/order-details|gp\/css\/order-details|gp\/css\/summary\/edit\.html)\/?$/.test(u.pathname)) throw new CanadianOrderIdentityError("order-url");
  const ids: string[] = [];
  // Avoid depending on a browser-world iterator when reading URLSearchParams.
  try { u.searchParams.forEach((value, key) => { if (key.toLowerCase() === "orderid") ids.push(value); }); }
  catch { throw new CanadianOrderIdentityError("order-query-api"); }
  if (ids.length === 0) throw new CanadianOrderIdentityError("order-query-missing");
  if (ids.length !== 1) throw new CanadianOrderIdentityError("order-query-duplicate");
  if (!ID.test(ids[0]!)) throw new CanadianOrderIdentityError("order-query-format");
  return ids[0]!;
}
function isoDate(text: string): string {
  if (!isEnglishCalendarDate(text)) throw new Error("Unreadable payment date.");
  const match = text.trim().match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i)!;
  const names = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return `${match[3]}-${String(names.indexOf(match[1]!.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
}
/** Recognize a dedicated method label, never an amount or arbitrary substring.
 * Return only an enum; card details and label text never leave the reader. */
function paymentFunding(row:Element):PaymentFunding|undefined{
 const orderLink=row.querySelector(SELECTORS.orderLink);
 const labels=[...row.querySelectorAll('span,div')].filter(el=>!el.closest('a')&&!!orderLink&&!!(el.compareDocumentPosition(orderLink)&Node.DOCUMENT_POSITION_FOLLOWING)).map(el=>(el.textContent??'').replace(/\s+/g,' ').trim());
 const gift=labels.some(text=>/^(?:(?:Amazon(?:\.ca)?)\s+)?Gift\s+(?:Card|Certificate)(?:\s+Balance)?\s*:?$/i.test(text));
 const card=labels.some(text=>/^(?:Visa|Mastercard|American Express|Amex|Discover|Credit Card|Debit Card)(?:\s+[*•xX·-]+\s*\d{2,4})?$/i.test(text));
 if(gift&&card)throw new OrderReviewError('paymentsFunding');
 return gift?'gift_card':card?'card':undefined;
}
/** Explicit preview read only. Any unreadable row stops uniqueness claims. */
export function readCanadianPayments(doc: Document, href: string): CaPayment[] {
  let stage: OrderReviewFailure = "paymentsPage";
  try {
  if (amazonCaCheckPage(href) !== "transactions") throw new Error("Unsupported Canadian payments page.");
  stage = "paymentsLanguage";
  if (!/^en(?:[-_][a-z]{2})?$/i.test(doc.documentElement.lang)) throw new Error("Unsupported Canadian payments language.");
  stage = "paymentsRows";
  const all = [...doc.querySelectorAll(SELECTORS.lineItem)];
  if (!all.length || all.length > 200) throw new Error("Use one bounded payments page.");
  stage = "paymentsDates";
  const dates = new Map<Element, string>();
  for (const container of doc.querySelectorAll(SELECTORS.dateContainer)) {
    const rows = [...(container.nextElementSibling?.querySelectorAll(SELECTORS.lineItem) ?? [])];
    if (!rows.length) continue;
    const date = isoDate(container.querySelector("span")?.textContent ?? "");
    for (const row of rows) { if (dates.has(row)) throw new Error("Ambiguous payment date."); dates.set(row, date); }
  }
  return all.map((row) => {
    const date = dates.get(row); const text = row.querySelector(SELECTORS.amountSpan)?.textContent ?? "";
    stage = "paymentsDates";
    if (!date) throw new Error("Missing payment date.");
    stage = "paymentsAmounts";
    const amount = inspectDollarAmount(text);
    if (!amount || !amount.cents || amount.currency === "USD") throw new Error("Unreadable payment row.");
    stage = "paymentsLinks";
    const links = [...row.querySelectorAll(SELECTORS.orderLink)];
    if (links.length > 1) throw new Error("Ambiguous order link.");
    const href = links[0]?.getAttribute("href");
    const orderId=href ? canadianOrderId(new URL(href, "https://www.amazon.ca").href) : null;
    stage="paymentsFunding";const funding=paymentFunding(row);
    return { ...(funding?{funding}:{}),date, amountCents: Math.abs(amount.cents), orderId,
      refund: /refund/i.test(row.textContent ?? "") || /^\s*\+/.test(text) || /^\s*(?:CA\$|C\$|CAD|\$)\s*\+/.test(text), currency: amount.currency };
  });
  } catch { throw new OrderReviewError(stage); }
}
export class CanadianOrderReadError extends Error {
  constructor(readonly stage: CanadianPreviewFailure) { super(`Order reader stopped: ${stage}`); }
}

export function readCanadianOrder(doc: Document, href: string): CaOrder {
  let stage: CanadianPreviewFailure = "order-page";
  try {
  if (!isAmazonCaDetailUrl(href)) throw new Error("Unsupported detail page.");
  stage = "order-summary";
  const check = inspectAmazonCaDetail(doc, href); const s = check.orderSummary;
  if (check.language !== "english" || check.itemRows !== 1 || check.singleItemPriceMatchesSubtotal !== true ||
      s?.readableRows !== 6 || s.currencyLabelsConsistent !== true || s.beforeTaxMatches !== true || s.grandTotalMatches !== true) throw new Error("Order arithmetic is not verified.");
  stage = "order-values";
  const subtotal = findLabeledAmount(doc, /^(?:Item\(s\)|Items?)\s+Subtotal:?$/i).amount!;
  const total = findLabeledAmount(doc, /^Grand Total:?$/i).amount!;
  if (subtotal.cents <= 0 || total.cents <= 0 || subtotal.currency === "USD" || total.currency === "USD") throw new Error("Unsupported order values.");
  stage = "product-link";
  const row = doc.querySelector(SELECTORS.itemBoxPrimary) ?? doc.querySelector(SELECTORS.itemBoxFallback);
  const links = [...(row?.querySelectorAll(SELECTORS.productLink) ?? [])];
  const link = links.find((el) => el.textContent?.trim());
  if (!link) throw new Error("Missing product link.");
  stage = "product-title";
  const title = link?.textContent?.trim() ?? "";
  if (!title || title.length > 500) throw new Error("Unsupported title.");
  stage = "product-id";
  const productUrl = new URL(link?.getAttribute("href") ?? "", "https://www.amazon.ca");
  const asin = productUrl.origin === "https://www.amazon.ca" ? productUrl.pathname.match(ASIN_REGEX)?.[1] : undefined;
  if (!asin || !title || title.length > 500) throw new Error("Unreadable product.");
  stage = "order-quantity";
  const inlineQty = (row?.textContent ?? "").match(/Qty:\s*(\d+)/i)?.[1];
  if (inlineQty && inlineQty !== "1") throw new Error("Only quantity-one preview is supported.");
  const qty = row?.querySelector(SELECTORS.quantityFallback)?.textContent?.trim();
  if (qty && !/^(?:Qty:\s*)?1$/i.test(qty)) throw new Error("Only quantity-one preview is supported.");
  stage = "order-query";
  return { orderId: canadianOrderId(href), productId: asin, title, subtotalCents: subtotal.cents, totalCents: total.cents, currency: total.currency };
  } catch (error) { throw new CanadianOrderReadError(error instanceof CanadianOrderIdentityError ? error.stage : stage); }
}
/** Convert failures to closed codes before crossing the content reply boundary. */
export function readCanadianOrderForPreview(doc: Document, href: string) {
  try { return readCanadianOrder(doc, href); }
  catch (error) { return { orderReadFailure: error instanceof CanadianOrderReadError ? error.stage : "order-unexpected" }; }
}

/** Exact amount and at most three UTC calendar days. Never pair ambiguity away. */
export function matchCanadianPayment(rows: CaPayment[], order: CaOrder, date: string, cents: number): CaPayment {
  const time = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(time)) throw new Error("Invalid charge date.");
  const candidates = rows.filter((r) => r.funding!=="gift_card" && r.amountCents === cents && Math.abs(Date.parse(r.date + "T00:00:00Z") - time) <= 3 * 86400000);
  if (candidates.length !== 1 || candidates[0]!.refund || candidates[0]!.orderId !== order.orderId || order.totalCents !== cents || candidates[0]!.currency !== order.currency) throw new Error("No unique linked Canadian payment match.");
  return candidates[0]!;
}
/** Project untrusted content replies, never arbitrary objects. */
export function sanitizeCanadianPreview(order: unknown, rows: unknown): { order: CaOrder; rows: CaPayment[] } {
  const o = order as CaOrder;
  if (!o || typeof o.orderId !== "string" || !ID.test(o.orderId) || typeof o.productId !== "string" || !/^[A-Z0-9]{10}$/.test(o.productId) || typeof o.title !== "string" || !o.title.trim() || o.title.length > 500 ||
    !Number.isSafeInteger(o.subtotalCents) || o.subtotalCents <= 0 || !Number.isSafeInteger(o.totalCents) || o.totalCents <= 0 || !["CAD", "unspecified"].includes(o.currency) || !Array.isArray(rows) || !rows.length || rows.length > 200) throw new Error("Unreadable Canadian preview.");
  return { order: { orderId: o.orderId, productId: o.productId, title: o.title, subtotalCents: o.subtotalCents, totalCents: o.totalCents, currency: o.currency }, rows: rows.map((r: CaPayment) => {
    const parsed = typeof r?.date === "string" ? new Date(r.date + "T00:00:00Z") : null;
    if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== r.date || !Number.isSafeInteger(r.amountCents) || r.amountCents <= 0 || typeof r.refund !== "boolean" || (r.funding!==undefined&&!["card","gift_card","unknown"].includes(r.funding)) || !["CAD", "unspecified"].includes(r.currency) || !(r.orderId === null || typeof r.orderId === "string" && ID.test(r.orderId))) throw new Error("Unreadable Canadian payment.");
    return { date: r.date, amountCents: r.amountCents, orderId: r.orderId, refund: r.refund, currency: r.currency,...(r.funding?{funding:r.funding}:{}) };
  }) };
}
