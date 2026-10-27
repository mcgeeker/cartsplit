import {reviewProductTotals} from "./review-product-totals";
import type { PurchaseReview, AdjustmentPolicy } from "./types";
import {allocateReviewAdjustments,defaultAdjustmentPolicies} from './adjustment-allocation';
import { allocateCanadianFunding, allocateCouponSavings } from "@/retailers/amazon/ca-funding";

/** Local estimate only. A future write must freshly validate the bound page and choices. */
export function resolveReviewAllocation(review:PurchaseReview,lineTotalsConfirmed:readonly boolean[],adjustments?:readonly AdjustmentPolicy[]){
 const s=review.summary;if(!s||review.items.length!==lineTotalsConfirmed.length)throw Error("Review is incomplete.");
 const totals=reviewProductTotals(review);
 // One product row needs no allocation decisions. Reconcile every adjustment
 // using the same staged math, then return only its full card-funded amount.
 // Empty explicit policies select this path; legacy requests retain their shape.
 if(review.items.length===1&&Array.isArray(adjustments)&&adjustments.length===0){
  return allocateReviewAdjustments(review,totals,defaultAdjustmentPolicies(review)).filter(line=>line.kind==='item');
 }
 const lines=review.items.map((item,i)=>{
  if(item.quantity!==1&&lineTotalsConfirmed[i]!==true)throw Error("Confirm unclear displayed line totals first.");
  if(!Number.isSafeInteger(item.priceCents)||item.priceCents!<=0)throw Error("Unreadable item price.");
  return{title:item.title,kind:"item" as "item"|"fee"|"shipping",cents:totals[i]!};
 });
 if(lines.reduce((n,l)=>n+BigInt(l.cents),BigInt(0))!==BigInt(s.subtotalCents))throw Error("Displayed item totals do not match the subtotal.");
 if(adjustments!==undefined)return allocateReviewAdjustments(review,totals,adjustments);
 const coupons=allocateCouponSavings(lines.map(l=>l.cents),s.couponCents??0);
 const couponCents=s.couponCents??0;
 // Keep order-level adjustments separate; no inferred product ownership.
 if(s.feeCents>0)lines.push({title:"Environmental handling fee",kind:"fee",cents:s.feeCents});
 if(s.shippingCents>0)lines.push({title:"Shipping & handling",kind:"shipping",cents:s.shippingCents});
 const base=s.subtotalCents+s.feeCents+s.shippingCents-couponCents;
 if(!Number.isSafeInteger(base))throw Error("Unsafe order total.");
 const allocation=allocateCanadianFunding({itemCents:lines.map((l,i)=>l.cents-(coupons[i]??0)),feeCentsByItem:lines.map(()=>0),subtotalCents:base,beforeTaxCents:base,taxCents:s.taxCents,giftCardCents:s.giftCents,cardChargeCents:review.totalCents});
 return lines.map((line,i)=>({...line,...allocation[i]!,couponCents:coupons[i]??0}));
}
