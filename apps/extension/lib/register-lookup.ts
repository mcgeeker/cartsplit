/** Read-only register lookup contracts. No credentials, API bodies or write grants. */
export interface RegisterPurchase {
  planId: string;
  accountId: string;
  transactionId?: string;
  date?: string;
  cents: number;
  payee: string;
}
export interface LookupCandidate { orderId: string; date: string; cents: number }
export interface LookupView {
  state: "idle" | "searching" | "signin" | "paused" | "choices" | "opened" | "missing" | "stopped" | "canceled";
  pages: number;
  message: string;
  candidates: LookupCandidate[];
  dismissed?: boolean;
}
export const LOOKUP_COMMANDS = new Set(["LOOKUP_START", "LOOKUP_STATUS", "LOOKUP_CANCEL", "LOOKUP_CONTINUE", "LOOKUP_SIGNIN", "LOOKUP_OPEN", "LOOKUP_DISMISS"]);
export const isIdentifier = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,100}$/.test(value);
export function registerContext(href: string): { planId: string; accountId: string } | null {
  try {
    const url = new URL(href);
    if (url.origin !== "https://app.ynab.com" || url.username || url.password) return null;
    const path = url.hash.startsWith("#/") ? url.hash.slice(1).split("?")[0]! : url.pathname;
    const match = path.match(/^\/([\w-]+)\/accounts\/([\w-]+)\/?$/);
    if (!match || !isIdentifier(match[1]) || !isIdentifier(match[2])) return null;
    return { planId: match[1], accountId: match[2] };
  } catch { return null; }
}
export function calendarDate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
export function canonicalOrderUrl(orderId: string): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) throw Error("Invalid order reference.");
  return `https://www.amazon.ca/your-orders/order-details?orderID=${encodeURIComponent(orderId)}`;
}
export const isAmazonPayee = (value: unknown): value is string => typeof value === "string" && value.length <= 500 && /^(?:amazon(?:\.ca)?|amzn)(?:\b|[ *])/i.test(value.trim());
