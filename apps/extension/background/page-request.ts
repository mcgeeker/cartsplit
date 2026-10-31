import { browser } from "wxt/browser";

/** Closed transport reasons only; browser exceptions can contain page URLs. */
export class OrderPageRequestError extends Error {
  constructor(readonly reason: "unavailable" | "timeout" | "empty") {
    super(`Order page request failed: ${reason}`);
  }
}

/** Bound every explicit DOM request by cancellation and a ten-second timeout.
 * Page replies are untrusted; callers validate their shape before use. */
export function requestOrderPage(tabId: number, signal: AbortSignal, type: "READ_CA_ORDER_SUMMARY" | "READ_CA_PREVIEW_PAYMENTS" | "LOOKUP_READ_PAYMENT_PAGE" | "LOOKUP_ADVANCE_PAYMENT_PAGE", fingerprint?: string): Promise<unknown> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new DOMException("Preview canceled.", "AbortError")); };
    const timer = setTimeout(() => { cleanup(); reject(new OrderPageRequestError("timeout")); }, 10_000);
    signal.addEventListener("abort", abort, { once: true });
    try { browser.tabs.sendMessage(tabId, { type, ...(fingerprint !== undefined ? { fingerprint } : {}) }).then(
      (reply) => { cleanup(); if (reply == null) reject(new OrderPageRequestError("empty")); else resolve(reply); },
      () => { cleanup(); reject(new OrderPageRequestError("unavailable")); }); }
    catch { cleanup(); reject(new OrderPageRequestError("unavailable")); }
  });
}
