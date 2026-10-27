import {expect,it} from 'vitest';
import {orderReviewFailureText} from './order-review-status';
it('projects only closed diagnostics, never arbitrary errors or prototype properties',()=>{
 expect(orderReviewFailureText('linkedPayment')).toContain('current Transactions page');
 expect(orderReviewFailureText('paymentsOrderMissing')).toContain('Use Next or Previous');
 for(const v of ['constructor','toString','__proto__','private-order-id test-only-token',{},null])expect(orderReviewFailureText(v)).toBeNull();
});
