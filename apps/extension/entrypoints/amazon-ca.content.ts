import { OrderReviewError } from "@/lib/order-review-status";
import { readOrderSummary } from "@/retailers/amazon/order-summary";
import { readCanadianPayments } from "@/retailers/amazon/ca-preview";
import { readPaymentLookupPage, advancePaymentLookupPage } from "@/retailers/amazon/payment-lookup";

/** Install a listener only. Reading requires the user's explicit sidebar
 * action, sent by our background; web pages and other tabs cannot invoke it. */
export default defineContentScript({
  matches: ["https://www.amazon.ca/your-orders/order-details*", "https://www.amazon.ca/cpe/yourpayments/transactions*"],
  // Register before idle/load timing can delay the receiver. Installing a
  // listener does not read the page; premature requests get a closed status.
  runAt: "document_start",
  main() {
    browser.runtime.onMessage.addListener((message: unknown, sender) => {
      if (sender.id !== browser.runtime.id || sender.tab !== undefined) return;
      if (!message || typeof message !== "object") return;
      const request = message as { type?: unknown; cents?: unknown; fingerprint?: unknown };
      if (request.type === "LOOKUP_READ_PAYMENT_PAGE" || request.type === "LOOKUP_ADVANCE_PAYMENT_PAGE") {
        if (document.readyState === "loading") return Promise.resolve({ lookupFailure: "loading" });
        try { return Promise.resolve(request.type === "LOOKUP_READ_PAYMENT_PAGE" ? readPaymentLookupPage(document, location.href) : advancePaymentLookupPage(document, location.href, request.fingerprint)); }
        catch { return Promise.resolve({ lookupFailure: "unreadable" }); }
      }
      if (request.type === "READ_CA_ORDER_SUMMARY") {
        if (document.readyState === "loading") return Promise.resolve({ orderReadFailure: "orderLoading" });
        try { return Promise.resolve(readOrderSummary(document, location.href)); }
        catch (error) { return Promise.resolve({ orderReadFailure: error instanceof OrderReviewError ? error.stage : "read" }); }
      }
      if (request.type === "READ_CA_PREVIEW_PAYMENTS") {
        if (document.readyState === "loading") return Promise.resolve({ paymentsReadFailure: "paymentsLoading" });
        try { return Promise.resolve(readCanadianPayments(document, location.href)); }
        catch (error) { return Promise.resolve({ paymentsReadFailure: error instanceof OrderReviewError ? error.stage : "paymentsRead" }); }
      }
    });
  },
});
