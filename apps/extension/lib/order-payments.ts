import {OrderReviewError,type PaymentDiagnostic} from './order-review-status';

/** Group only purchase rows explicitly linked to this order, with complete funding. */
export function orderPayments<T extends {orderId:string|null;date:string;amountCents:number;refund:boolean;currency:string;funding?:"card"|"gift_card"|"unknown"}>(rows:T[],orderId:string,currency:string,totalCents:number,giftCents=0):T[]{
 const purchases=rows.filter(row=>row.orderId===orderId&&!row.refund);
 if(!Number.isSafeInteger(giftCents)||giftCents<0)throw new OrderReviewError('giftPaymentFunding');
 const gifts=purchases.filter(row=>row.funding==='gift_card');
 const identifiedGiftSum=gifts.reduce((sum,row)=>sum+BigInt(row.amountCents),0n);
 const candidates=purchases.filter(row=>row.funding!=='gift_card');
 // Preserve the original single-charge path. This is not a subset search:
 // one order-linked row must equal the entire card remainder, and ALL other
 // linked funding must equal the independently declared gift contribution.
 // An explicitly identified additional card charge can never be discarded.
 const fullCharge=candidates.filter(row=>row.amountCents===totalCents);
 const otherFunding=purchases.filter(row=>row!==fullCharge[0]);
 const reconciledSingle=giftCents>0&&fullCharge.length===1&&otherFunding.length>0&&
  purchases.every(row=>row.currency===currency)&&otherFunding.every(row=>row.funding!=='card')&&
  otherFunding.reduce((sum,row)=>sum+BigInt(row.amountCents),0n)===BigInt(giftCents);
 if(!reconciledSingle&&gifts.length&&(gifts.some(row=>row.currency!==currency)||identifiedGiftSum!==BigInt(giftCents)))throw new OrderReviewError('giftPaymentFunding');
 const linked=reconciledSingle?fullCharge:candidates;
 if(!linked.length)throw new OrderReviewError('paymentsOrderMissing');
 if(linked.length>20)throw new OrderReviewError('splitPaymentLimit');
 const keys=linked.map(row=>`${row.date}:${row.amountCents}`);
 if(new Set(keys).size!==keys.length)throw new OrderReviewError('paymentGroupDuplicate');
 const diagnostic:PaymentDiagnostic|undefined=(currency==='CAD'||currency==='unspecified')&&linked.every(row=>row.currency==='CAD'||row.currency==='unspecified')?{orderCents:totalCents,chargeCents:linked.map(row=>row.amountCents),orderCurrency:currency,chargeCurrencies:linked.map(row=>row.currency as 'CAD'|'unspecified')}:undefined;
 if(linked.some(row=>row.currency!==currency))throw new OrderReviewError('paymentGroupCurrency',diagnostic);
 const cardSum=linked.reduce((sum,row)=>sum+BigInt(row.amountCents),0n);
 if(cardSum!==BigInt(totalCents)){if(giftCents>0&&cardSum===BigInt(totalCents)+BigInt(giftCents)&&linked.some(row=>!row.funding||row.funding==='unknown'))throw new OrderReviewError('giftPaymentUnidentified',diagnostic);throw new OrderReviewError('paymentGroupTotal',diagnostic);}
 return linked;
}
