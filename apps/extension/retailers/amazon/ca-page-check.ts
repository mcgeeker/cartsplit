import type { AmazonCaPageCheck } from "@/lib/types";
import { SELECTORS } from "./selectors";
import { amazonCaCheckPage } from "./storefront";

export const CA_CHECK_ROW_LIMIT = 200;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Strict English calendar date recognition for the diagnostic only. */
export function isEnglishCalendarDate(text: string): boolean {
  const match = text.trim().match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (!match) return false;
  const name = match[1]!.toLowerCase();
  const month = MONTHS.findIndex((m) => m === name || m.slice(0, 3) === name) + 1;
  if (!month) return false;
  const iso = `${match[3]}-${String(month).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

/** Recognition, not exchange-rate conversion. A bare $ is not proof of CAD. */
export function inspectDollarAmount(text: string): { cents: number; currency: "CAD" | "USD" | "unspecified" } | null {
  const match = text.trim().match(/^([+-])?\s*(CA\$|C\$|CAD|US\$|USD|\$)?\s*([+-])?\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\s*(CAD|USD)?$/i);
  if (!match || (match[1] && match[3])) return null;
  const prefix = match[2]?.toUpperCase(); const suffix = match[6]?.toUpperCase();
  const currency = prefix && prefix !== "$" ? /^(CA\$|C\$|CAD)$/.test(prefix) ? "CAD" : "USD" : suffix ?? "unspecified";
  if (suffix && currency !== suffix) return null;
  const cents = Number(match[4]!.replaceAll(",", "")) * 100 + Number(match[5]);
  if (!Number.isSafeInteger(cents)) return null;
  return { cents: (match[1] === "-" || match[3] === "-") ? -cents : cents, currency: currency as "CAD" | "USD" | "unspecified" };
}

/** Inspect the current page only. No paging, order-detail reads, record keys,
 * amounts, titles, or HTML cross the content-script boundary. */
export function inspectAmazonCaPage(doc: Document, href: string): AmazonCaPageCheck {
  const page = amazonCaCheckPage(href);
  const lang = doc.documentElement.lang.trim().toLowerCase();
  const language = !lang ? "unknown" : /^en(?:[-_][a-z]{2})?$/.test(lang) ? "english" : "other";
  const result: AmazonCaPageCheck = { page, language, rowsFound: 0, readableRows: 0, linkedRows: 0,
    cadRows: 0, unspecifiedCurrencyRows: 0, otherCurrencyRows: 0, unreadableAmountRows: 0, truncated: false };
  if (page !== "transactions" || language === "other") return result;
  const allRows = doc.querySelectorAll(SELECTORS.lineItem);
  const rows = Array.from(allRows).slice(0, CA_CHECK_ROW_LIMIT);
  result.rowsFound = rows.length; result.truncated = allRows.length > rows.length;
  const dated = new Set<Element>();
  for (const container of Array.from(doc.querySelectorAll(SELECTORS.dateContainer)).slice(0, CA_CHECK_ROW_LIMIT)) {
    if (!isEnglishCalendarDate(container.querySelector("span")?.textContent ?? "")) continue;
    for (const row of Array.from(container.nextElementSibling?.querySelectorAll(SELECTORS.lineItem) ?? []).slice(0, CA_CHECK_ROW_LIMIT)) dated.add(row);
  }
  for (const row of rows) {
    if (row.querySelector(SELECTORS.orderLink)) result.linkedRows++;
    const amount = inspectDollarAmount(row.querySelector(SELECTORS.amountSpan)?.textContent ?? "");
    if (!amount) { result.unreadableAmountRows++; continue; }
    if (amount.currency === "CAD") result.cadRows++;
    else if (amount.currency === "USD") result.otherCurrencyRows++;
    else result.unspecifiedCurrencyRows++;
    if (dated.has(row) && amount.currency !== "USD") result.readableRows++;
  }
  return result;
}

/** Rebuild a count-only DTO rather than forwarding arbitrary content replies. */
export function sanitizeAmazonCaPageCheck(value: unknown): AmazonCaPageCheck {
  if (!value || typeof value !== "object") throw new Error("Unreadable page check.");
  const v = value as Record<string, unknown>;
  if (!["transactions", "login", "other"].includes(v.page as string) ||
      !["english", "other", "unknown"].includes(v.language as string) || typeof v.truncated !== "boolean") throw new Error("Unreadable page check.");
  const keys = ["rowsFound", "readableRows", "linkedRows", "cadRows", "unspecifiedCurrencyRows", "otherCurrencyRows", "unreadableAmountRows"] as const;
  for (const key of keys) if (!Number.isInteger(v[key]) || (v[key] as number) < 0 || (v[key] as number) > CA_CHECK_ROW_LIMIT) throw new Error("Unreadable page check.");
  const counts = Object.fromEntries(keys.map((key) => [key, v[key]])) as Pick<AmazonCaPageCheck, typeof keys[number]>;
  if (counts.readableRows > counts.rowsFound || counts.linkedRows > counts.rowsFound ||
      counts.cadRows + counts.unspecifiedCurrencyRows + counts.otherCurrencyRows + counts.unreadableAmountRows !== counts.rowsFound) throw new Error("Unreadable page check.");
  if (counts.readableRows > counts.cadRows + counts.unspecifiedCurrencyRows ||
      ((v.page !== "transactions" || v.language === "other") && (counts.rowsFound !== 0 || v.truncated))) throw new Error("Unreadable page check.");
  return { page: v.page as AmazonCaPageCheck["page"], language: v.language as AmazonCaPageCheck["language"], ...counts, truncated: v.truncated };
}
