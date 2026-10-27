import {expect,it} from 'vitest';
import {DISTRIBUTE_EQUALLY as equal,distributeAdjustmentShares} from './adjustment-distribution';
const lines=[{kind:'item',cardCents:100},{kind:'item',cardCents:200},{kind:'fee',cardCents:5},{kind:'shipping',cardCents:3}];
it('splits chosen charges equally with deterministic remainder pennies and retains exact card total',()=>{
 const r=distributeAdjustmentShares(lines,2,['first','second',equal,equal]);
 expect(r.map(l=>l.cardCents)).toEqual([105,203,0,0]);expect(r.reduce((n,l)=>n+l.cardCents,0)).toBe(308);
 expect(lines.map(l=>l.cardCents)).toEqual([100,200,5,3]);
});
it('leaves separately categorized charges unchanged and handles a single item',()=>{
 expect(distributeAdjustmentShares(lines,2,['first','second','fee',equal]).map(l=>l.cardCents)).toEqual([102,201,5,0]);
 expect(distributeAdjustmentShares([lines[0]!,lines[2]!],1,['first',equal]).map(l=>l.cardCents)).toEqual([105,0]);
});
it('rejects distributing products and mismatched choices',()=>{
 expect(()=>distributeAdjustmentShares(lines,2,[equal,'second','fee','shipping'])).toThrow();
 expect(()=>distributeAdjustmentShares(lines,2,[])).toThrow();
});
