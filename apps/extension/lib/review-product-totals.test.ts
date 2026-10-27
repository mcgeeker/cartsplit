import {expect,it} from 'vitest';
import {reviewProductTotals} from './review-product-totals';
import {resolveReviewAllocation} from './review-allocation';
function review(prices:number[],quantities:(number|null)[],subtotal:number){return {items:prices.map((priceCents,i)=>({title:`Synthetic ${i}`,priceCents,quantity:quantities[i]!,cardCents:null})),totalCents:subtotal,summary:{subtotalCents:subtotal,shippingCents:0,feeCents:0,taxCents:0,giftCents:0}};}
it('multiplies a displayed unit price by quantity when only that reconciles',()=>{
 const r=review([600,2800],[2,1],4000);expect(reviewProductTotals(r)).toEqual([1200,2800]);
 expect(()=>resolveReviewAllocation(r,[false,false])).toThrow('Confirm');
 expect(resolveReviewAllocation(r,[true,false]).map(l=>l.cardCents)).toEqual([1200,2800]);
});
it('does not multiply a displayed full-line price twice',()=>{expect(reviewProductTotals(review([1200,2800],[2,1],4000))).toEqual([1200,2800]);});
it('supports mixed unit and line prices only when uniquely reconciled',()=>{expect(reviewProductTotals(review([600,1500],[2,3],2700))).toEqual([1200,1500]);});
it('rejects ambiguous interpretations and missing quantities that cannot reconcile',()=>{
 expect(()=>reviewProductTotals(review([600,600],[2,2],1800))).toThrow('unambiguously');
 expect(()=>reviewProductTotals(review([600],[null],1200))).toThrow('unambiguously');
});
it('preserves gift-credit, shipping-credit and exact card arithmetic after quantity resolution',()=>{
 const r={...review([600,2800],[2,1],4000),totalCents:2500,summary:{subtotalCents:4000,shippingCents:0,shippingChargeCents:500,shippingCreditCents:500,feeCents:0,taxCents:0,giftCents:1500}};
 const result=resolveReviewAllocation(r,[true,false]);expect(result.reduce((sum,l)=>sum+l.cardCents,0)).toBe(2500);expect(result.reduce((sum,l)=>sum+l.giftCardCents,0)).toBe(1500);
});
it('rejects unsafe amounts and malformed quantities',()=>{for(const q of [0,-1,1.5,10001])expect(()=>reviewProductTotals(review([600],[q],600))).toThrow();});
