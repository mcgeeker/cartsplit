import {expect,it} from 'vitest';
import {PurchasePreparationError,purchasePreparationFailureText,purchasePreparationStage} from './purchase-preparation-status';
import {OrderReviewError} from './order-review-status';
it.each([
 ['candidate-not-found','No transaction'],['candidate-ambiguous','More than one'],['candidate-eligibility','not an eligible'],['candidate-account','unlinked'],['candidate-date','valid date'],['candidate-auth','authorize'],['candidate-rate-limit','limiting'],['categories','selected categories'],
] as const)('reports the fixed %s diagnostic', (stage,text)=>{
 expect(purchasePreparationFailureText(new PurchasePreparationError(stage))).toContain(text);
});
it('distinguishes changed order, expired review and already categorized/split transactions',()=>{
 expect(purchasePreparationFailureText(Error('Order changed. Review again.'))).toContain('changed since Review');
 expect(purchasePreparationFailureText(Error('Review expired or choices incomplete.'))).toContain('expired');
 expect(purchasePreparationFailureText(Error('The matching transaction is already split.'))).toContain('already split');
 expect(purchasePreparationFailureText(Error('The matching transaction already has a category.'))).toContain('already has a category');
 expect(purchasePreparationFailureText(new OrderReviewError('paymentsOrderMissing'))).toContain('Next or Previous');
});
it('never exposes raw error details, unknown stages, URLs or identifiers',()=>{
 const secret="synthetic-sensitive-error-detail-for-projection-test";
 expect(purchasePreparationFailureText(Error(secret))).not.toContain(secret);
 expect(purchasePreparationFailureText({message:secret})).not.toContain(secret);
 expect(purchasePreparationStage('candidate-secret')).toBeNull();expect(purchasePreparationStage('__proto__')).toBeNull();
});
