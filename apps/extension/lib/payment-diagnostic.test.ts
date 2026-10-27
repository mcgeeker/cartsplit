import {expect,it} from 'vitest';
import {paymentDiagnosticText} from './order-review-status';
const d={orderCents:2500,chargeCents:[2500],orderCurrency:'unspecified',chargeCurrencies:['unspecified']};
it('shows only bounded parsed totals, row counts and closed currency markings',()=>{
 expect(paymentDiagnosticText(d)).toBe('CartSplit read order card total $25.00 (unmarked $); 1 linked purchase row totaling $25.00: $25.00 (unmarked $).');
 expect(paymentDiagnosticText({...d,chargeCents:[2500,1500],chargeCurrencies:['unspecified','CAD']})).toContain('2 linked purchase rows totaling $40.00');
});
it('never renders arbitrary page strings or extra properties',()=>{
 const secret='synthetic-private-string';expect(paymentDiagnosticText({...d,private:secret})).not.toContain(secret);
 expect(paymentDiagnosticText({...d,orderCents:secret})).toBeNull();expect(paymentDiagnosticText({...d,chargeCurrencies:[secret]})).toBeNull();
});
it('rejects malformed, unbounded, inconsistent or unsafe diagnostics',()=>{
 for(const value of [null,{}, {...d,chargeCents:[]},{...d,chargeCents:Array(21).fill(1)},{...d,chargeCents:[NaN]},{...d,chargeCents:[1.1]},{...d,chargeCents:[Number.MAX_SAFE_INTEGER,1],chargeCurrencies:['CAD','CAD']},{...d,chargeCurrencies:[]}])expect(paymentDiagnosticText(value)).toBeNull();
});
