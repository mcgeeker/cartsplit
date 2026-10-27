import {expect,it} from 'vitest';
import {splitChargeAllocation} from './split-charge-allocation';
const lines=[{itemCents:1000,cardCents:1130},{itemCents:3000,cardCents:3390},{itemCents:2000,cardCents:2260}],charges=[{cents:2261},{cents:4519}];
it('uses only user assignments and preserves each exact charge total independently',()=>{
 const result=splitChargeAllocation(lines,charges,{chargeIndex:0,assignments:[0,1,0]});
 expect(result).toEqual([[754,0,1507],[0,4519,0]]);expect(result.map(r=>r.reduce((n,v)=>n+v,0))).toEqual([2261,4519]);expect(lines.map(l=>l.cardCents)).toEqual([1130,3390,2260]);
});
it.each([[-1,1,0],[0,1],[0,0,0],[0,1,2],[0,1,0.5]].map(assignments=>({assignments})))('rejects incomplete, empty or invalid payment assignments $assignments',({assignments})=>{expect(()=>splitChargeAllocation(lines,charges,{chargeIndex:0,assignments})).toThrow();});
it('requires an exact overall reconciliation and safe positive prices/charges',()=>{
 expect(()=>splitChargeAllocation(lines,[{cents:2260},{cents:4519}],{chargeIndex:0,assignments:[0,1,0]})).toThrow();
 expect(()=>splitChargeAllocation([{itemCents:0,cardCents:2261},lines[1]!],[{cents:2261},{cents:3390}],{chargeIndex:0,assignments:[0,1]})).toThrow();
 expect(()=>splitChargeAllocation(lines,charges,{chargeIndex:20,assignments:[0,1,0]})).toThrow();
});
it('breaks remainder ties by displayed row order without floating point multiplication',()=>{
 expect(splitChargeAllocation([{itemCents:1,cardCents:1},{itemCents:1,cardCents:1},{itemCents:1,cardCents:2}],[{cents:3},{cents:1}],{chargeIndex:0,assignments:[0,0,1]})).toEqual([[2,1,0],[0,0,1]]);
});

it('assigns each exact card payment to the sole product without inventing shipment ownership',()=>{
 const lines=[{kind:'item',itemCents:2000,cardCents:1500}];
 expect(splitChargeAllocation(lines,[{cents:600},{cents:900}],{chargeIndex:1,assignments:[]},true)).toEqual([[600],[900]]);
 expect(()=>splitChargeAllocation(lines,[{cents:601},{cents:900}],{chargeIndex:1,assignments:[]},true)).toThrow('reconcile');
 expect(()=>splitChargeAllocation([{...lines[0]!,kind:'fee'}],[{cents:600},{cents:900}],{chargeIndex:1,assignments:[]},true)).toThrow('Assign');
 expect(()=>splitChargeAllocation([lines[0]!,lines[0]!],[{cents:600},{cents:2400}],{chargeIndex:1,assignments:[]},true)).toThrow('Assign');
});
