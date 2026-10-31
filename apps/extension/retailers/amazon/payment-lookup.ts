import { calendarDate } from "@/lib/register-lookup";
import { readCanadianPayments, type CaPayment } from "./ca-preview";

export interface PaymentLookupPage { rows: CaPayment[]; next: "available" | "end" | "unknown"; fingerprint: string }
export const paymentPageFingerprint = (rows: CaPayment[]) => JSON.stringify(rows.map(row => [row.date, row.amountCents, row.orderId, row.refund, row.currency, row.funding ?? null]));
function controlLabel(doc: Document, el: HTMLElement): string {
  const references = el.getAttribute("aria-labelledby");
  if (references) return references.trim().split(/\s+/).map(id => doc.getElementById(id)?.textContent ?? "").join(" ");
  return el.getAttribute("aria-label") ?? el.getAttribute("title") ??
    (el instanceof HTMLInputElement ? el.value || el.closest(".a-button")?.querySelector(".a-button-text")?.textContent : el.textContent) ?? "";
}
function pageUrl(doc: Document, value: string, href: string): URL {
  const base = doc.querySelector("base[href]")?.getAttribute("href");
  return new URL(value, base == null ? href : new URL(base, href));
}
function nextControl(doc: Document): { next: PaymentLookupPage["next"]; element?: HTMLElement } {
  const controls = [...doc.querySelectorAll<HTMLElement>("a,button,input[type=submit],input[type=button],.a-pagination .a-last,.a-pagination .a-next")].filter(el => {
    const label = controlLabel(doc, el);
    return /^(?:next(?:\s+page)?|older(?:\s+transactions)?)(?:\s*[›»→])?$/i.test(label.trim());
  });
  // Nested pagination labels may represent one physical control.
  const top = controls.filter(el => !controls.some(other => other !== el && other.contains(el)));
  if (top.length !== 1) return { next: "unknown" };
  const element = top[0]!;
  const disabled = element.matches(":disabled,[aria-disabled=true],.a-disabled") || !!element.closest(".a-disabled,[aria-disabled=true]");
  const clickable = element.matches("a,button,input") ? element : element.querySelector<HTMLElement>("a,button,input[type=submit]");
  return disabled ? { next: "end" } : clickable ? { next: "available", element: clickable } : { next: "unknown" };
}
export function readPaymentLookupPage(doc: Document, href: string): PaymentLookupPage {
  const rows = readCanadianPayments(doc, href);
  const next = nextControl(doc).next;
  return { rows, next, fingerprint: paymentPageFingerprint(rows) };
}
/** Re-read before advancing; never click a page-supplied URL in the background. */
export function advancePaymentLookupPage(doc: Document, href: string, expected: unknown): { ok: true } {
  const page = readPaymentLookupPage(doc, href);
  const control = nextControl(doc);
  if (typeof expected !== "string" || page.fingerprint !== expected || control.next !== "available" || !control.element) throw Error("Payment page changed.");
  // Navigation is limited to Amazon's own bounded payments pagination controls.
  const anchor = control.element.matches("a") ? control.element : control.element.querySelector("a");
  if (anchor) {
    const target = pageUrl(doc, anchor.getAttribute("href") ?? "", href);
    if (target.origin !== "https://www.amazon.ca" || !/^\/cpe\/yourpayments\/transactions\/?$/.test(target.pathname) || target.username || target.password) throw Error("Unsupported next page.");
  }
  if (control.element instanceof HTMLInputElement || control.element instanceof HTMLButtonElement) {
    const form = control.element.form;
    if (form) {
      const target = pageUrl(doc, control.element.getAttribute("formaction") ?? form.getAttribute("action") ?? href, href);
      if (target.origin !== "https://www.amazon.ca" || !/^\/cpe\/yourpayments\/transactions\/?$/.test(target.pathname) || target.username || target.password) throw Error("Unsupported next page.");
    }
  }
  control.element.click();
  return { ok: true };
}
/** Project untrusted page data and prove chronological order before using a cutoff. */
export function sanitizeLookupPage(value: unknown): PaymentLookupPage {
  const page = value as PaymentLookupPage;
  if (!page || !Array.isArray(page.rows) || !page.rows.length || page.rows.length > 200 || !["available", "end", "unknown"].includes(page.next)) throw Error("Unreadable payment page.");
  let previous = Infinity;
  const rows = page.rows.map(row => {
    const day = calendarDate(row?.date);
    if (day === null || day > previous || !Number.isSafeInteger(row.amountCents) || row.amountCents <= 0 || typeof row.refund !== "boolean" || !["CAD", "unspecified"].includes(row.currency) || !(row.orderId === null || typeof row.orderId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(row.orderId)) || (row.funding !== undefined && !["card", "gift_card", "unknown"].includes(row.funding))) throw Error("Unreadable or unsorted payment page.");
    previous = day;
    return { date: row.date, amountCents: row.amountCents, orderId: row.orderId, refund: row.refund, currency: row.currency, ...(row.funding ? { funding: row.funding } : {}) };
  });
  if (page.fingerprint !== paymentPageFingerprint(rows)) throw Error("Payment page identity changed.");
  return { rows, next: page.next, fingerprint: page.fingerprint };
}
