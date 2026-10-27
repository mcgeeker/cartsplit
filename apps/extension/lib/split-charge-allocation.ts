import {apportionAdjustment} from "./adjustment-allocation";
import type {SplitChargeSelection} from './types';

/** User assigns whole rows to charges. Allocate each known charge across its
 * assigned discounted pre-tax weights (legacy) or reviewed adjusted card values.
 * Payment totals are authoritative; these weights do not establish shipment ownership. */
export function splitChargeAllocation(lines:readonly {itemCents:number;cardCents:number;kind?:string}[],charges:readonly {cents:number}[],selection:SplitChargeSelection,adjustedWeights=false):number[][]{
 const single=lines.length===1&&lines[0]!.kind==='item'&&Array.isArray(selection?.assignments)&&selection.assignments.length===0;
 if(!selection||!Number.isInteger(selection.chargeIndex)||selection.chargeIndex<0||selection.chargeIndex>=charges.length||charges.length<2||charges.length>20||!Array.isArray(selection.assignments)||(selection.assignments.length!==lines.length&&!single))throw Error('Assign every item and additional charge to a payment.');
 if(charges.some(c=>!Number.isSafeInteger(c.cents)||c.cents<=0)||lines.some(l=>!Number.isSafeInteger(l.itemCents)||(adjustedWeights?l.itemCents<0:l.itemCents<=0)||!Number.isSafeInteger(l.cardCents)||l.cardCents<0)||charges.reduce((n,c)=>n+BigInt(c.cents),0n)!==lines.reduce((n,l)=>n+BigInt(l.cardCents),0n))throw Error('Split charges do not reconcile.');
 if(single)return charges.map(charge=>[charge.cents]); // Same sole product/category for each separately approved payment.
 if(selection.assignments.some((index,i)=>!(adjustedWeights&&['fee','shipping'].includes(lines[i]!.kind??'')&&lines[i]!.itemCents===0&&lines[i]!.cardCents===0&&index===-1)&&(!Number.isInteger(index)||index<0||index>=charges.length)))throw Error('Assign every item and additional charge to a payment.');
 return charges.map((charge,chargeIndex)=>{
  const indices=lines.map((_,i)=>i).filter(i=>selection.assignments[i]===chargeIndex&&(!adjustedWeights||lines[i]!.cardCents>0));
  if(!indices.length)throw Error('Each payment needs at least one assigned item or additional charge.');
  const weights=indices.map(i=>adjustedWeights?lines[i]!.cardCents:lines[i]!.itemCents);
  const values=apportionAdjustment(weights,charge.cents);
  const result=lines.map(()=>0);indices.forEach((i,n)=>{result[i]=values[n]!;});return result;
 });
}
