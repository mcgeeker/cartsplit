// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { inspectAmazonCaPage, inspectDollarAmount, isEnglishCalendarDate, sanitizeAmazonCaPageCheck } from "./ca-page-check";
const url = "https://www.amazon.ca/cpe/yourpayments/transactions";
function page(amounts: string[], date = "October 23, 2026", lang = "en-CA") {
  const doc = document.implementation.createHTMLDocument("Synthetic Canadian page"); doc.documentElement.lang = lang;
  const header = doc.createElement("div"); header.className = "apx-transaction-date-container";
  const span = doc.createElement("span"); span.textContent = date; header.append(span); doc.body.append(header);
  const group = doc.createElement("div"); doc.body.append(group);
  for (const amount of amounts) {
    const row = doc.createElement("div"); row.className = "apx-transactions-line-item-component-container";
    const cell = doc.createElement("div"); cell.className = "a-span3";
    const price = doc.createElement("span"); price.textContent = amount; cell.append(price); row.append(cell);
    const link = doc.createElement("a"); link.href = "/gp/css/summary/edit.html?orderID=private-test-order"; link.textContent = "Private synthetic product title";
    row.append(link); group.append(row);
  }
  return doc;
}

it("returns counts only from one synthetic page and does not infer CAD from a bare dollar sign", () => {
  const doc = page(["CA$6.00", "$4.00", "USD 3.00", "unreadable"]);
  const before = doc.body.innerHTML;
  const result = inspectAmazonCaPage(doc, url);
  expect(result).toEqual({ page: "transactions", language: "english", rowsFound: 4, readableRows: 2, linkedRows: 4,
    cadRows: 1, unspecifiedCurrencyRows: 1, otherCurrencyRows: 1, unreadableAmountRows: 1, truncated: false });
  expect(JSON.stringify(result)).not.toMatch(/private-test-order|Private synthetic|6\.00|4\.00/);
  expect(doc.body.innerHTML).toBe(before); expect(sanitizeAmazonCaPageCheck({ ...result, accessToken: "test-only-token", title: "private" })).toEqual(result);
});

it("does not inspect row data on login, unrelated pages, or unsupported-language pages", () => {
  expect(inspectAmazonCaPage(page(["CA$1.00"]), "https://www.amazon.ca/ap/signin").rowsFound).toBe(0);
  expect(inspectAmazonCaPage(page(["CA$1.00"]), "https://www.amazon.ca/gp/css/summary/edit.html").rowsFound).toBe(0);
  const french = inspectAmazonCaPage(page(["CA$1.00"], "October 23, 2026", "fr-CA"), url);
  expect(french.language).toBe("other"); expect(french.rowsFound).toBe(0);
});

it("reports an unknown language and invalid dates without silently accepting the date", () => {
  const result = inspectAmazonCaPage(page(["$1.00"], "February 30, 2026", ""), url);
  expect(result.language).toBe("unknown"); expect(result.rowsFound).toBe(1); expect(result.readableRows).toBe(0);
});

it("caps the sampled rows at 200 without opening or navigating anything", () => {
  const result = inspectAmazonCaPage(page(Array.from({ length: 201 }, () => "CAD 1.00")), url);
  expect(result.rowsFound).toBe(200); expect(result.cadRows).toBe(200); expect(result.truncated).toBe(true);
});

it.each(["October 23, 2026", "Oct. 23, 2026", "February 29, 2024"])("recognizes an English calendar date: %s", (date) => expect(isEnglishCalendarDate(date)).toBe(true));
it.each(["February 29, 2026", "October 32, 2026", "Octobre 23, 2026", ""])("rejects an invalid or unsupported date: %s", (date) => expect(isEnglishCalendarDate(date)).toBe(false));

it.each([
  ["CA$1,234.56", 123456, "CAD"], ["CAD 6.00", 600, "CAD"], ["$4.00", 400, "unspecified"],
  ["+$3.50", 350, "unspecified"], ["C$-2.00", -200, "CAD"], ["$2.00 CAD", 200, "CAD"], ["US$9.99", 999, "USD"],
])("recognizes a strict decimal dollar amount: %s", (text, cents, currency) => expect(inspectDollarAmount(text as string)).toEqual({ cents, currency }));
it.each(["US$1.00 CAD", "CAD 1.00 USD", "EUR 1.00", "$1,23.00", "$1.234", "private text $1.00", "+$-1.00", "$9007199254740992.00"])("rejects ambiguous or unsupported money text: %s", (text) => expect(inspectDollarAmount(text)).toBeNull());

it("rejects malformed count-only replies", () => {
  const valid = inspectAmazonCaPage(page(["$1.00"]), url);
  for (const bad of [null, { ...valid, rowsFound: 201 }, { ...valid, cadRows: -1 }, { ...valid, readableRows: 2 },
    { ...valid, page: "login" }, { ...valid, cadRows: 1 }, { ...valid, language: "fr-CA" }]) {
    expect(() => sanitizeAmazonCaPageCheck(bad)).toThrow("Unreadable page check");
  }
});
