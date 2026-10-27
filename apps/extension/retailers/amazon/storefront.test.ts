import { expect, it } from "vitest";
import { amazonTransactionsUrl, amazonCaCheckPage } from "./storefront";

it("supports Canadian navigation only", () => {
  expect(amazonTransactionsUrl("ca")).toBe("https://www.amazon.ca/cpe/yourpayments/transactions");
  expect(() => amazonTransactionsUrl("us" as never)).toThrow("Unsupported");
  expect(() => amazonTransactionsUrl("other" as never)).toThrow("Unsupported");
});

it.each([
  ["https://www.amazon.ca/cpe/yourpayments/transactions?ref=test", "transactions"],
  ["https://www.amazon.ca/cpe/yourpayments/transactions/", "transactions"],
  ["https://www.amazon.ca/ap/signin?private=test", "login"],
  ["https://www.amazon.ca/ap/challenge", "login"],
  ["https://www.amazon.com/cpe/yourpayments/transactions", "other"],
  ["https://www.amazon.ca.evil.invalid/cpe/yourpayments/transactions", "other"],
  ["https://user:pass@www.amazon.ca/cpe/yourpayments/transactions", "other"],
  ["http://www.amazon.ca/cpe/yourpayments/transactions", "other"],
  ["https://www.amazon.ca/cpe/yourpayments/transactions-other", "other"],
  ["https://www.amazon.ca/gp/css/summary/edit.html?orderID=test", "other"],
  ["not a URL", "other"],
])("restricts the diagnostic URL: %s", (url, kind) => expect(amazonCaCheckPage(url)).toBe(kind));
