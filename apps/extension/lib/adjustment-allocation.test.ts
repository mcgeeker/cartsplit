import {expect,it} from 'vitest';
import {allocateReviewAdjustments,defaultAdjustmentPolicies,apportionAdjustment} from './adjustment-allocation';
import {resolveReviewAllocation} from './review-allocation';
import {splitChargeAllocation} from './split-charge-allocation';
import type {AdjustmentPolicy,PurchaseReview} from './types';
const review:PurchaseReview={items:[{title:'Synthetic first',quantity:1,priceCents:1000,cardCents:null},{title:'Synthetic second',quantity:1,priceCents:3000,cardCents:null}],summary:{subtotalCents:4000,feeCents:100,shippingCents:200,couponCents:400,taxCents:390,giftCents:500},totalCents:3790};
const calc=(policies=defaultAdjustmentPolicies(review),r=review)=>resolveReviewAllocation(r,r.items.map(()=>true),policies);
const sum=(rows:ReturnType<typeof calc>,key:'cardCents'|'estimatedTaxCents'|'couponCents'|'giftCardCents'|'itemCents')=>rows.reduce((n,r)=>n+r[key],0);
it('defaults charges to equal, coupon/gift to price, with exclusive whole-row destinations',()=>{
 expect(defaultAdjustmentPolicies(review)).toEqual([{kind:'fee',mode:'all',method:'equal',items:[]},{kind:'shipping',mode:'all',method:'equal',items:[]},{kind:'coupon',mode:'all',method:'proportional',items:[]},{kind:'gift',mode:'all',method:'proportional',items:[]}]);
 const rows=calc();expect(rows.map(r=>r.itemCents)).toEqual([1050,2850,0,0]);expect(sum(rows,'couponCents')).toBe(400);expect(sum(rows,'itemCents')).toBe(3900);expect(sum(rows,'estimatedTaxCents')).toBe(390);expect(sum(rows,'giftCardCents')).toBe(500);expect(sum(rows,'cardCents')).toBe(3790);
});
it('applies selected coupons before tax, selected fees to cost, and gift funding only after gross',()=>{
 const rows=calc(defaultAdjustmentPolicies(review).map(p=>({...p,mode:'selected',items:p.kind==='coupon'?[1]:[0]})));
 expect(rows.map(r=>r.itemCents)).toEqual([1300,2600,0,0]);expect(rows.map(r=>r.couponCents)).toEqual([0,400,0,0]);expect(rows.map(r=>r.estimatedTaxCents)).toEqual([130,260,0,0]);expect(rows.map(r=>r.cardCents)).toEqual([930,2860,0,0]);
});
it('retains separate fee/shipping rows and applies gift funding only to selected products',()=>{
 const rows=calc(defaultAdjustmentPolicies(review).map(p=>p.kind==='fee'||p.kind==='shipping'?{...p,mode:'category'}:p));
 expect(rows.slice(2).map(r=>[r.kind,r.itemCents,r.cardCents])).toEqual([['fee',100,110],['shipping',200,220]]);expect(sum(rows,'cardCents')).toBe(3790);
});
it('handles a fully discounted product and deterministic penny remainders without negatives',()=>{
 const r={...review,totalCents:3000,summary:{...review.summary!,feeCents:0,shippingCents:0,couponCents:1000,taxCents:0,giftCents:0}};
 const rows=calc([{kind:'coupon',mode:'selected',method:'proportional',items:[0]}],r);expect(rows.map(r=>r.cardCents)).toEqual([0,3000]);
 expect(apportionAdjustment([1,1,1],2)).toEqual([1,1,0]);expect(apportionAdjustment([1,3],3)).toEqual([1,2]);expect(apportionAdjustment([0,0],0)).toEqual([0,0]);
});
it.each(['empty','duplicate','out-of-range','fraction','missing','duplicate-kind','negative-category','unknown-kind','stale-items','unknown-method','unknown-mode'])('rejects %s policy before producing a financial split',mode=>{
 const p=defaultAdjustmentPolicies(review);const coupon=p.find(p=>p.kind==='coupon')!;
 if(mode==='empty')Object.assign(coupon,{mode:'selected',items:[]});if(mode==='duplicate')Object.assign(coupon,{mode:'selected',items:[0,0]});if(mode==='out-of-range')Object.assign(coupon,{mode:'selected',items:[2]});if(mode==='fraction')Object.assign(coupon,{mode:'selected',items:[0.5]});if(mode==='missing')p.pop();if(mode==='duplicate-kind')p[3]=p[0]!;if(mode==='negative-category')coupon.mode='category';if(mode==='unknown-kind')Object.assign(coupon,{kind:'invented'});if(mode==='stale-items')coupon.items=[0];if(mode==='unknown-method')Object.assign(coupon,{method:'invented'});if(mode==='unknown-mode')Object.assign(coupon,{mode:'invented'});
 expect(()=>calc(p)).toThrow();
});
it.each(['coupon','gift'] as const)('refuses excessive selected %s reductions instead of capping or reallocating',kind=>{
 const r={...review,totalCents:2000,summary:{subtotalCents:4000,feeCents:0,shippingCents:0,couponCents:kind==='coupon'?2000:0,taxCents:0,giftCents:kind==='gift'?2000:0}};
 const policies:AdjustmentPolicy[]=[{kind,mode:'selected',method:'equal',items:[0]}];expect(()=>calc(policies,r)).toThrow('exceeds');
 policies[0]!.items=[0,1];expect(calc(policies,r).map(r=>r.cardCents)).toEqual([0,2000]);
});
it('rejects equal reductions that exceed a small item even when aggregate capacity suffices',()=>{
 const r={...review,totalCents:1000,summary:{subtotalCents:4000,feeCents:0,shippingCents:0,couponCents:3000,taxCents:0,giftCents:0}};
 expect(()=>calc([{kind:'coupon',mode:'all',method:'equal',items:[]}],r)).toThrow('exceeds');
 expect(calc(defaultAdjustmentPolicies(r),r).map(r=>r.cardCents)).toEqual([250,750]);
});
it('rejects unsafe amounts and funding mismatches',()=>{
 for(const value of [-1,0.5,Infinity,Number.MAX_SAFE_INTEGER+1])expect(()=>allocateReviewAdjustments({...review,summary:{...review.summary!,feeCents:value}},[1000,3000],defaultAdjustmentPolicies(review))).toThrow();
 expect(()=>calc(defaultAdjustmentPolicies(review),{...review,totalCents:3791})).toThrow('reconcile');
});
it('handles net shipping only, so an offsetting free-shipping credit is never allocated twice',()=>{
 const r={...review,totalCents:2000,summary:{subtotalCents:4000,shippingCents:0,shippingChargeCents:600,shippingCreditCents:600,feeCents:0,taxCents:0,giftCents:2000}};
 expect(defaultAdjustmentPolicies(r).map(p=>p.kind)).toEqual(['gift']);expect(calc(defaultAdjustmentPolicies(r),r).map(r=>r.cardCents)).toEqual([500,1500]);
});
it('adjusts split-payment weights within each assignment while preserving every exact charge',()=>{
 const r={...review,items:[...review.items,{title:'Synthetic third',priceCents:2000,quantity:1,cardCents:null}],summary:{subtotalCents:6000,shippingCents:0,feeCents:0,taxCents:0,giftCents:500},totalCents:5500};
 const rows=calc([{kind:'gift',mode:'selected',method:'proportional',items:[1]}],r);
 const charges=[{cents:3500},{cents:2000}];const selection={chargeIndex:0,assignments:[0,0,1]};
 expect(splitChargeAllocation(rows,charges,selection,true)).toEqual([[1000,2500,0],[0,0,2000]]);
 const changed=calc([{kind:'gift',mode:'selected',method:'proportional',items:[0]}],r);
 expect(splitChargeAllocation(changed,charges,selection,true)).toEqual([[500,3000,0],[0,0,2000]]);
});
it('does not require a payment for distributed zero adjustment rows; products still require assignments',()=>{
 const rows=calc(),charges=[{cents:1000},{cents:2790}];
 expect(splitChargeAllocation(rows,charges,{chargeIndex:0,assignments:[0,1,-1,-1]},true).map(parts=>parts.reduce((n,v)=>n+v,0))).toEqual([1000,2790]);
 expect(()=>splitChargeAllocation(rows,charges,{chargeIndex:0,assignments:[-1,1,-1,-1]},true)).toThrow('Assign');
});
it('conserves every cent over different quantities, reductions and penny cases',()=>{
 for(let i=1;i<80;i++){
  const prices=[i*21+1,i*53+2,i*97+3],subtotal=prices.reduce((a,b)=>a+b,0),coupon=i*3,gift=i*2,fee=i%7,shipping=i%9,tax=i*4;
  const r:PurchaseReview={items:prices.map((price,n)=>({title:`Synthetic ${n}`,quantity:1,priceCents:price,cardCents:null})),summary:{subtotalCents:subtotal,feeCents:fee,shippingCents:shipping,couponCents:coupon,giftCents:gift,taxCents:tax},totalCents:subtotal+fee+shipping-coupon+tax-gift};
  const rows=calc(defaultAdjustmentPolicies(r),r);expect(sum(rows,'cardCents')).toBe(r.totalCents);expect(sum(rows,'estimatedTaxCents')).toBe(tax);expect(sum(rows,'couponCents')).toBe(coupon);expect(sum(rows,'giftCardCents')).toBe(gift);expect(rows.every(r=>r.cardCents>=0)).toBe(true);
 }
});

it('uses discounted product values for both positive-charge policies, independently of charge order',()=>{
 const rows=calc(defaultAdjustmentPolicies(review).map(p=>p.kind==='fee'?{...p,mode:'selected',items:[0]}:p.kind==='shipping'?{...p,method:'proportional'}:p));
 expect(rows.map(r=>r.itemCents)).toEqual([1050,2850,0,0]);
});
it('explains zero-value proportional targets, allowing an explicit equal positive-charge choice',()=>{
 const r={...review,totalCents:100,summary:{subtotalCents:4000,feeCents:100,shippingCents:0,couponCents:4000,taxCents:0,giftCents:0}};
 const policies=defaultAdjustmentPolicies(r).map(p=>p.kind==='fee'?{...p,method:'proportional' as const}:p);
 expect(()=>calc(policies,r)).toThrow('no remaining value');expect(calc(defaultAdjustmentPolicies(r),r).map(r=>r.cardCents)).toEqual([50,50,0]);
});

it('uses explicit empty policies for consistent adjusted split weights even when only tax is present',()=>{
 const r:PurchaseReview={items:[1,2,3].map((price,n)=>({title:`Synthetic ${n}`,quantity:1,priceCents:price,cardCents:null})),summary:{subtotalCents:6,feeCents:0,shippingCents:0,taxCents:2,giftCents:0},totalCents:8};
 const rows=calc([],r);expect(rows.map(r=>r.cardCents)).toEqual([1,3,4]);
 expect(splitChargeAllocation(rows,[{cents:5},{cents:3}],{chargeIndex:0,assignments:[0,0,1]},true)).toEqual([[1,4,0],[0,0,3]]);
});
