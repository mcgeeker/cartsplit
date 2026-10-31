import {AdjustmentAllocationError} from "./adjustment-allocation";
import {OrderReviewError,orderReviewFailureText} from './order-review-status';

/** Fixed diagnostics only: never send a raw API/page exception to the sidebar. */
const FAILURES = {
 read: 'Could not refresh the reviewed order and linked payment. Keep both Amazon tabs open and select the order tab.',
 categories: 'Could not validate the selected categories. Refresh categories and check each selection.',
 target: 'Could not read the matching YNAB transaction. Check the connection and try preparation again.',
 'candidate-budget': 'The selected YNAB plan is no longer available or could not be verified. Choose your plan again in Connection settings.',
 'candidate-currency': 'The selected YNAB plan must have verified CAD currency. Currency conversion is not supported.',
 'candidate-date': 'The payment date or amount is invalid. A valid date, no more than one day in the future, and a positive card amount are required.',
 'candidate-account': 'Could not validate open, on-budget Cash, Checking, Savings or Credit Card accounts in the selected plan.',
 'candidate-transactions': 'Could not read transactions in the selected YNAB plan. Check the connection before preparing again.',
 'candidate-not-found': 'No Amazon transaction in the selected plan’s supported accounts matches the exact card amount within 2 days before or after the Amazon payment date. Check the amount and dates in YNAB.',
 'candidate-ambiguous': 'More than one Amazon transaction matches the exact card amount within 2 days before or after the payment date. Preparation stopped rather than choosing one.',
 'candidate-eligibility': 'The matching transaction is not an eligible uncategorized, unsplit Amazon outflow without transfers. Inspect it in YNAB; already-saved transactions must be preserved.',
 'candidate-auth': 'YNAB could not authorize the transaction check. Check the saved connection locally.',
 'candidate-rate-limit': 'YNAB is temporarily limiting requests. Wait before preparing again.',
 context: 'The reviewed tabs or saved connection changed. Select the original order tab and review again.',
} as const;
export type PurchasePreparationStage = keyof typeof FAILURES;
export function purchasePreparationStage(value:string):PurchasePreparationStage|null {return Object.hasOwn(FAILURES,value)?value as PurchasePreparationStage:null;}
export class PurchasePreparationError extends Error {
 constructor(readonly stage:PurchasePreparationStage){super('Purchase preparation stopped.');}
}
const KNOWN = new Map([
 ['Shorten each memo to 500 characters before preparing changes.', 'Shorten each memo to 500 characters before preparing changes.'],
 ['The transaction memo changed. Review again.', 'The transaction memo changed in YNAB. Cancel review and read the order again before editing it.'],
 ["Assign every item and additional charge to a payment.","Assign every item and additional charge to one payment before preparing."],
 ["Each payment needs at least one assigned item or additional charge.","Each payment needs at least one assigned item or additional charge."],
 ["Split charges do not reconcile.","The charge totals no longer reconcile with the reviewed order. Cancel review and read the order again."],
 ["Select a charge to prepare.","Select an uncategorized payment to prepare."],
 ["This charge is already categorized or split. Preserve it.","This payment is already categorized or split. It will be preserved; select an uncategorized payment."],
 ["Charge allocation changed after saving.","Item assignments, categories and adjustment choices are fixed after the first saved payment. Preserve the saved payment and review remaining choices separately."],
 ["Assign split-shipment adjustments to a charge and category.","Assign each split-shipment additional charge to a payment and category."],
 ["Split-shipment charge allocation is not prepared.","The split-shipment charges are matched. Item allocation to each charge must be reviewed before changes can be prepared."],
 ['Review expired or choices incomplete.', 'This review expired or its choices are incomplete. Cancel review, then review the selected order again.'],
 ['Review expired.', 'This review expired. Cancel review, then review the selected order again.'],
 ['Order changed. Review again.', 'The order or linked payment changed since Review. Cancel review, then review the selected order again.'],
 ['A selected category changed. Refresh categories.', 'A selected category changed in YNAB. Refresh categories, then review your choices.'],
 ['Choose a category for every item and adjustment.', 'Choose a category for every item and additional charge.'],
 ['Invalid category.', 'A selected category is no longer valid. Refresh categories, then review your choices.'],
 ['Select the reviewed order tab.', 'Select the original reviewed order tab before preparing changes.'],
 ['Review connection or page changed.', FAILURES.context],
 ['Review canceled.', 'Preparation was canceled. Review the selected order again when ready.'],
 ['This transaction was already attempted. Inspect YNAB; do not retry.', 'This transaction was already attempted. Inspect YNAB; do not retry or reload to retry.'],
 ['The matching transaction is already split.', 'The matching transaction is already split in YNAB. CartSplit preserves saved splits and cannot prepare another change for it.'],
 ['The matching transaction already has a category.', 'The matching transaction already has a category in YNAB. CartSplit only updates uncategorized transactions; leave the existing category unchanged.'],
 ['The target is incomplete or reconciled.', 'The matching transaction is reconciled or its details could not be validated. Inspect it in YNAB; preparation stopped.'],
]);
export function purchasePreparationFailureText(error:unknown):string {
 if(error instanceof AdjustmentAllocationError)return error.message;
 if(error instanceof OrderReviewError)return orderReviewFailureText(error.stage)??FAILURES.read;
 if(error instanceof PurchasePreparationError)return FAILURES[error.stage];
 if(error instanceof Error){if(error.name==='AbortError')return 'Preparation was canceled. No changes were sent.';const known=KNOWN.get(error.message);if(known)return known;}
 return 'Could not prepare changes. The failure could not be identified safely. Cancel review and review the selected order again.';
}
