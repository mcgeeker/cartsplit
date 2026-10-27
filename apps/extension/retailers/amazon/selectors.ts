/** Selectors shared by the bounded Canadian page readers. */
export const SELECTORS = {
  dateContainer: ".apx-transaction-date-container",
  lineItem: ".apx-transactions-line-item-component-container",
  amountSpan: ".a-span3 span, .a-text-right span",
  orderLink: "a[href*='orderID=']",
  itemBoxPrimary: ".a-fixed-left-grid-inner",
  itemBoxFallback: ".a-fixed-left-grid.item-box, .shipment .a-fixed-left-grid, [class*='od-item'], .yo-item",
  productLink: "a[href*='/dp/'], a[href*='/gp/product/']",
  priceEl: "[data-component='unitPrice'] .a-offscreen, .a-color-price",
  priceFallback: ".a-text-price .a-offscreen, [class*='price']",
  quantityFallback: "[data-component='quantity'], [class*='quantity'], [class*='qty']",
} as const;

export const ASIN_REGEX = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/;
// Amazon's auth URLs appear as `/ap/signin?...` (query, no trailing slash) as
// well as `/ap/signin/...`. Match the segment when followed by `/`, `?`, or
// end-of-string so a logged-out redirect is detected rather than scraped.
export const AUTH_PAGE_REGEX = /\/ap\/(signin|challenge|cvf)(?:[/?]|$)/i;
