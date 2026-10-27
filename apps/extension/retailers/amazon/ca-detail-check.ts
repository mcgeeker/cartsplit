import { SELECTORS } from "./selectors";
import { inspectDollarAmount } from "./ca-page-check";

export interface AmazonCaSummaryArithmetic {
  readableRows: number;
  currencyLabelsConsistent: boolean | null;
  beforeTaxMatches: boolean | null;
  grandTotalMatches: boolean | null;
}

export interface AmazonCaDetailCheck {
  language: "english" | "other" | "unknown";
  itemRows: number;
  readablePrices: number;
  subtotalReadable: boolean;
  subtotalStatus?: "readable" | "label-not-found" | "ambiguous" | "amount-not-readable";
  singleItemPriceMatchesSubtotal: boolean | null;
  orderSummary?: AmazonCaSummaryArithmetic;
}

/** Exact user-observed Canadian detail path. Query strings stay local. */
export function isAmazonCaDetailUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return u.origin === "https://www.amazon.ca" && !u.username && !u.password &&
      /^\/your-orders\/order-details\/?$/.test(u.pathname);
  } catch { return false; }
}

const SUBTOTAL_LABEL = /^(?:Item\(s\)|Items?)\s+Subtotal:?$/i;
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Look only around an exact requested label; never substitute another total.
 * New order-details uses div/table/definition rows, not always legacy .a-row. */
export function findLabeledAmount(doc: ParentNode, pattern: RegExp, allowNegative = false) {
  const candidates = Array.from(doc.querySelectorAll("span, dt, label, div, td, th"))
    .filter((el) => pattern.test(normalize(el.textContent ?? "")));
  // A wrapper and its nested label are one label; separate rows remain ambiguous.
  const labels = candidates.filter((el) => !candidates.some((other) => other !== el && el.contains(other)));
  if (!labels.length) return { amount: null, status: "label-not-found" as const };
  if (labels.length !== 1) return { amount: null, status: "ambiguous" as const };
  const label = labels[0]!;
  const labelText = normalize(label.textContent ?? "");
  // Bounded ancestor walk: accept a row only when its entire remaining text is
  // exactly one strict amount. Extra totals/labels cannot be silently stripped.
  let row: Element | null = label.parentElement;
  for (let depth = 0; row && depth < 3 && !["BODY", "HTML"].includes(row.tagName); depth++, row = row.parentElement) {
    const text = normalize(row.textContent ?? "");
    if (!text.startsWith(labelText)) continue;
    const amount = inspectDollarAmount(text.slice(labelText.length).trim());
    if (amount && (allowNegative || amount.cents >= 0) && amount.currency !== "USD") return { amount, status: "readable" as const };
  }
  // A semantic definition list may pair dt and dd without a row wrapper.
  if (label.tagName === "DT" && label.nextElementSibling?.tagName === "DD") {
    const amount = inspectDollarAmount(normalize(label.nextElementSibling.textContent ?? ""));
    if (amount && (allowNegative || amount.cents >= 0) && amount.currency !== "USD") return { amount, status: "readable" as const };
  }
  return { amount: null, status: "amount-not-readable" as const };
}

const SUMMARY_LABELS = [
  SUBTOTAL_LABEL,
  /^Shipping\s*&\s*Handling:?$/i,
  /^Total before tax:?$/i,
  /^Estimated PST\s*\/\s*RST\s*\/\s*QST:?$/i,
  /^Estimated GST\s*\/\s*HST:?$/i,
  /^Grand Total:?$/i,
];

/** Six observed summary rows only. This does not prove currency or payment funding. */
function inspectSummaryArithmetic(doc: Document): AmazonCaSummaryArithmetic {
  const values = SUMMARY_LABELS.map((label) => findLabeledAmount(doc, label).amount);
  const result: AmazonCaSummaryArithmetic = { readableRows: values.filter(Boolean).length,
    currencyLabelsConsistent: null, beforeTaxMatches: null, grandTotalMatches: null };
  if (result.readableRows !== 6) return result;
  const amounts = values as NonNullable<typeof values[number]>[];
  result.currencyLabelsConsistent = amounts.every((a) => a.currency === amounts[0]!.currency);
  if (!result.currencyLabelsConsistent) return result;
  const [items, shipping, beforeTax, pst, gst, grand] = amounts.map((a) => a.cents) as [number, number, number, number, number, number];
  const before = items + shipping; const total = beforeTax + pst + gst;
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(total)) return result;
  result.beforeTaxMatches = before === beforeTax;
  result.grandTotalMatches = total === grand;
  return result;
}

function sanitizeSummaryArithmetic(value: unknown): AmazonCaSummaryArithmetic {
  if (!value || typeof value !== "object") throw new Error("Unreadable summary arithmetic.");
  const v = value as Record<string, unknown>;
  if (!Number.isInteger(v.readableRows) || Number(v.readableRows) < 0 || Number(v.readableRows) > 6) throw new Error("Unreadable summary arithmetic.");
  for (const k of ["currencyLabelsConsistent", "beforeTaxMatches", "grandTotalMatches"]) {
    if (v[k] !== null && typeof v[k] !== "boolean") throw new Error("Unreadable summary arithmetic.");
  }
  if (v.readableRows !== 6 && (v.currencyLabelsConsistent !== null || v.beforeTaxMatches !== null || v.grandTotalMatches !== null)) throw new Error("Unreadable summary arithmetic.");
  if (v.currencyLabelsConsistent !== true && (v.beforeTaxMatches !== null || v.grandTotalMatches !== null)) throw new Error("Unreadable summary arithmetic.");
  return { readableRows: v.readableRows as number, currencyLabelsConsistent: v.currencyLabelsConsistent as boolean | null,
    beforeTaxMatches: v.beforeTaxMatches as boolean | null, grandTotalMatches: v.grandTotalMatches as boolean | null };
}

/** Diagnostic only: price equality is not quantity, tax, payment or charge reconciliation. */
export function inspectAmazonCaDetail(doc: Document, href: string): AmazonCaDetailCheck {
  if (!isAmazonCaDetailUrl(href)) throw new Error("Unsupported detail page.");
  const lang = doc.documentElement.lang.trim().toLowerCase();
  const result: AmazonCaDetailCheck = { language: !lang ? "unknown" : /^en(?:[-_][a-z]{2})?$/.test(lang) ? "english" : "other",
    itemRows: 0, readablePrices: 0, subtotalReadable: false, singleItemPriceMatchesSubtotal: null };
  if (result.language !== "english") return result;
  let rows = doc.querySelectorAll(SELECTORS.itemBoxPrimary);
  if (!rows.length) rows = doc.querySelectorAll(SELECTORS.itemBoxFallback);
  if (rows.length > 200) throw new Error("Too many detail rows.");
  const prices = Array.from(rows).map((row) => inspectDollarAmount((row.querySelector(SELECTORS.priceEl) ?? row.querySelector(SELECTORS.priceFallback))?.textContent ?? ""));
  result.itemRows = rows.length;
  result.readablePrices = prices.filter((p) => p && p.currency !== "USD").length;
  const found = findLabeledAmount(doc, SUBTOTAL_LABEL);
  result.orderSummary = inspectSummaryArithmetic(doc);
  const subtotal = found.amount;
  result.subtotalStatus = found.status;
  result.subtotalReadable = subtotal !== null;
  if (prices.length === 1 && result.readablePrices === 1 && result.subtotalReadable) {
    const price = prices[0]!;
    // Conflicting explicit currency labels cannot yield a successful comparison.
    if (price.currency === subtotal!.currency) result.singleItemPriceMatchesSubtotal = price.cents === subtotal!.cents;
  }
  return result;
}

/** Never forward arbitrary page fields. */
export function sanitizeAmazonCaDetail(value: unknown): AmazonCaDetailCheck {
  if (!value || typeof value !== "object") throw new Error("Unreadable detail check.");
  const v = value as Record<string, unknown>;
  if (!["english", "other", "unknown"].includes(v.language as string) ||
    !Number.isInteger(v.itemRows) || Number(v.itemRows) < 0 || Number(v.itemRows) > 200 ||
    !Number.isInteger(v.readablePrices) || Number(v.readablePrices) < 0 || Number(v.readablePrices) > Number(v.itemRows) ||
    typeof v.subtotalReadable !== "boolean" || !(v.singleItemPriceMatchesSubtotal === null || typeof v.singleItemPriceMatchesSubtotal === "boolean") ||
    (v.singleItemPriceMatchesSubtotal !== null && (v.itemRows !== 1 || v.readablePrices !== 1 || !v.subtotalReadable)) ||
    (v.language !== "english" && (v.itemRows !== 0 || v.readablePrices !== 0 || v.subtotalReadable))) throw new Error("Unreadable detail check.");
  if (v.subtotalStatus !== undefined && (!["readable", "label-not-found", "ambiguous", "amount-not-readable"].includes(v.subtotalStatus as string) ||
    (v.subtotalStatus === "readable") !== v.subtotalReadable)) throw new Error("Unreadable detail check.");
  const orderSummary = v.orderSummary === undefined ? undefined : sanitizeSummaryArithmetic(v.orderSummary);
  if (orderSummary && v.language !== "english") throw new Error("Unreadable detail check.");
  return { ...(orderSummary ? { orderSummary } : {}), ...(v.subtotalStatus === undefined ? {} : { subtotalStatus: v.subtotalStatus as AmazonCaDetailCheck["subtotalStatus"] }), language: v.language as AmazonCaDetailCheck["language"], itemRows: v.itemRows as number, readablePrices: v.readablePrices as number,
    subtotalReadable: v.subtotalReadable, singleItemPriceMatchesSubtotal: v.singleItemPriceMatchesSubtotal as boolean | null };
}

/** Explicit amount comparison only; never returns the page's monetary values. */
export function compareCanadianOrderAmount(doc: Document, href: string, cents: unknown): { matches: boolean } {
  if (!Number.isSafeInteger(cents) || Number(cents) <= 0) throw new Error("Invalid expected amount.");
  const detail = inspectAmazonCaDetail(doc, href);
  const summary = detail.orderSummary;
  if (detail.language !== "english" || detail.itemRows !== 1 || detail.singleItemPriceMatchesSubtotal !== true ||
    summary?.readableRows !== 6 || summary.currencyLabelsConsistent !== true || summary.beforeTaxMatches !== true || summary.grandTotalMatches !== true) return { matches: false };
  return { matches: findLabeledAmount(doc, /^Grand Total:?$/i).amount?.cents === cents };
}
