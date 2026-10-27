// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { canadianOrderId, matchCanadianPayment, readCanadianOrder, readCanadianPayments, sanitizeCanadianPreview, type CaOrder, type CaPayment } from "./ca-preview";
const detailUrl = "https://www.amazon.ca/your-orders/order-details?orderID=synthetic-order";
const paymentsUrl = "https://www.amazon.ca/cpe/yourpayments/transactions";
const order: CaOrder = { orderId: "synthetic-order", productId: "B000000001", title: "Synthetic item", subtotalCents: 1000, totalCents: 1130, currency: "unspecified" };
const payment: CaPayment = { orderId: order.orderId, date: "2026-10-22", amountCents: 1130, refund: false, currency: "unspecified" };
function page(body: string) { return new DOMParser().parseFromString(`<html lang="en-CA"><body>${body}</body></html>`, "text/html"); }
function payments() { return page('<div class="apx-transaction-date-container"><span>October 22, 2026</span></div><div><div class="apx-transactions-line-item-component-container"><span class="a-text-right"><span>-$11.30</span></span><a href="/gp/css/summary/edit.html?orderID=synthetic-order">Order</a></div></div>'); }
function detail() { return page('<div class="a-fixed-left-grid-inner"><a href="/dp/B000000001">Synthetic item</a><span class="a-color-price">$10.00</span><span>Qty: 1</span></div>'+[ ["Item(s) Subtotal:", "$10.00"], ["Shipping & Handling:", "$0.00"], ["Total before tax:", "$10.00"], ["Estimated PST/RST/QST:", "$0.00"], ["Estimated GST/HST:", "$1.30"], ["Grand Total:", "$11.30"] ].map(([l, v]) => `<div><span>${l}</span><span>${v}</span></div>`).join('')); }
it("extracts a strict Canadian order identity without trusting arbitrary links", () => {
  expect(canadianOrderId(detailUrl)).toBe(order.orderId);
  for (const href of [detailUrl.replace('.ca', '.com'), detailUrl.replace('https:', 'http:'), detailUrl + '&orderId=other', detailUrl.replace('synthetic-order', '%2Fsecret'), 'https://www.amazon.ca/ap/signin?orderID=test']) expect(() => canadianOrderId(href)).toThrow();
});
it("reads one explicit Canadian payment page and modern order without paging or writes", () => {
  expect(readCanadianPayments(payments(), paymentsUrl)).toEqual([payment]);
  expect(readCanadianOrder(detail(), detailUrl)).toEqual(order);
});
it('separates page-address and language failures without exposing page values',()=>{
 const doc=payments();
 expect(()=>readCanadianPayments(doc,'https://www.amazon.ca/ap/signin')).toThrow(expect.objectContaining({stage:'paymentsPage'}));
 doc.documentElement.lang='fr-CA';
 expect(()=>readCanadianPayments(doc,paymentsUrl)).toThrow(expect.objectContaining({stage:'paymentsLanguage'}));
});
it("requires a valid date/amount for every row and bounds page size", () => {
  const d = payments(); d.querySelector('.apx-transaction-date-container span')!.textContent = 'February 30, 2026';
  expect(() => readCanadianPayments(d, paymentsUrl)).toThrow();
  const bad = payments(); bad.querySelector('.a-text-right span')!.textContent = 'USD 11.30'; expect(() => readCanadianPayments(bad, paymentsUrl)).toThrow();
  const large = payments(); const row = large.querySelector('.apx-transactions-line-item-component-container')!;
  for (let i=0;i<200;i++) row.parentElement!.append(row.cloneNode(true));
  expect(() => readCanadianPayments(large, paymentsUrl)).toThrow();
});
it("rejects foreign product URLs, missing ASIN/title, quantity two and bad arithmetic", () => {
  for (const mode of ['foreign','asin','title','qty','total']) {
    const d = detail(); const link = d.querySelector('a')!;
    if (mode === 'foreign') link.setAttribute('href', 'https://evil.invalid/dp/B000000001');
    if (mode === 'asin') link.setAttribute('href', '/dp/no-asin');
    if (mode === 'title') link.textContent = '';
    if (mode === 'qty') d.querySelector('.a-fixed-left-grid-inner')!.lastElementChild!.textContent = 'Qty: 2';
    if (mode === 'total') d.body.lastElementChild!.lastElementChild!.textContent = '$12.00';
    expect(() => readCanadianOrder(d, detailUrl)).toThrow();
  }
});
it("allows only a unique linked exact-amount payment within three UTC days", () => {
  expect(matchCanadianPayment([payment], order, '2026-10-25', 1130)).toEqual(payment);
  for (const rows of [[], [payment, payment], [{...payment, refund: true}], [{...payment, orderId: null}], [{...payment, orderId: 'other'}], [{...payment, currency: 'CAD' as const}], [{...payment, date: '2026-10-18'}]]) expect(() => matchCanadianPayment(rows, order, '2026-10-22', 1130)).toThrow();
  expect(() => matchCanadianPayment([payment], order, '2026-10-22', 1131)).toThrow();
});
it("includes unlinked rows in ambiguity checks, rather than discarding the competitor", () => {
  expect(() => matchCanadianPayment([payment, {...payment, orderId: null}], order, payment.date, 1130)).toThrow();
});
it("rebuilds content DTOs and rejects impossible fields without echoing private extras", () => {
  expect(sanitizeCanadianPreview({...order, accessToken:'test-only', html:'private'}, [{...payment, accountId:'private'}])).toEqual({order, rows:[payment]});
  for (const rows of [[], [null], [{...payment, date:'2026-02-30'}], [{...payment, amountCents:0}], [{...payment, refund:'false'}]]) expect(() => sanitizeCanadianPreview(order, rows)).toThrow();
  expect(() => sanitizeCanadianPreview({...order, title:'x'.repeat(501)}, [payment])).toThrow();
});
it("returns private-data-free closed order failure codes for each failing check", async () => {
  const { readCanadianOrderForPreview } = await import('./ca-preview');
  expect(readCanadianOrderForPreview(detail(), 'https://www.amazon.com/private-test')).toEqual({orderReadFailure:'order-page'});
  const missingLink = detail(); missingLink.querySelector('a')!.remove();
  expect(readCanadianOrderForPreview(missingLink, detailUrl)).toEqual({orderReadFailure:'product-link'});
  const product = detail(); product.querySelector('a')!.setAttribute('href','https://private.invalid/dp/B000000001');
  expect(readCanadianOrderForPreview(product, detailUrl)).toEqual({orderReadFailure:'product-id'});
  const quantity = detail(); quantity.querySelector('.a-fixed-left-grid-inner')!.lastElementChild!.textContent = 'Qty: 2';
  expect(readCanadianOrderForPreview(quantity, detailUrl)).toEqual({orderReadFailure:'order-quantity'});
  expect(readCanadianOrderForPreview(detail(), detailUrl.replace('?orderID=synthetic-order','?private-test=hidden'))).toEqual({orderReadFailure:'order-query-missing'});
});

it("accepts the user-described numeric-hyphen shape with synthetic values", () => {
  for (const key of ['orderID','orderId','orderid']) expect(canadianOrderId('https://www.amazon.ca/your-orders/order-details?'+key+'=123-1234567-1234567')).toBe('123-1234567-1234567');
});
it("extracts identity without depending on URLSearchParams.entries", async () => {
  const { vi } = await import('vitest');
  const entries = vi.spyOn(URLSearchParams.prototype, 'entries').mockImplementation(() => { throw new Error('synthetic iterator failure'); });
  try { expect(canadianOrderId(detailUrl)).toBe('synthetic-order'); } finally { entries.mockRestore(); }
});
it("identifies failed identity conditions using closed codes, without returning actual values", () => {
  const cases = [
    ['https://www.amazon.com/your-orders/order-details?orderID=private-test','order-url'],
    ['https://www.amazon.ca/your-orders/order-details','order-query-missing'],
    [detailUrl+'&ORDERID=private-test','order-query-duplicate'],
    [detailUrl.replace('synthetic-order','private%20test'),'order-query-format'],
    [detailUrl.replace('synthetic-order','x'.repeat(65)),'order-query-format'],
  ];
  for (const [href, stage] of cases) {
    let error: unknown; try { canadianOrderId(href!); } catch (e) { error = e; }
    expect(error).toMatchObject({stage}); expect(String(error)).not.toContain('private-test');
  }
});

it.each(['paymentsRows','paymentsDates','paymentsAmounts','paymentsLinks'])('reports only the closed %s diagnostic', stage => {
 const doc=payments();
 if(stage==='paymentsRows')doc.body.innerHTML='';
 if(stage==='paymentsDates')doc.querySelector('.apx-transaction-date-container span')!.textContent='not a date';
 if(stage==='paymentsAmounts')doc.querySelector('.a-text-right span')!.textContent='private-invalid-value';
 if(stage==='paymentsLinks')doc.querySelector('a')!.setAttribute('href','https://example.invalid/private-order?orderID=secret');
 try { readCanadianPayments(doc,paymentsUrl); throw Error('Expected rejection'); }
 catch(error) { expect(error).toMatchObject({stage});expect((error as Error).message).not.toMatch(/private|secret/); }
});

it.each(['/gp/css/order-details','/gp/css/order-details/'])('reads the observed later-page Canadian link path %s and retains exact payment matching', path => {
 const doc=payments();doc.querySelector('a')!.setAttribute('href',path+'?orderID=synthetic-order');
 const rows=readCanadianPayments(doc,paymentsUrl);
 expect(rows).toEqual([payment]);expect(matchCanadianPayment(rows,order,payment.date,1130)).toEqual(payment);
});
it.each([
 'https://www.amazon.com/gp/css/order-details?orderID=synthetic-order',
 'http://www.amazon.ca/gp/css/order-details?orderID=synthetic-order',
 'https://www.amazon.ca/gp/css/order-details-extra?orderID=synthetic-order',
 'https://www.amazon.ca/gp/css/order-details?orderID=synthetic-order&orderId=other',
 'https://www.amazon.ca/gp/css/order-details?orderID=%2Fsecret'
])('rejects a changed origin/path or malformed identity for the later-page route',href=>{
 const doc=payments();doc.querySelector('a')!.setAttribute('href',href);
 expect(()=>readCanadianPayments(doc,paymentsUrl)).toThrow();
});

it('recognizes explicit gift/card method labels before the order link and projects only funding enums',()=>{
 const d=payments(),row=d.querySelector('.apx-transactions-line-item-component-container')!;
 const method=d.createElement('span');method.textContent='Amazon Gift Card Balance';row.prepend(method);
 const read=readCanadianPayments(d,paymentsUrl);expect(read[0]).toMatchObject({funding:'gift_card',amountCents:1130});
 expect(JSON.stringify(read)).not.toContain('Balance');expect(sanitizeCanadianPreview(order,read).rows[0]?.funding).toBe('gift_card');
 method.textContent='Visa ****1234';expect(readCanadianPayments(d,paymentsUrl)[0]?.funding).toBe('card');
});
it('does not identify gift-card funding from a product/order link, a later description, or an arbitrary substring',()=>{
 const d=payments(),row=d.querySelector('.apx-transactions-line-item-component-container')!;
 row.querySelector('a')!.textContent='Gift Card';const description=d.createElement('span');description.textContent='Gift Card';row.append(description);
 expect(readCanadianPayments(d,paymentsUrl)[0]?.funding).toBeUndefined();
 const method=d.createElement('span');method.textContent='Gift Card purchase for a friend';row.prepend(method);expect(readCanadianPayments(d,paymentsUrl)[0]?.funding).toBeUndefined();
});
it('rejects conflicting method labels and unsupported funding fields rather than guessing',()=>{
 const d=payments(),row=d.querySelector('.apx-transactions-line-item-component-container')!;
 for(const text of ['Gift Card','Visa']){const method=d.createElement('span');method.textContent=text;row.prepend(method);}
 expect(()=>readCanadianPayments(d,paymentsUrl)).toThrow();expect(()=>sanitizeCanadianPreview(order,[{...payment,funding:'arbitrary'}])).toThrow();
});
it('does not let a labeled gift-card payment make a matching card charge ambiguous',()=>{
 expect(matchCanadianPayment([payment,{...payment,funding:'gift_card'}],order,payment.date,payment.amountCents)).toEqual(payment);
});
