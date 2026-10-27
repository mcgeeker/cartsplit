import type {AdjustmentPolicy, PurchaseReview} from '@/lib/types';
import {adjustmentLabels} from '@/lib/adjustment-allocation';
const cad=(n:number)=>`CAD ${(n/100).toFixed(2)}`;
export default function AdjustmentControls({review,policies,disabled,onChange}:{review:PurchaseReview;policies:AdjustmentPolicy[];disabled:boolean;onChange:(policies:AdjustmentPolicy[])=>void}){
 const s=review.summary;if(!s||!policies.length)return null;
 return <section aria-label="Adjustments" className="mt-4 space-y-3 border-t border-line pt-3 text-[13px] leading-relaxed">
 <h3 className="font-semibold">Adjustments</h3>
 <p className="text-muted">Choose where each adjustment belongs. Selected items includes every unit in that product row.</p>
 {policies.map(p=>{const label=adjustmentLabels[p.kind],value={fee:s.feeCents,shipping:s.shippingCents,coupon:s.couponCents??0,gift:s.giftCents}[p.kind];
 const update=(patch:Partial<AdjustmentPolicy>)=>onChange(policies.map(current=>current.kind===p.kind?{...current,...patch}:current));
 return <fieldset key={p.kind} disabled={disabled} className="min-w-0 space-y-2 rounded-control border border-line p-3">
 <legend className="px-1 font-semibold">{label} · {p.kind==='coupon'||p.kind==='gift'?'−':''}{cad(value)}</legend>
 <p className="text-muted">{p.kind==='coupon'?'Reduces item cost before estimated tax.':p.kind==='gift'?'Reduces card-funded shares after tax; item purchase prices stay unchanged.':p.kind==='shipping'?'Uses net shipping after any Free Shipping credit.':'Adds to item cost before estimated tax.'}</p>
 <label className="flex min-w-0 flex-col gap-1 font-semibold">Apply to<select aria-label={`Apply ${label.toLowerCase()} to`} className="w-full rounded-control border border-line-strong bg-surface px-2 py-2 font-normal text-text" value={p.mode} onChange={e=>update({mode:e.target.value as AdjustmentPolicy['mode'],items:[]})}>
 <option value="all">All items</option><option value="selected">Selected items</option>{(p.kind==='fee'||p.kind==='shipping')&&<option value="category">Separate category</option>}
 </select></label>
 {p.mode==='selected'&&<div role="group" aria-label={`Items for ${label.toLowerCase()}`} className="space-y-2">{review.items.map((item,i)=><label key={i} className="flex min-w-0 items-start gap-2"><input className="mt-1 shrink-0" type="checkbox" aria-label={`${label}: item ${i+1}`} checked={p.items.includes(i)} onChange={e=>update({items:e.target.checked?[...p.items,i].sort((a,b)=>a-b):p.items.filter(n=>n!==i)})}/><span className="min-w-0 break-words">{i+1}. {item.title}</span></label>)}</div>}
 {p.mode!=='category'&&<label className="flex flex-col gap-1 font-semibold">Distribute<select aria-label={`Distribution for ${label.toLowerCase()}`} className="w-full rounded-control border border-line-strong bg-surface px-2 py-2 font-normal text-text" value={p.method} onChange={e=>update({method:e.target.value as AdjustmentPolicy['method']})}><option value="equal">Equally</option><option value="proportional">By item value</option></select></label>}
 </fieldset>;})}
 {s.shippingCreditCents? <p className="text-muted">Free Shipping credit offsets shipping first. It is already included in net shipping.</p>:null}
 </section>;
}
