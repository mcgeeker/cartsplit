// @vitest-environment happy-dom
import {expect,it} from "vitest";
import {readOrderSummary} from "./order-summary";
import {allocateCanadianFunding} from "./ca-funding";
const url="https://www.amazon.ca/your-orders/order-details?orderID=synthetic";
function page(n=3,fee=0,gift=0){return new DOMParser().parseFromString('<html lang="en"><body>'+Array.from({length:n},(_,i)=>`<div class="a-fixed-left-grid-inner"><a href="/dp/B${String(i).padStart(9,'0')}">Synthetic ${i}</a><span class="a-color-price">$10.00</span><span>Qty: 1</span></div>`).join('')+[["Item(s) Subtotal",n*10],["Shipping & Handling",0],...(fee?[["Environmental Handling Fee",fee]]:[]),["Total before tax",n*10+fee],["Estimated PST/RST/QST",0],["Estimated GST/HST",0],...(gift?[["Gift Card Amount",-gift]]:[]),["Grand Total",n*10+fee-gift]].map(([label,value])=>`<div class="summary"><span>${label}</span><span>$${Number(value).toFixed(2)}</span></div>`).join('')+'</body></html>',"text/html");}
it.each([1,2,3,12])("discovers %s rows and allocates arbitrary-length reconciled arrays",n=>{
 const order=readOrderSummary(page(n),url);expect(order.items).toHaveLength(n);expect(order.feeCents).toBe(0);expect(order.giftCents).toBe(0);
 const a=allocateCanadianFunding({itemCents:order.items.map(i=>i.lineCents!),feeCentsByItem:order.items.map(()=>0),subtotalCents:n*1000,beforeTaxCents:n*1000,taxCents:13,giftCardCents:7,cardChargeCents:n*1000+6});
 expect(a.reduce((s,i)=>s+i.cardCents,0)).toBe(n*1000+6);
});
it("detects optional order fee and gift without assigning fee ownership",()=>{const o=readOrderSummary(page(3,1,5),url);expect(o).toMatchObject({feeCents:100,giftCents:500,totalCents:2600});});
it.each(['duplicate','malformed','subtotal','quantity'])('rejects or flags %s without guessing',mode=>{
 const d=page();if(mode==='duplicate')d.body.append(d.querySelector('.summary')!.cloneNode(true));
 if(mode==='malformed')d.querySelector('.summary')!.lastElementChild!.textContent='unknown';
 if(mode==='subtotal')d.querySelector('.a-color-price')!.textContent='$11.00';
 if(mode==='quantity'){d.querySelector('.a-fixed-left-grid-inner')!.lastElementChild!.remove();expect(readOrderSummary(d,url).itemsReconciled).toBe(false);return;}
 expect(()=>readOrderSummary(d,url)).toThrow();
});
it("flags quantity above one rather than guessing unit versus line price",()=>{const d=page();d.querySelector('.a-fixed-left-grid-inner')!.lastElementChild!.textContent='Qty: 2';expect(readOrderSummary(d,url)).toMatchObject({itemsReconciled:false});});
function shippingDiscountPage(){
 const d=page(3);const row=[...d.querySelectorAll('.summary')].find(r=>r.firstElementChild!.textContent==='Shipping & Handling')!;
 row.lastElementChild!.textContent='$5.00';const credit=d.createElement('div');credit.className='summary';credit.innerHTML='<span>Free Shipping:</span><span>-$5.00</span>';row.after(credit);return{d,credit};
}
it('reads an explicit Free Shipping deduction and reconciles net shipping to zero',()=>{
 const {d}=shippingDiscountPage();expect(readOrderSummary(d,url)).toMatchObject({subtotalCents:3000,shippingChargeCents:500,shippingCreditCents:500,shippingCents:0,totalCents:3000});
});
it.each(['positive','excess','duplicate','unreadable','currency'])('rejects an invalid Free Shipping row: %s',mode=>{
 const {d,credit}=shippingDiscountPage();if(mode==='positive')credit.lastElementChild!.textContent='$5.00';if(mode==='excess')credit.lastElementChild!.textContent='-$6.00';if(mode==='duplicate')credit.after(credit.cloneNode(true));if(mode==='unreadable')credit.lastElementChild!.textContent='unknown';if(mode==='currency')credit.lastElementChild!.textContent='CAD -5.00';expect(()=>readOrderSummary(d,url)).toThrow();
});

function couponPage(){
 const d=page(3);const row=d.createElement('div');row.className='summary';row.innerHTML='<span>Your Coupon Savings:</span><span>-$3.00</span>';d.body.append(row);
 for(const [label,value] of [['Total before tax','$27.00'],['Estimated GST/HST','$3.51'],['Grand Total','$30.51']] as const) {
  [...d.querySelectorAll('.summary')].find(r=>r.firstElementChild!.textContent===label)!.lastElementChild!.textContent=value;
 }
 return {d,row};
}
it('detects explicit coupon savings separately and reconciles before-tax, tax and card totals',()=>{
 const {d}=couponPage();expect(readOrderSummary(d,url)).toMatchObject({subtotalCents:3000,couponCents:300,taxCents:351,totalCents:3051});
});
it.each(['positive','excess','duplicate','unreadable','currency','arithmetic'])('rejects invalid coupon evidence: %s',mode=>{
 const {d,row}=couponPage();if(mode==='positive')row.lastElementChild!.textContent='$3.00';if(mode==='excess')row.lastElementChild!.textContent='-$31.00';if(mode==='duplicate')row.after(row.cloneNode(true));if(mode==='unreadable')row.lastElementChild!.textContent='unknown';if(mode==='currency')row.lastElementChild!.textContent='CAD -3.00';if(mode==='arithmetic')row.lastElementChild!.textContent='-$2.00';expect(()=>readOrderSummary(d,url)).toThrow();
});

function scopedSummary(){
 const d=page(3,0,5),summary=d.createElement('section');
 [...d.querySelectorAll('.summary')].forEach(row=>summary.append(row));d.body.append(summary);
 return {d,summary};
}
it('ignores unrelated Free Shipping promotional text outside the monetary summary',()=>{
 const {d}=scopedSummary();const promo=d.createElement('div');promo.innerHTML='<span>Free Shipping</span>';d.body.prepend(promo);
 expect(readOrderSummary(d,url)).toMatchObject({shippingCents:0,shippingCreditCents:0,giftCents:500,totalCents:2500});
});
it('still rejects an unreadable Free Shipping adjustment inside the summary',()=>{
 const {d,summary}=scopedSummary();const credit=d.createElement('div');credit.innerHTML='<span>Free Shipping:</span><span>unreadable</span>';summary.append(credit);
 expect(()=>readOrderSummary(d,url)).toThrow();
});
it('reads the monetary Free Shipping credit even when matching promotional text exists elsewhere',()=>{
 const {d}=shippingDiscountPage(),summary=d.createElement('section');[...d.querySelectorAll('.summary')].forEach(row=>summary.append(row));d.body.append(summary);
 const promo=d.createElement('div');promo.innerHTML='<span>Free Shipping</span>';d.body.prepend(promo);
 expect(readOrderSummary(d,url)).toMatchObject({shippingChargeCents:500,shippingCreditCents:500,shippingCents:0,totalCents:3000});
});

it.each(['$0.00','-$0.00'])('distinguishes a fully gift-funded order (%s) from inconsistent arithmetic',amount=>{
 const d=page(3,0,30);[...d.querySelectorAll('.summary')].find(r=>r.firstElementChild!.textContent==='Grand Total')!.lastElementChild!.textContent=amount;
 try{readOrderSummary(d,url);throw Error('Expected no-card result');}catch(error){expect(error).toMatchObject({stage:'noCardPayment'});}
});
