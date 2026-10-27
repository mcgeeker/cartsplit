import {expect,it} from 'vitest';
import {orderPayments} from './order-payments';
const row={orderId:'synthetic-order',date:'2025-01-02',amountCents:4000,refund:false,currency:'CAD'};
it('groups distinct purchase charges by exact order link and conserves the card total',()=>{
 const other={...row,orderId:'other-order'},second={...row,date:'2025-01-04',amountCents:6000};
 expect(orderPayments([row,other,second],'synthetic-order','CAD',10000)).toEqual([row,second]);
});
it('ignores refunds as purchase matches',()=>{expect(orderPayments([row,{...row,refund:true}],'synthetic-order','CAD',4000)).toEqual([row]);});
it('rejects incomplete pages, duplicate charge identities, mismatched currency and excessive groups',()=>{
 expect(()=>orderPayments([row],'synthetic-order','CAD',10000)).toThrow();
 expect(()=>orderPayments([row,row],'synthetic-order','CAD',8000)).toThrow();
 expect(()=>orderPayments([row],'synthetic-order','unspecified',4000)).toThrow();
 expect(()=>orderPayments(Array.from({length:21},()=>row),'synthetic-order','CAD',84000)).toThrow();
});
it('never groups an unrelated order just because its amount fits',()=>{expect(()=>orderPayments([{...row,orderId:'other-order'}],'synthetic-order','CAD',4000)).toThrow();});
it('separates a currency-marking disagreement from an actual amount mismatch',()=>{
 let error:any;try{orderPayments([row],'synthetic-order','unspecified',4000);}catch(e){error=e;}
 expect(error.stage).toBe('paymentGroupCurrency');expect(error.paymentDiagnostic).toEqual({orderCents:4000,chargeCents:[4000],orderCurrency:'unspecified',chargeCurrencies:['CAD']});
 try{orderPayments([row],'synthetic-order','CAD',2500);}catch(e){error=e;}
 expect(error.stage).toBe('paymentGroupTotal');expect(error.paymentDiagnostic).toMatchObject({orderCents:2500,chargeCents:[4000]});
});
it('separates explicitly labeled gift funding and reconciles it independently from the card remainder',()=>{
 const gift={...row,amountCents:1500,funding:'gift_card' as const},card={...row,amountCents:2500,funding:'card' as const};
 expect(orderPayments([card,gift],'synthetic-order','CAD',2500,1500)).toEqual([card]);
 expect(()=>orderPayments([card,{...gift,amountCents:1400}],'synthetic-order','CAD',2500,1500)).toThrow();
 expect(()=>orderPayments([card,gift],'synthetic-order','CAD',2500,0)).toThrow();
});
it('restores the unique full-card match when all remaining linked funding equals the declared gift contribution',()=>{
 const card={...row,amountCents:2500},gift={...row,amountCents:1500};
 expect(orderPayments([card,gift],'synthetic-order','CAD',2500,1500)).toEqual([card]);
 // Without independently declared gift funding, neither amount is discarded.
 expect(()=>orderPayments([card,gift],'synthetic-order','CAD',2500,0)).toThrow();
});
it('handles equal card and gift amounts without confusing the gift row for a duplicate card charge',()=>{
 const gift={...row,funding:'gift_card' as const};expect(orderPayments([row,gift],'synthetic-order','CAD',4000,4000)).toEqual([row]);
});
it('supports multiple separately dated card charges plus explicitly identified gift funding',()=>{
 const first={...row,amountCents:1000},second={...row,date:'2025-01-04',amountCents:1500},gift={...row,amountCents:500,funding:'gift_card' as const};
 expect(orderPayments([first,gift,second],'synthetic-order','CAD',2500,500)).toEqual([first,second]);
});
it('does not use the single-charge fallback for explicit extra card charges, ambiguous exact matches or wrong gift sums',()=>{
 const card={...row,amountCents:2500},extra={...row,amountCents:1500};
 for(const rows of [[card,{...extra,funding:'card' as const}],[card,{...extra,amountCents:1400}],[card,{...card,date:'2025-01-04'}],[card,{...extra,currency:'unspecified'}]])expect(()=>orderPayments(rows,'synthetic-order','CAD',2500,1500)).toThrow();
});
it('does not guess which unknown partial payments constitute a split-shipment card total',()=>{
 const rows=[{...row,amountCents:1000},{...row,date:'2025-01-04',amountCents:1500},{...row,date:'2025-01-06',amountCents:500}];
 expect(()=>orderPayments(rows,'synthetic-order','CAD',2500,500)).toThrow();
});
it('reconciles every ancillary row against gift funding instead of ignoring arbitrary additional rows',()=>{
 const card={...row,amountCents:2500},firstGift={...row,amountCents:600},secondGift={...row,date:'2025-01-04',amountCents:900,funding:'gift_card' as const};
 expect(orderPayments([firstGift,card,secondGift],'synthetic-order','CAD',2500,1500)).toEqual([card]);
 expect(()=>orderPayments([firstGift,card,secondGift,{...row,date:'2025-01-06',amountCents:1}],'synthetic-order','CAD',2500,1500)).toThrow();
});
