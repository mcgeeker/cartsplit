import {orderPayments} from "@/lib/order-payments";
import type {PurchaseReview} from "@/lib/types";
import {getReviewedTarget,inspectReviewedCharge} from "@/lib/ynab";
import {OrderReviewError,orderReviewFailureText,type OrderReviewFailure} from "@/lib/order-review-status";
import { browser } from "wxt/browser";
import { requestOrderPage, OrderPageRequestError } from "./page-request";
import { getSettings } from "@/lib/settings";
import { isAmazonCaDetailUrl } from "@/retailers/amazon/ca-detail-check";
import { canadianOrderId, sanitizeCanadianPreview, matchCanadianPayment } from "@/retailers/amazon/ca-preview";
import { amazonCaCheckPage } from "@/retailers/amazon/storefront";
import { allocateCanadianFunding } from "@/retailers/amazon/ca-funding";
import type { OrderSummary } from "@/retailers/amazon/order-summary";

/** Automatic current-page discovery; page metadata supplies all matching inputs. */
export interface OrderReviewBinding { connection: Awaited<ReturnType<typeof getSettings>>; detail:{id:number;url:string}; payments:{id:number;url:string}; paymentDate:string; identity:{productId:string;quantity:number|null;lineCents:number|null}[] }
export async function reviewSelectedOrder(confirmed:unknown,signal:AbortSignal,capture?:(binding:OrderReviewBinding)=>void,validateTarget=false):Promise<PurchaseReview>{
 let stage:OrderReviewFailure="confirmation";
 try{
 signal.throwIfAborted();if(confirmed!==true)throw Error("Confirm this purchase first.");
 stage="connection";
 const connection=await getSettings();signal.throwIfAborted();
 if(!connection.accessToken||!connection.planId||!connection.planName)throw Error("Select a YNAB plan.");
 stage="tab";
 const tabs=await browser.tabs.query({active:true,currentWindow:true});signal.throwIfAborted();
 const tab=tabs.length===1?tabs[0]:undefined;if(tab?.id===undefined||!isAmazonCaDetailUrl(tab.url??""))throw Error("Select order details.");
 stage="read";
 const raw=await requestOrderPage(tab.id,signal,"READ_CA_ORDER_SUMMARY") as OrderSummary;signal.throwIfAborted();
 if(raw&&typeof raw==='object'&&'orderReadFailure' in raw){const reason=(raw as unknown as {orderReadFailure:unknown}).orderReadFailure;if(orderReviewFailureText(reason))stage=reason as OrderReviewFailure;throw Error("Order reader stopped.");}
 stage="validation";
 if(!raw||raw.orderId!==canadianOrderId(tab.url!)||!Array.isArray(raw.items)||!raw.items.length||raw.items.length>200)throw Error("Unreadable order.");
 stage="summary";
 const shippingCharge=raw.shippingChargeCents??raw.shippingCents,shippingCredit=raw.shippingCreditCents??0;
 if(!Number.isSafeInteger(shippingCharge)||shippingCharge<0||!Number.isSafeInteger(shippingCredit)||shippingCredit<0||BigInt(shippingCharge)-BigInt(shippingCredit)!==BigInt(raw.shippingCents))throw Error("Invalid shipping credit.");
 const couponCents=raw.couponCents??0;
 if(!Number.isSafeInteger(couponCents)||couponCents<0||couponCents>=raw.subtotalCents)throw Error("Invalid coupon.");
 const fields=[raw.subtotalCents,raw.shippingCents,raw.feeCents,raw.taxCents,raw.giftCents,raw.totalCents];
 if(fields.some(v=>!Number.isSafeInteger(v)||v<0)||BigInt(raw.subtotalCents)+BigInt(raw.shippingCents)+BigInt(raw.feeCents)+BigInt(raw.taxCents)-BigInt(raw.giftCents)-BigInt(couponCents)!==BigInt(raw.totalCents))throw Error("Unreconciled order.");
 if(raw.totalCents===0){stage="noCardPayment";throw Error("No card payment remains.");}
 stage="paymentsTab";
 const paymentTabs=await browser.tabs.query({currentWindow:true,url:"https://www.amazon.ca/cpe/yourpayments/transactions*"});signal.throwIfAborted();
 const payments=paymentTabs.filter(t=>amazonCaCheckPage(t.url??"")==="transactions");if(payments.length!==1||payments[0]!.id===undefined)throw Error("Keep one payments tab.");
 const pt=payments[0]!;stage="paymentsRead";
 let rows:unknown;
 try{rows=await requestOrderPage(pt.id!,signal,"READ_CA_PREVIEW_PAYMENTS");}
 catch(error){
  if(error instanceof OrderPageRequestError)stage=error.reason==="timeout"?"paymentsTimeout":error.reason==="empty"?"paymentsReaderEmpty":"paymentsReaderUnavailable";
  throw error;
 }
 signal.throwIfAborted();
 if(rows && typeof rows === "object" && "paymentsReadFailure" in rows) {
  const code=(rows as {paymentsReadFailure:unknown}).paymentsReadFailure;
  if(typeof code === "string" && ["paymentsRead","paymentsLoading","paymentsPage","paymentsLanguage","paymentsRows","paymentsDates","paymentsAmounts","paymentsLinks","paymentsFunding"].includes(code))stage=code as OrderReviewFailure;
  throw Error("Payment reader stopped.");
 }
 stage="validation";

 const safe=sanitizeCanadianPreview({orderId:raw.orderId,currency:raw.currency,title:raw.items[0]!.title,productId:raw.items[0]!.productId,subtotalCents:raw.subtotalCents,totalCents:raw.totalCents},rows);
 stage="paymentsOrderMissing";
 if(!safe.rows.some(r=>r.orderId===raw.orderId))throw Error("Order is not listed on this payment page.");
 stage="linkedPayment";
 let linked:typeof safe.rows;
 try{linked=orderPayments(safe.rows,raw.orderId,raw.currency,raw.totalCents,raw.giftCents);}catch(error){if(error instanceof OrderReviewError)stage=error.stage;throw error;}
 stage="matching";
 if(linked.length===1)matchCanadianPayment(safe.rows,safe.order,linked[0]!.date,raw.totalCents);
 // Initial Review stops here unless YNAB has one complete eligible target.
 // Preparation/apply separately re-read the target under their existing guards.
 const eligible:boolean[]=[];
 if(validateTarget||linked.length>1){
  stage="candidate-transactions";
  try{const targetIds=new Set<string>();for(const charge of linked){const target=await (linked.length>1?inspectReviewedCharge:getReviewedTarget)(connection.planId,charge.date,charge.amountCents,signal,value=>{if(orderReviewFailureText(value))stage=value as OrderReviewFailure;});signal.throwIfAborted();if(target.planName!==connection.planName){stage="connection";throw Error("Select the current YNAB plan again.");}if(targetIds.has(target.transactionId)){stage="paymentGroupDuplicate";throw Error("Repeated target.");}targetIds.add(target.transactionId);eligible.push("eligible" in target?target.eligible as boolean:true);}}
  catch(error){
   if(error instanceof Error){if(error.message==="The matching transaction is already split.")stage="targetSplit";else if(error.message==="The matching transaction already has a category.")stage="targetCategorized";else if(error.message==="The target is incomplete or reconciled.")stage="targetIncomplete";}
   throw error;
  }
 }
 stage="validation";
 const items=raw.items.map(i=>{
  const safe=sanitizeCanadianPreview({orderId:raw.orderId,currency:raw.currency,title:i?.title,productId:i?.productId,subtotalCents:i?.priceCents,totalCents:raw.totalCents},rows);
  if(!(i.quantity===null||(Number.isSafeInteger(i.quantity)&&i.quantity>0&&i.quantity<=10000))||i.lineCents!==(i.quantity===1?i.priceCents:null))throw Error("Unreadable quantity/line price.");
  return{...safe.order,quantity:i.quantity,lineCents:i.lineCents};
 });
 stage="itemSubtotal";
 const known=items.every(i=>i.lineCents!==null);
 if(known&&items.reduce((n,i)=>n+BigInt(i.lineCents!),BigInt(0))!==BigInt(raw.subtotalCents))throw Error("Item subtotal mismatch.");
 // Order-level adjustments are detected, never assigned to a guessed product.
 stage="allocation";
 const pending=couponCents>0||!known||raw.feeCents>0||raw.shippingCents>0;
 const allocation=pending?null:allocateCanadianFunding({itemCents:items.map(i=>i.lineCents!),feeCentsByItem:items.map(()=>0),subtotalCents:raw.subtotalCents,beforeTaxCents:raw.subtotalCents,taxCents:raw.taxCents,giftCardCents:raw.giftCents,cardChargeCents:raw.totalCents});
 stage="context";
 const detail=await browser.tabs.get(tab.id);signal.throwIfAborted();const payment=await browser.tabs.get(pt.id!);signal.throwIfAborted();const current=await getSettings();signal.throwIfAborted();
 if(detail.url!==tab.url||payment.url!==pt.url||JSON.stringify(current)!==JSON.stringify(connection))throw Error("Review context changed.");
 capture?.({connection,detail:{id:tab.id,url:tab.url!},payments:{id:pt.id!,url:pt.url!},paymentDate:linked[0]!.date,identity:items.map(i=>({productId:i.productId,quantity:i.quantity,lineCents:i.lineCents}))});
 return{planName:connection.planName,...(linked.length>1?{matchedCharges:linked.map((charge,i)=>({date:charge.date,cents:charge.amountCents,eligible:eligible[i]??true}))}:{}),items:items.map((i,n)=>({title:i.title,quantity:i.quantity,priceCents:i.subtotalCents,cardCents:allocation?.[n]?.cardCents??null})),totalCents:raw.totalCents,
 summary:{subtotalCents:raw.subtotalCents,shippingCents:raw.shippingCents,shippingChargeCents:shippingCharge,shippingCreditCents:shippingCredit,couponCents,feeCents:raw.feeCents,taxCents:raw.taxCents,giftCents:raw.giftCents},allocationPending:pending};
 }catch(error){signal.throwIfAborted();if(error instanceof OrderReviewError)throw error;throw new OrderReviewError(stage);}
}
