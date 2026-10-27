import {OrderReviewError,type OrderReviewFailure} from "@/lib/order-review-status";
import { findLabeledAmount, isAmazonCaDetailUrl } from "./ca-detail-check";
import { canadianOrderId } from "./ca-preview";
import { SELECTORS, ASIN_REGEX } from "./selectors";
import { inspectDollarAmount } from "./ca-page-check";

export interface OrderSummary {
 orderId:string;currency:"CAD"|"unspecified";
 items:{title:string;productId:string;priceCents:number;quantity:number|null;lineCents:number|null}[];
 subtotalCents:number;shippingCents:number;shippingChargeCents?:number;shippingCreditCents?:number;couponCents?:number;feeCents:number;taxCents:number;giftCents:number;totalCents:number;
 itemsReconciled:boolean;
}
/** Current document only; no I/O or guesses about absent quantities/fee ownership. */
export function readOrderSummary(doc:Document,href:string):OrderSummary{
 let stage:OrderReviewFailure="page";
 try{return parseOrderSummary(doc,href,next=>{stage=next;});}catch{throw new OrderReviewError(stage);}
}
function parseOrderSummary(doc:Document,href:string,report:(stage:OrderReviewFailure)=>void):OrderSummary{
 if(!isAmazonCaDetailUrl(href)||!/^en(?:[-_][a-z]{2})?$/i.test(doc.documentElement.lang))throw Error("Unsupported page.");
 // Anchor monetary reads to the smallest shared subtotal/grand-total block.
 // Delivery promises elsewhere on the page are not monetary adjustment rows.
 const labels=(pattern:RegExp)=>{
  const matches=[...doc.querySelectorAll("span, dt, label, div, td, th")].filter(el=>pattern.test((el.textContent??"").replace(/\s+/g," ").trim()));
  return matches.filter(el=>!matches.some(other=>other!==el&&el.contains(other)));
 };
 report("subtotal");const subtotalLabels=labels(/^(?:Item\(s\)|Items?)\s+Subtotal:?$/i);
 if(subtotalLabels.length!==1)throw Error("Ambiguous subtotal block.");
 report("total");const totalLabels=labels(/^Grand Total:?$/i);
 if(totalLabels.length!==1)throw Error("Ambiguous total block.");
 let shared:Element|null=subtotalLabels[0]!.parentElement;
 while(shared&&!shared.contains(totalLabels[0]!))shared=shared.parentElement;
 const summaryScope:ParentNode=shared??doc;
 const read=(stage:OrderReviewFailure,pattern:RegExp,optional=false,negative=false)=>{
  report(stage);
  const r=findLabeledAmount(summaryScope,pattern,negative);
  if(optional&&r.status==="label-not-found")return null;
  if(!r.amount)throw Error("Unreadable summary row.");return r.amount;
 };
 const subtotal=read("subtotal",/^(?:Item\(s\)|Items?)\s+Subtotal:?$/i)!;
 const shipping=read("shipping",/^Shipping\s*&\s*Handling:?$/i)!;
 const shippingCredit=read("shippingCredit",/^Free\s+Shipping:?$/i,true,true);
 const coupon=read("coupon",/^Your Coupon Savings:?$/i,true,true);
 const fee=read("fee",/^Environmental\s+Handling\s+Fee:?$/i,true);
 const before=read("beforeTax",/^Total before tax:?$/i)!;
 const pst=read("pst",/^Estimated PST\s*\/\s*RST\s*\/\s*QST:?$/i)!;
 const gst=read("gst",/^Estimated GST\s*\/\s*HST:?$/i)!;
 const gift=read("gift",/^Gift Card Amount:?$/i,true,true);
 const total=read("total",/^Grand Total:?$/i)!;
 report("summary");
 const amounts=[subtotal,shipping,shippingCredit,coupon,fee,before,pst,gst,gift,total].filter(v=>v!==null);
 if(amounts.some(v=>v.currency!==subtotal.currency)||subtotal.currency==="USD"||(gift&&gift.cents>0))throw Error("Unsupported currency or gift amount.");
 if(shippingCredit&&(shippingCredit.cents>0||-shippingCredit.cents>shipping.cents))throw Error("Invalid shipping credit.");
 if(coupon&&(coupon.cents>0||-coupon.cents>=subtotal.cents))throw Error("Invalid coupon savings.");
 const couponCents=coupon?Math.abs(coupon.cents):0;
 const shippingCreditCents=shippingCredit?Math.abs(shippingCredit.cents):0;
 const shippingCents=shipping.cents-shippingCreditCents;
 const feeCents=fee?.cents??0,giftCents=gift?-gift.cents||0:0,taxCents=pst.cents+gst.cents;
 const sum=BigInt(subtotal.cents)+BigInt(shippingCents)+BigInt(feeCents)-BigInt(couponCents);
 if(sum!==BigInt(before.cents)||sum+BigInt(taxCents)-BigInt(giftCents)!==BigInt(total.cents)||!Number.isSafeInteger(taxCents)||total.cents<0)throw Error("Order totals do not reconcile.");
 if(total.cents===0){report("noCardPayment");throw Error("No card payment remains.");}
 report("items");
 let rows=[...doc.querySelectorAll(SELECTORS.itemBoxPrimary)];if(!rows.length)rows=[...doc.querySelectorAll(SELECTORS.itemBoxFallback)];
 if(!rows.length||rows.length>200)throw Error("Unreadable item list.");
 const items=rows.map(row=>{
  const link=[...row.querySelectorAll(SELECTORS.productLink)].find(a=>a.textContent?.trim());
  const title=link?.textContent?.trim()??"";const u=new URL(link?.getAttribute("href")??"",href);
  const productId=u.origin==="https://www.amazon.ca"&&!u.username&&!u.password?u.pathname.match(ASIN_REGEX)?.[1]:undefined;
  const amount=inspectDollarAmount((row.querySelector(SELECTORS.priceEl)??row.querySelector(SELECTORS.priceFallback))?.textContent??"");
  const explicit=[...(row.textContent??"").matchAll(/Qty:\s*(\d+)/gi)].map(m=>m[1]!);
  const fallback=row.querySelector(SELECTORS.quantityFallback)?.textContent?.trim();
  if(fallback){const m=fallback.match(/^(?:Qty:\s*)?(\d+)$/i);if(!m)throw Error("Unreadable quantity.");explicit.push(m[1]!);}
  const quantities=explicit.map(Number);const quantity=quantities.length?quantities[0]!:null;
  if(!title||title.length>500||!productId||!amount||amount.currency!==subtotal.currency||amount.cents<=0||
   (quantity!==null&&(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000||quantities.some(q=>q!==quantity))))throw Error("Unreadable item.");
  // The observed selector establishes a unit price only for quantity one.
  const lineCents=quantity===1?amount.cents:null;
  return{title,productId,priceCents:amount.cents,quantity,lineCents};
 });
 report("itemSubtotal");
 const known=items.every(i=>i.lineCents!==null);
 const itemTotal=items.reduce((a,i)=>a+BigInt(i.lineCents??0),BigInt(0));
 if(known&&itemTotal!==BigInt(subtotal.cents))throw Error("Items do not reconcile.");
 return{orderId:canadianOrderId(href),currency:subtotal.currency,items,subtotalCents:subtotal.cents,shippingCents,shippingChargeCents:shipping.cents,shippingCreditCents,couponCents,feeCents,taxCents,giftCents,totalCents:total.cents,itemsReconciled:known};
}
