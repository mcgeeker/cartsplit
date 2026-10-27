import type {AdjustmentKind, AdjustmentPolicy, PurchaseReview} from './types';

export const adjustmentLabels:Record<AdjustmentKind,string>={fee:'Environmental handling fee',shipping:'Shipping & handling',coupon:'Coupon savings',gift:'Gift funding'};
const failure={value:'The selected items have no remaining value for proportional distribution. Choose Equally or different items.',policy:'Choose a valid destination and distribution method for each adjustment.',selection:'Select at least one item for each selected-items adjustment.',capacity:'This reduction exceeds the selected items’ available value. Choose more items or another distribution method.',total:'The order adjustments do not reconcile with the card total. Review the order amounts.'};
export class AdjustmentAllocationError extends Error {
 constructor(readonly reason:keyof typeof failure){super(failure[reason]);}
}
function amount(n:number){if(!Number.isSafeInteger(n)||n<0)throw new AdjustmentAllocationError('total');return BigInt(n);}
/** Integer cents; largest remainders first, displayed row order breaks ties. */
export function apportionAdjustment(weights:readonly number[],total:number):number[]{
 const w=weights.map(amount),t=amount(total),sum=w.reduce((a,b)=>a+b,0n);
 if(!sum){if(t)throw new AdjustmentAllocationError('value');return weights.map(()=>0);}
 const values=w.map(v=>v*t/sum);
 const order=w.map((v,i)=>({i,r:v*t%sum})).sort((a,b)=>a.r===b.r?a.i-b.i:a.r>b.r?-1:1);
 const left=Number(t-values.reduce((a,b)=>a+b,0n));for(const {i} of order.slice(0,left))values[i]=values[i]!+1n;
 return values.map(v=>{const n=Number(v);amount(n);return n;});
}
export function defaultAdjustmentPolicies(review:PurchaseReview):AdjustmentPolicy[]{
 const s=review.summary;if(!s)return [];
 return (['fee','shipping','coupon','gift'] as const).filter(kind=>({fee:s.feeCents,shipping:s.shippingCents,coupon:s.couponCents??0,gift:s.giftCents})[kind]>0).map(kind=>({kind,mode:'all',method:kind==='fee'||kind==='shipping'?'equal':'proportional',items:[]}));
}
export function adjustmentIsDistributed(kind:string,policies?:readonly AdjustmentPolicy[]){return !!policies?.some(p=>p.kind===kind&&p.mode!=='category');}

/** Coupons change pre-tax cost; positive charges add cost; gift funding reduces
 * gross card shares. Distributed rows stay in place with zero cents so category
 * and payment indices never shift when the user changes a policy. */
export function allocateReviewAdjustments(review:PurchaseReview,totals:readonly number[],policies:readonly AdjustmentPolicy[]){
 const s=review.summary;if(!s||totals.length!==review.items.length||!totals.length||totals.length>200)throw new AdjustmentAllocationError('total');
 const amounts={fee:s.feeCents,shipping:s.shippingCents,coupon:s.couponCents??0,gift:s.giftCents};
 Object.values(amounts).forEach(amount);amount(s.taxCents);amount(review.totalCents);amount(s.subtotalCents);totals.forEach(amount);
 if(totals.some(n=>n===0)||totals.reduce((n,v)=>n+BigInt(v),0n)!==BigInt(s.subtotalCents))throw new AdjustmentAllocationError('total');
 const expected=defaultAdjustmentPolicies(review);
 if(!Array.isArray(policies)||policies.length!==expected.length||new Set(policies.map(p=>p?.kind)).size!==expected.length)throw new AdjustmentAllocationError('policy');
 const byKind=new Map<AdjustmentKind,AdjustmentPolicy>();
 for(const p of policies){
  if(!p||!expected.some(e=>e.kind===p.kind)||!['all','selected','category'].includes(p.mode)||!['equal','proportional'].includes(p.method)||!Array.isArray(p.items)||p.items.length>totals.length)throw new AdjustmentAllocationError('policy');
  if(p.mode==='category'&&!['fee','shipping'].includes(p.kind)||p.mode!=='selected'&&p.items.length)throw new AdjustmentAllocationError('policy');
  if(p.mode==='selected'&&!p.items.length)throw new AdjustmentAllocationError('selection');
  if(new Set(p.items).size!==p.items.length||p.items.some((i:number)=>!Number.isInteger(i)||i<0||i>=totals.length))throw new AdjustmentAllocationError('policy');
  byKind.set(p.kind,p);
 }
 const rows=review.items.map((item,i)=>({title:item.title,kind:'item' as 'item'|'fee'|'shipping',cents:totals[i]!,itemCents:totals[i]!,feeCents:0,couponCents:0,estimatedTaxCents:0,grossCents:0,giftCardCents:0,cardCents:0}));
 for(const kind of ['fee','shipping'] as const)if(amounts[kind]>0)rows.push({title:adjustmentLabels[kind],kind,cents:amounts[kind],itemCents:0,feeCents:0,couponCents:0,estimatedTaxCents:0,grossCents:0,giftCardCents:0,cardCents:0});
 const shares=(p:AdjustmentPolicy,available:readonly number[])=>{
  const indices=totals.map((_,i)=>i).filter(i=>p.mode==='all'||p.items.includes(i));
  const weights=indices.map(i=>p.method==='equal'?1:available[i]!);
  const parts=apportionAdjustment(weights,amounts[p.kind]);
  // Never cap or move an excessive selected reduction to another product.
  if((p.kind==='coupon'||p.kind==='gift')&&parts.some((v,i)=>v>available[indices[i]!]!))throw new AdjustmentAllocationError('capacity');
  return rows.map((_,i)=>{const n=indices.indexOf(i);return n<0?0:parts[n]!;});
 };
 const coupon=byKind.get('coupon');if(coupon){const parts=shares(coupon,totals);rows.forEach((row,i)=>{row.couponCents=parts[i]!;row.itemCents-=parts[i]!;});}
 const discounted=rows.map(r=>r.itemCents);
 for(const kind of ['fee','shipping'] as const){const p=byKind.get(kind);if(!p)continue;
  if(p.mode==='category')rows.find(r=>r.kind===kind)!.itemCents=amounts[kind];
  else {const parts=shares(p,discounted);rows.forEach((row,i)=>{row.itemCents+=parts[i]!;row.feeCents+=parts[i]!;});}
 }
 const base=rows.map(r=>r.itemCents);base.forEach(amount);
 const tax=apportionAdjustment(base,s.taxCents);rows.forEach((row,i)=>{row.estimatedTaxCents=tax[i]!;row.grossCents=row.itemCents+tax[i]!;amount(row.grossCents);});
 const gift=byKind.get('gift'),funding=gift?shares(gift,rows.map(r=>r.grossCents)):rows.map(()=>0);
 rows.forEach((row,i)=>{row.giftCardCents=funding[i]!;row.cardCents=row.grossCents-funding[i]!;amount(row.cardCents);});
 if(!review.totalCents||rows.reduce((n,r)=>n+BigInt(r.cardCents),0n)!==BigInt(review.totalCents))throw new AdjustmentAllocationError('total');
 return rows;
}
