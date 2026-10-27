/** Fixed diagnostics only: never display a page value, identifier, URL or raw exception. */
export const ORDER_REVIEW_FAILURES={
 "candidate-date":"The Amazon payment date or amount is invalid. A positive card payment with a valid date is required.",
 "candidate-budget":"The selected YNAB plan is no longer available or could not be verified. Choose your plan again in Connection settings.",
 "candidate-currency":"The selected YNAB plan must have verified CAD currency. Currency conversion is not supported.",
 "candidate-account":"Could not validate open, on-budget Cash, Checking, Savings or Credit Card accounts in the selected plan.",
 "candidate-transactions":"Could not read transactions in the selected YNAB plan. Check the connection before reviewing again.",
 "candidate-not-found":"No Amazon transaction in the selected plan’s supported accounts matches the exact card amount within 2 days before or after the Amazon payment date. Check the amount and dates in YNAB before reviewing again.",
 "candidate-ambiguous":"More than one Amazon transaction matches the exact card amount within 2 days before or after the payment date. Review stopped rather than choosing one.",
 "candidate-eligibility":"The matching YNAB transaction is not an eligible uncategorized, unsplit Amazon outflow without transfers. Inspect it in YNAB; existing saved transactions are preserved.",
 "candidate-auth":"YNAB could not authorize the transaction check. Check the saved connection locally.",
 "candidate-rate-limit":"YNAB is temporarily limiting requests. Wait before reviewing again.",
 targetCategorized:"The matching YNAB transaction already has a category. CartSplit only updates uncategorized transactions; leave its existing category unchanged.",
 targetSplit:"The matching YNAB transaction is already split. CartSplit preserves saved splits; review stopped before category suggestions.",
 targetIncomplete:"The matching YNAB transaction is reconciled or its details could not be validated. Inspect it in YNAB.",
 giftPaymentUnidentified:"The linked amounts include extra funding equal to the gift-card contribution, but CartSplit could not identify its payment method safely. Check whether the extra row is explicitly labeled Gift Card or Gift Card Balance. No row was excluded from its amount alone.",
 giftPaymentFunding:"The explicitly labeled gift-card payments do not reconcile with the order’s gift-card contribution. Check the linked funding rows; no card charge was guessed or discarded.",
 paymentsFunding:"A payment row contains conflicting card and gift-card method labels. Its funding type could not be identified safely.",
 paymentGroupCurrency:"The currency markings read from the order and its linked Amazon charges differ. CartSplit stopped rather than treating them as the same currency.",
 paymentGroupTotal:"The charges linked to this order on the current Amazon Transactions page do not add up to the order’s card total. Locate all charges for this order before continuing; no partial match was accepted.",
 paymentGroupDuplicate:"This order has multiple Amazon charges with the same date and amount. CartSplit cannot distinguish them safely.",
 splitPaymentLimit:"This order has more than 20 linked charges, exceeding the supported review size.",
 confirmation:"Confirm the CAD purchase before reviewing.",
 connection:"The saved connection or plan name changed. Choose your YNAB plan again in Connection settings.",
 tab:"Select the Amazon.ca Order details tab in the same Firefox window.",
 read:"Could not read the order page. Refresh that tab after reloading the extension.",
 orderLoading:"The Order details page is still loading. Wait until it finishes, then review again.",
 page:"The order page address or language is unsupported.",
 subtotal:"The item subtotal row is missing, ambiguous or unreadable.",
 shipping:"The shipping summary row is missing, ambiguous or unreadable.",
 shippingCredit:"The Free Shipping credit row is ambiguous, unreadable or inconsistent with the shipping charge.",
 coupon:"The Your Coupon Savings row is ambiguous, unreadable or inconsistent with the item subtotal.",
 fee:"An environmental fee row is present but ambiguous or unreadable.",
 beforeTax:"The before-tax total row is missing, ambiguous or unreadable.",
 pst:"The PST/RST/QST tax row is missing, ambiguous or unreadable.",
 gst:"The GST/HST tax row is missing, ambiguous or unreadable.",
 gift:"A gift-card row is present but ambiguous or unreadable.",
 total:"The grand-total row is missing, ambiguous or unreadable.",
 summary:"The summary amounts, currency or funding do not reconcile.",
 noCardPayment:"This order has no remaining card payment after gift credit or discounts. There is no card charge to match in YNAB.",
 items:"An item row, product link, price or quantity could not be read safely.",
 itemSubtotal:"The detected item line totals do not match the item subtotal.",
 paymentsTab:"Keep exactly one Amazon.ca Transactions tab open in this window.",
 paymentsRows:"The Transactions/Your Payments page has no readable transaction rows or exceeds the supported page size.",
 paymentsDates:"A transaction date or its association with a payment row could not be read on the current Transactions/Your Payments page.",
 paymentsAmounts:"A payment amount or currency could not be read on the current Transactions/Your Payments page.",
 paymentsLinks:"An order link is unreadable or ambiguous on the current Transactions/Your Payments page.",
 paymentsLoading:"The Transactions page is still loading. Wait until it finishes, then review again.",
 paymentsPage:"The Transactions tab navigated away from the supported Amazon.ca Transactions address. Open Transactions again before reviewing.",
 paymentsLanguage:"The Transactions page does not identify itself as supported English content. Check that Amazon.ca is set to English and that the page has finished loading.",
 paymentsReaderUnavailable:"CartSplit could not contact its reader in the Transactions tab. Select that tab and let it finish loading before reviewing again.",
 paymentsReaderEmpty:"The Transactions tab did not return a reader response. Select that tab and let it finish loading before reviewing again.",
 paymentsTimeout:"The Transactions reader did not respond within 10 seconds. Let that tab finish loading, then review again.",
 paymentsRead:"The Transactions reader encountered an unexpected error. Review stopped before YNAB matching; report this message if it persists.",
 validation:"The order or payment data did not pass validation.",
 paymentsOrderMissing:"This order isn’t listed on the current Transactions/Your Payments page. Use Next or Previous in that tab to find the order, then review it again.",
 linkedPayment:"The current Transactions page does not contain exactly one purchase linked to this order with the same card amount. Select the page containing that payment.",
 matching:"The linked payment failed the amount, currency or uniqueness checks.",
 allocation:"The detected amounts could not be allocated exactly.",
 context:"The selected pages or saved connection changed during review.",
} as const;
export type OrderReviewFailure=keyof typeof ORDER_REVIEW_FAILURES;
export function orderReviewFailureText(reason:unknown){return typeof reason==='string'&&Object.hasOwn(ORDER_REVIEW_FAILURES,reason)?ORDER_REVIEW_FAILURES[reason as OrderReviewFailure]:null;}
export interface PaymentDiagnostic {orderCents:number;chargeCents:number[];orderCurrency:"CAD"|"unspecified";chargeCurrencies:("CAD"|"unspecified")[]}
/** Only bounded parsed monetary values/closed currency labels, never page text or IDs. */
export function paymentDiagnosticText(value:unknown):string|null{
 if(!value||typeof value!=="object")return null;
 const d=value as PaymentDiagnostic;
 const cents=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
 const currency=(v:unknown)=>v==="CAD"||v==="unspecified";
 if(!cents(d.orderCents)||!Array.isArray(d.chargeCents)||!d.chargeCents.length||d.chargeCents.length>20||!d.chargeCents.every(cents)||!currency(d.orderCurrency)||!Array.isArray(d.chargeCurrencies)||d.chargeCurrencies.length!==d.chargeCents.length||!d.chargeCurrencies.every(currency))return null;
 const total=d.chargeCents.reduce((n,c)=>n+BigInt(c),0n);if(total>BigInt(Number.MAX_SAFE_INTEGER))return null;
 const amount=(c:number)=>`$${(c/100).toFixed(2)}`;
 const marking=(c:string)=>c==="CAD"?"explicit CAD":"unmarked $";
 return `CartSplit read order card total ${amount(d.orderCents)} (${marking(d.orderCurrency)}); ${d.chargeCents.length} linked purchase ${d.chargeCents.length===1?"row":"rows"} totaling ${amount(Number(total))}: ${d.chargeCents.map((c,i)=>`${amount(c)} (${marking(d.chargeCurrencies[i]!)})`).join(" + ")}.`;
}
export class OrderReviewError extends Error{constructor(readonly stage:OrderReviewFailure,readonly paymentDiagnostic?:PaymentDiagnostic){super(`Order review stopped: ${stage}`);}}
