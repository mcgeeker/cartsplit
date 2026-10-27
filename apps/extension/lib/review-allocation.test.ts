import {expect,it} from "vitest";
import {resolveReviewAllocation} from "./review-allocation";
const review={items:[{title:"Synthetic first",priceCents:1000,quantity:null,cardCents:null},{title:"Synthetic second",priceCents:3000,quantity:1,cardCents:null}],totalCents:4133,summary:{subtotalCents:4000,feeCents:100,shippingCents:0,taxCents:533,giftCents:500}};
it("waits for line-total confirmation only where page quantity/price is unclear",()=>{
 expect(()=>resolveReviewAllocation(review,[false,false])).toThrow("Confirm");
 expect(resolveReviewAllocation(review,[true,false])).toHaveLength(3);
});
it("keeps detected fees as separate categorizable rows and conserves tax, gift and card cents",()=>{
 const r=resolveReviewAllocation(review,[true,false]);expect(r[2]).toMatchObject({title:"Environmental handling fee",kind:"fee",itemCents:100});
 expect(r.reduce((n,l)=>n+l.estimatedTaxCents,0)).toBe(533);expect(r.reduce((n,l)=>n+l.giftCardCents,0)).toBe(500);expect(r.reduce((n,l)=>n+l.cardCents,0)).toBe(4133);
 expect(r.slice(0,2).map(l=>l.feeCents)).toEqual([0,0]);
});
it("rejects inconsistent item totals after manual confirmation",()=>{expect(()=>resolveReviewAllocation({...review,summary:{...review.summary,subtotalCents:4001}},[true,true])).toThrow("subtotal");});
it("supports multiple items and keeps shipping separate",()=>{
 const r=resolveReviewAllocation({items:Array.from({length:3},(_,i)=>({title:`Synthetic ${i}`,priceCents:100,quantity:1,cardCents:null})),totalCents:350,summary:{subtotalCents:300,shippingCents:50,feeCents:0,taxCents:0,giftCents:0}},[false,false,false]);expect(r).toHaveLength(4);expect(r[3]).toMatchObject({kind:"shipping",cardCents:50});
});

it('allocates an explicit coupon to products before tax, excludes fee/shipping and conserves all columns',()=>{
 const r=resolveReviewAllocation({...review,totalCents:3681,summary:{...review.summary,couponCents:400,taxCents:481}},[true,false]);
 expect(r.map(l=>l.couponCents)).toEqual([100,300,0]);expect(r.map(l=>l.itemCents)).toEqual([900,2700,100]);
 expect(r.reduce((n,l)=>n+l.estimatedTaxCents,0)).toBe(481);expect(r.reduce((n,l)=>n+l.giftCardCents,0)).toBe(500);expect(r.reduce((n,l)=>n+l.cardCents,0)).toBe(3681);
});
it('keeps single-item coupon arithmetic exact and rejects invalid coupon totals',()=>{
 const r={items:[{title:'Synthetic coupon item',priceCents:3000,quantity:1,cardCents:null}],totalCents:3051,summary:{subtotalCents:3000,couponCents:300,shippingCents:0,feeCents:0,taxCents:351,giftCents:0}};
 expect(resolveReviewAllocation(r,[false])[0]).toMatchObject({couponCents:300,itemCents:2700,cardCents:3051});
 for(const couponCents of [-1,3000,3001,1.5])expect(()=>resolveReviewAllocation({...r,summary:{...r.summary,couponCents}},[false])).toThrow();
});

it.each([1,2,null])('reduces a verified single-product order to its full card payment with no allocation choices (quantity=%s)',quantity=>{
 const r={items:[{title:'Synthetic single product',priceCents:quantity===2?1000:2000,quantity,cardCents:null}],totalCents:1785,summary:{subtotalCents:2000,couponCents:200,feeCents:100,shippingCents:300,shippingChargeCents:500,shippingCreditCents:200,taxCents:286,giftCents:701}};
 const rows=resolveReviewAllocation(r,[false],[]);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({kind:'item',couponCents:200,feeCents:400,estimatedTaxCents:286,giftCardCents:701,cardCents:1785});
});
it('still refuses inconsistent prices, unknown quantity multiplication, invalid funding and unsafe amounts in the single-product shortcut',()=>{
 const r={items:[{title:'Synthetic single',priceCents:1000,quantity:1,cardCents:null}],totalCents:1000,summary:{subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0}};
 for(const changed of [{...r,totalCents:1001},{...r,items:[{...r.items[0]!,priceCents:999}]},{...r,items:[{...r.items[0]!,quantity:null}],summary:{...r.summary,subtotalCents:2000}},{...r,summary:{...r.summary,feeCents:-1}},{...r,summary:{...r.summary,giftCents:1001}},{...r,summary:{...r.summary,taxCents:Number.MAX_SAFE_INTEGER+1}}])expect(()=>resolveReviewAllocation(changed,[false],[])).toThrow();
});
it('cannot apply the no-choice shortcut to a multiple-product order with adjustments',()=>{
 expect(()=>resolveReviewAllocation({...review,items:review.items.map(i=>({...i,quantity:1}))},[false,false],[])).toThrow('valid destination');
});
