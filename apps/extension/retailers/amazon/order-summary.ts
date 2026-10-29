import {OrderReviewError,type OrderReviewFailure} from "@/lib/order-review-status";
import { findLabeledAmount, isAmazonCaDetailUrl } from "./ca-detail-check";
import { canadianOrderId } from "./ca-preview";
import { SELECTORS, ASIN_REGEX } from "./selectors";
import { inspectDollarAmount } from "./ca-page-check";

const SUMMARY_ELEMENTS="span, dt, label, div, td, th";
const SHIPPING_CREDIT_LABEL=/^Free\s+Shipping:?$/i;
const GIFT_LABEL=/^Gift Card Amount:?$/i;
const textOf=(node:Node)=>(node.textContent??"").replace(/\s+/g," ").trim();
const follows=(first:Node,second:Node)=>!!(first.compareDocumentPosition(second)&Node.DOCUMENT_POSITION_FOLLOWING);

/** Read reductions from their sign and before-tax position, not discount names.
 * Require a single strict amount at the end of a bounded row. Shipping credits
 * and gift funding are accounted for separately, never deducted a second time. */
function readPreTaxDiscounts(scope:Element|Document,subtotal:Element,beforeTax:Element,total:Element){
 const elements=[...scope.querySelectorAll(`${SUMMARY_ELEMENTS}, dd`)].filter(el=>
  !el.contains(subtotal)&&!el.contains(total)&&follows(subtotal,el)&&follows(el,total));
 const monetary=elements.filter(el=>inspectDollarAmount(textOf(el))!==null);
 // A value may be wrapped in several spans/divs; count its outermost amount once.
 const values:Node[]=monetary.filter(el=>!monetary.some(other=>other!==el&&other.contains(el)));
 // Some rows put the amount directly after the label without a value element.
 const walker=subtotal.ownerDocument.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  if(follows(subtotal,node)&&follows(node,total)&&inspectDollarAmount(textOf(node))&&!monetary.some(el=>el.contains(node)))values.push(node);
 }
 const rowLabel=(value:Node)=>{
  if(value.nodeType===Node.ELEMENT_NODE){
   const el=value as Element;
   if(el.tagName==="DD"&&el.previousElementSibling?.tagName==="DT"){
    const label=textOf(el.previousElementSibling);if(label)return label;
   }
  }
  let row=value.parentElement;
  for(let depth=0;row&&depth<3;depth++,row=row.parentElement){
   if(row===scope||row.contains(subtotal)||row.contains(beforeTax)||row.contains(total))break;
   const text=textOf(row),amountText=textOf(value);
   if(!text.endsWith(amountText))continue;
   const label=text.slice(0,-amountText.length).trim();
   if(!label)continue;
   if(values.some(other=>other!==value&&row!.contains(other)))throw Error("Ambiguous summary adjustment row.");
   return label;
  }
  throw Error("Unreadable summary adjustment row.");
 };
 const discounts:NonNullable<ReturnType<typeof inspectDollarAmount>>[]=[];
 const seen=new Set<string>();
 for(const value of values){
  const amount=inspectDollarAmount(textOf(value))!;
  if(amount.cents>=0)continue;
  const label=rowLabel(value);
  if(SHIPPING_CREDIT_LABEL.test(label)||GIFT_LABEL.test(label))continue;
  if(!follows(value,beforeTax))throw Error("Unsupported after-tax reduction.");
  const key=label.replace(/:$/,"").toLowerCase();
  if(seen.has(key))throw Error("Ambiguous summary adjustment.");
  seen.add(key);discounts.push(amount);
 }
 return discounts;
}

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
 const labels=(pattern:RegExp,scope:ParentNode=doc)=>{
  const matches=[...scope.querySelectorAll(SUMMARY_ELEMENTS)].filter(el=>pattern.test(textOf(el)));
  return matches.filter(el=>!matches.some(other=>other!==el&&el.contains(other)));
 };
 report("subtotal");const subtotalLabels=labels(/^(?:Item\(s\)|Items?)\s+Subtotal:?$/i);
 if(subtotalLabels.length!==1)throw Error("Ambiguous subtotal block.");
 report("total");const totalLabels=labels(/^Grand Total:?$/i);
 if(totalLabels.length!==1)throw Error("Ambiguous total block.");
 let shared:Element|null=subtotalLabels[0]!.parentElement;
 while(shared&&!shared.contains(totalLabels[0]!))shared=shared.parentElement;
 const summaryScope=shared??doc;
 const read=(stage:OrderReviewFailure,pattern:RegExp,optional=false,negative=false)=>{
  report(stage);
  const r=findLabeledAmount(summaryScope,pattern,negative);
  if(optional&&r.status==="label-not-found")return null;
  if(!r.amount)throw Error("Unreadable summary row.");return r.amount;
 };
 const subtotal=read("subtotal",/^(?:Item\(s\)|Items?)\s+Subtotal:?$/i)!;
 const shipping=read("shipping",/^Shipping\s*&\s*Handling:?$/i)!;
 const shippingCredit=read("shippingCredit",SHIPPING_CREDIT_LABEL,true,true);
 const fee=read("fee",/^Environmental\s+Handling\s+Fee:?$/i,true);
 const before=read("beforeTax",/^Total before tax:?$/i)!;
 const pst=read("pst",/^Estimated PST\s*\/\s*RST\s*\/\s*QST:?$/i)!;
 const gst=read("gst",/^Estimated GST\s*\/\s*HST:?$/i)!;
 const gift=read("gift",GIFT_LABEL,true,true);
 const total=read("total",/^Grand Total:?$/i)!;
 report("coupon");
 const beforeTaxLabel=labels(/^Total before tax:?$/i,summaryScope)[0]!;
 if(!follows(subtotalLabels[0]!,beforeTaxLabel)||!follows(beforeTaxLabel,totalLabels[0]!))throw Error("Unsupported summary row order.");
 const discounts=readPreTaxDiscounts(summaryScope,subtotalLabels[0]!,beforeTaxLabel,totalLabels[0]!);
 const discountSum=discounts.reduce((sum,amount)=>sum-BigInt(amount.cents),0n);
 if(discountSum>=BigInt(subtotal.cents))throw Error("Invalid before-tax discounts.");
 const couponCents=Number(discountSum);
 report("summary");
 const amounts=[subtotal,shipping,shippingCredit,...discounts,fee,before,pst,gst,gift,total].filter(v=>v!==null);
 if(amounts.some(v=>v.currency!==subtotal.currency)||subtotal.currency==="USD"||(gift&&gift.cents>0))throw Error("Unsupported currency or gift amount.");
 if(shippingCredit&&(shippingCredit.cents>0||-shippingCredit.cents>shipping.cents))throw Error("Invalid shipping credit.");
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
