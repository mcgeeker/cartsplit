// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { advancePaymentLookupPage, readPaymentLookupPage, sanitizeLookupPage } from "./payment-lookup";
const url = "https://www.amazon.ca/cpe/yourpayments/transactions";
function page(next = '<a href="?page=2">Next page</a>') {
  return new DOMParser().parseFromString(`<html lang="en-CA"><body><div class="apx-transaction-date-container"><span>October 22, 2026</span></div><div><div class="apx-transactions-line-item-component-container"><span>Visa</span><span class="a-text-right"><span>-$11.30</span></span><a href="/your-orders/order-details?orderID=synthetic-order">Order</a></div></div>${next}</body></html>`, "text/html");
}
it("reads explicit pagination and refuses to infer history completion from missing controls", () => {
  expect(sanitizeLookupPage(readPaymentLookupPage(page(), url))).toMatchObject({ next: "available", rows: [{ funding: "card", amountCents: 1130 }] });
  expect(readPaymentLookupPage(page('<button disabled>Next</button>'), url).next).toBe("end");
  expect(readPaymentLookupPage(page(""), url).next).toBe("unknown");
});
it("advances only an unchanged payment page and validates next-link origin/path", () => {
  const doc = page(), next = doc.querySelectorAll("a")[1]!, click = vi.spyOn(next as HTMLElement, "click").mockImplementation(() => {});
  const data = readPaymentLookupPage(doc, url); expect(advancePaymentLookupPage(doc, url, data.fingerprint)).toEqual({ ok: true }); expect(click).toHaveBeenCalledOnce();
  expect(() => advancePaymentLookupPage(doc, url, "changed")).toThrow();
  next.setAttribute("href", "https://evil.invalid/private"); expect(() => advancePaymentLookupPage(doc, url, data.fingerprint)).toThrow();
});
it("clicks the actionable anchor inside nested pagination markup",()=>{
 const doc=page('<ul class="a-pagination"><li class="a-last"><a href="?page=2">Next</a></li></ul>');
 const anchor=doc.querySelector('.a-last a') as HTMLElement,click=vi.spyOn(anchor,'click').mockImplementation(()=>{});
 advancePaymentLookupPage(doc,url,readPaymentLookupPage(doc,url).fingerprint);expect(click).toHaveBeenCalledOnce();
});
it('recognizes Amazon’s labelled submit input and advances its Payments form',()=>{
 const doc=page('<form action="/cpe/yourpayments/transactions" method="post"><span class="a-button"><span class="a-button-inner"><input class="a-button-input" type="submit" aria-labelledby="next-label"><span id="next-label" class="a-button-text" aria-hidden="true">Next page</span></span></span></form>');
 const next=doc.querySelector('input')!,click=vi.spyOn(next,'click').mockImplementation(()=>{});
 const data=readPaymentLookupPage(doc,url);expect(data.next).toBe('available');
 advancePaymentLookupPage(doc,url,data.fingerprint);expect(click).toHaveBeenCalledOnce();
 next.disabled=true;expect(readPaymentLookupPage(doc,url).next).toBe('end');
});
it.each(['https://evil.invalid/submit','https://www.amazon.ca/your-account/delete','https://user:pass@www.amazon.ca/cpe/yourpayments/transactions'])('does not submit pagination to an unsupported form destination: %s',action=>{
 const doc=page(`<form action="${action}"><input type="submit" aria-labelledby="next"><span id="next">Next page</span></form>`);
 const input=doc.querySelector('input')!,click=vi.spyOn(input,'click').mockImplementation(()=>{});
 expect(()=>advancePaymentLookupPage(doc,url,readPaymentLookupPage(doc,url).fingerprint)).toThrow();expect(click).not.toHaveBeenCalled();
});
it.each(['anchor','form'])('rejects a %s destination redirected by the document base URL',kind=>{
 const doc=page(kind==='anchor'?'<a href="/cpe/yourpayments/transactions?page=2">Next page</a>':'<form action="/cpe/yourpayments/transactions"><input type="submit" value="Next page"></form>');
 const base=doc.createElement('base');base.href='https://evil.invalid/';doc.head.append(base);
 expect(()=>advancePaymentLookupPage(doc,url,readPaymentLookupPage(doc,url).fingerprint)).toThrow('Unsupported next page');
});
it("rejects untrusted chronological/currency/fingerprint data and strips private extras", () => {
  const p = readPaymentLookupPage(page(), url);
  expect(sanitizeLookupPage({ ...p, accessToken: "private" })).toEqual(p);
  for (const change of [{ fingerprint: "forged" }, { next: "invented" }, { rows: [{ ...p.rows[0], date: "2026-02-30" }] }, { rows: [{ ...p.rows[0], currency: "USD" }] }, { rows: [...p.rows, { ...p.rows[0], date: "2026-10-23" }] }]) expect(() => sanitizeLookupPage({ ...p, ...change })).toThrow();
});
