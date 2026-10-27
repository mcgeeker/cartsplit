export type AmazonMarketplace = "ca";

function amazonOrigin(market: AmazonMarketplace): string {
  if (market === "ca") return "https://www.amazon.ca";
  throw new Error("Unsupported Amazon storefront.");
}

export function amazonTransactionsUrl(market: AmazonMarketplace): string {
  return `${amazonOrigin(market)}/cpe/yourpayments/transactions`;
}

export function amazonCaCheckPage(href: string): "transactions" | "login" | "other" {
  try {
    const url = new URL(href);
    if (url.origin !== amazonOrigin("ca") || url.username || url.password) return "other";
    if (/^\/ap\/(signin|challenge|cvf)(?:\/|$)/i.test(url.pathname)) return "login";
    return /^\/cpe\/yourpayments\/transactions\/?$/.test(url.pathname) ? "transactions" : "other";
  } catch { return "other"; }
}
