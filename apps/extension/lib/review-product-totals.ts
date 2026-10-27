import type {PurchaseReview} from './types';

/** Resolve displayed unit versus line prices only when the complete subtotal
 * admits exactly one set of line totals. Never scale prices to force agreement.
 * Bound the search; overly complex or ambiguous orders stay blocked. */
export function reviewProductTotals(review:PurchaseReview):number[]{
 const subtotal=review.summary?.subtotalCents;
 if(!Number.isSafeInteger(subtotal)||subtotal!<=0)throw Error('Review subtotal is incomplete.');
 type Path={total:number;previous:Path|null};
 type State={count:number;path:Path|null};
 let states=new Map<number,State>([[0,{count:1,path:null}]]);
 for(const item of review.items){
  const price=item.priceCents;
  if(!Number.isSafeInteger(price)||price!<=0)throw Error('Unreadable item price.');
  const options=[price!];
  if(item.quantity!=null){
   if(!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>10000)throw Error('Unreadable item quantity.');
   const multiplied=price!*item.quantity;
   if(!Number.isSafeInteger(multiplied))throw Error('Unsafe item total.');
   if(multiplied!==price)options.push(multiplied);
  }
  const next=new Map<number,State>();
  for(const [sum,state] of states)for(const total of options){
   const value=sum+total;if(!Number.isSafeInteger(value)||value>subtotal!)continue;
   const existing=next.get(value);
   if(existing)existing.count=Math.min(2,existing.count+state.count);
   else next.set(value,{count:state.count,path:{total,previous:state.path}});
   if(next.size>5000)throw Error('Item-price interpretation is too complex to verify.');
  }
  states=next;
 }
 const result=states.get(subtotal!);
 if(!result||result.count!==1)throw Error('Displayed item totals do not match the subtotal unambiguously.');
 const totals:number[]=[];for(let p=result.path;p;p=p.previous)totals.push(p.total);
 return totals.reverse();
}
