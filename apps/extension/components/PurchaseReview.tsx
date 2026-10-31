import PurchaseReceipt from "./PurchaseReceipt";
import MemoEditor from "./MemoEditor";
import InfoDisclosure from "./InfoDisclosure";
import { productMemo, suggestTransactionMemo, validMemo } from "@/lib/purchase-memos";
import CategoryOptions from "./CategoryOptions";
import {useRevealScroll,scrollExpandedDetails} from "./useRevealScroll";
import {splitChargeAllocation} from "@/lib/split-charge-allocation";
import {reviewProductTotals} from "@/lib/review-product-totals";
import { useReviewTabState } from "./useReviewTabState";
import AdjustmentControls from "./AdjustmentControls";
import {AdjustmentAllocationError,adjustmentIsDistributed,defaultAdjustmentPolicies} from "@/lib/adjustment-allocation";
import { useActiveOrderTab } from "./useActiveOrderTab";
import AmazonTransactionsLink from "./AmazonTransactionsLink";
import {orderReviewFailureText,paymentDiagnosticText} from "@/lib/order-review-status";
import { resolveReviewAllocation } from "@/lib/review-allocation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@lineitem/ui";
import { suspendPurchaseReview,reopenPurchaseReviewTab,preparePurchaseChanges,applyPurchaseChanges,cancelPurchaseChanges,reviewCanadianPurchase } from "@/lib/messaging";
import type { AdjustmentPolicy, Category, PurchaseOrderSession, PurchaseSavedReceipt, PurchaseApprovalPreview, PurchaseReview as Review } from "@/lib/types";
const cad=(n:number)=>`CAD ${(n/100).toFixed(2)}`;
export default function PurchaseReview({categories,visible=true,interactive=true,session=null,onSessionChange,onReviewStart,activeTabId}:{categories:Category[];visible?:boolean;interactive?:boolean;session?:PurchaseOrderSession|null;onSessionChange?:()=>void;onReviewStart?:()=>void;activeTabId?:number|null}){
 const[receipts,setReceipts]=useState<PurchaseSavedReceipt[]>([]),[finished,setFinished]=useState(false);
 const activeOrder = useActiveOrderTab(visible&&!finished&&!session?.complete&&!session?.pending);
 const[busy,setBusy]=useState(false);
 const[review,setReview]=useState<Review|null>(null),[error,setError]=useState<string|null>(null),[choices,setChoices]=useState<string[]>([]);
 const singleItem=review?.items.length===1;
 const[assignments,setAssignments]=useState<string[]>([]),[selectedCharge,setSelectedCharge]=useState(""),[splitLocked,setSplitLocked]=useState(false);
 const[transactionMemos,setTransactionMemos]=useState<string[]>([]),[lineMemos,setLineMemos]=useState<string[]>([]);
 const[lineTotals,setLineTotals]=useState<boolean[]>([]);
 const[adjustments,setAdjustments]=useState<AdjustmentPolicy[]>([]);
 let allocationError:string|null=null;
 let allocation:ReturnType<typeof resolveReviewAllocation>|null=null;
 if(review)try{allocation=resolveReviewAllocation(review,lineTotals,adjustments);}catch(e){if(e instanceof AdjustmentAllocationError)allocationError=e.message;}
 // Preview the same math with explicitly provisional line totals. This never
 // satisfies the confirmation gate used by prepare() or the background.
 let estimate=allocation;
 if(review&&!estimate)try{estimate=resolveReviewAllocation(review,review.items.map(()=>true),adjustments);}catch(e){if(e instanceof AdjustmentAllocationError)allocationError=e.message;}
 let productTotals:number[]|null=null;if(review)try{productTotals=reviewProductTotals(review);}catch{}
 const orderEstimate=estimate;
 let splitPreview:number[][]|null=null;
 if(review?.matchedCharges&&estimate)try{splitPreview=splitChargeAllocation(estimate,review.matchedCharges,{chargeIndex:selectedCharge===""?0:Number(selectedCharge),assignments:singleItem?[]:estimate.map((_,i)=>assignments[i]?Number(assignments[i]):assignments[i]==="0"?0:-1)},true);}catch{}
 const displayEstimate=review?.matchedCharges&&!singleItem?(splitPreview&&orderEstimate?orderEstimate.map((line,i)=>({...line,cardCents:(assignments[i]!==""&&assignments[i]!==undefined?splitPreview![Number(assignments[i])]![i]!:0)})):null):orderEstimate;
 const memoIndex=review?.matchedCharges?Number(selectedCharge||0):0;
 const memoDraft=review?.orderId&&allocation?{transaction:transactionMemos[memoIndex]??"",lines:allocation.map((_,i)=>lineMemos[i]??"")}:undefined;
 const memoInvalid=!!review?.orderId&&(!validMemo(transactionMemos[memoIndex]??"")||lineMemos.some(value=>!validMemo(value)));
 const activeLineCount=(review?.matchedCharges?splitPreview?.[memoIndex]:estimate?.map(line=>line.cardCents))?.filter(cents=>cents>0).length??0;
 const[proposal,setProposal]=useState<PurchaseApprovalPreview|null>(null),[policy,setPolicy]=useState(false),[approved,setApproved]=useState(false),[locked,setLocked]=useState(false),[status,setStatus]=useState<string|null>(null);
 const tabState=useReviewTabState(visible&&(!locked||busy)?review?.reviewId:undefined);
 const tabActive=visible&&interactive&&tabState==="active";
 const[preparing,setPreparing]=useState(false),[prepareError,setPrepareError]=useState<string|null>(null);
 const proposalStart=useRevealScroll<HTMLElement>(visible&&(proposal?.approvalId));
 const prepareErrorStart=useRevealScroll<HTMLParagraphElement>(visible&&(prepareError));
 const resultStart=useRevealScroll<HTMLParagraphElement>(visible&&!busy&&status!=="Approval expired. Prepare again."?status:null);
 const grant=useRef<string|undefined>(undefined),reviewRef=useRef<string|undefined>(undefined);
 const reading=useRef(false);
 const generation=useRef(0);
 const revoke=(id?:string)=>{if(id)void cancelPurchaseChanges(id).catch(()=>{});};
 function clearProposal(keepPolicy=false){revoke(grant.current);grant.current=undefined;setProposal(null);setApproved(false);if(!keepPolicy)setPolicy(false);setPrepareError(null);setStatus(null);}
 useEffect(()=>()=>{generation.current++;if(reading.current)void cancelPurchaseChanges().catch(()=>{});else revoke(grant.current??reviewRef.current);},[]);
 const wasVisible=useRef(visible),previousTab=useRef(activeTabId);
 useEffect(()=>{
  const leaving=wasVisible.current&&(!visible||previousTab.current!==activeTabId);wasVisible.current=visible;previousTab.current=activeTabId;
  if(!leaving||locked)return; // Never cancel or retry an in-flight write on navigation.
  generation.current++;
  if(reading.current||preparing)void suspendPurchaseReview(reviewRef.current).catch(()=>{});
  else revoke(grant.current);
  reading.current=false;grant.current=undefined;
  setProposal(null);setApproved(false);setPolicy(false);setBusy(false);setPreparing(false);setPrepareError(null);
 },[visible,locked,preparing,activeTabId]);
 function cancelReview(){
  generation.current++;
  void cancelPurchaseChanges(grant.current??reviewRef.current).catch(()=>{});
  reading.current=false;grant.current=undefined;reviewRef.current=undefined;
  setAssignments([]);setSelectedCharge("");setSplitLocked(false);setAdjustments([]);
  setTransactionMemos([]);setLineMemos([]);
  setProposal(null);setReview(null);setChoices([]);setLineTotals([]);setPolicy(false);setApproved(false);
  setBusy(false);setPreparing(false);setError(null);setPrepareError(null);
  setStatus(locked?"Result unconfirmed. Inspect YNAB; do not retry or reload to retry.":"Review canceled. No transaction changed.");
 }
 useEffect(()=>{if(!proposal)return;const timer=setTimeout(()=>{revoke(proposal.approvalId);grant.current=undefined;setProposal(null);setApproved(false);setStatus("Approval expired. Prepare again.");},Math.max(0,proposal.expiresAt-Date.now()));return()=>clearTimeout(timer);},[proposal]);
 async function prepare(){if(!tabActive||busy||locked||memoInvalid||(!singleItem&&!policy)||!allocation||!review?.reviewId)return;const run=++generation.current;clearProposal(true);setBusy(true);setPreparing(true);setError(null);
 try{const selected=allocation.map((_,i)=>i>=review.items.length&&adjustmentIsDistributed(allocation[i]!.kind,adjustments)?{id:"",name:""}:categories.find(c=>c.id===choices[i]));if(selected.some(c=>!c))throw Error("Choose categories.");
 const split=review.matchedCharges?{chargeIndex:Number(selectedCharge),assignments:singleItem?[]:allocation.map((_,i)=>assignments[i]!==""&&assignments[i]!==undefined?Number(assignments[i]):-1)}:undefined;
 if(split&&(!splitPreview||selectedCharge===""))throw Error("Assign charges.");
 const selectedCategories=selected.map(c=>({id:c!.id,name:c!.name}));
 const r=await (memoDraft?preparePurchaseChanges(review.reviewId,lineTotals,selectedCategories,true,split,adjustments,memoDraft):preparePurchaseChanges(review.reviewId,lineTotals,selectedCategories,true,split,adjustments));
 if(run!==generation.current){revoke(r.preview?.approvalId);return;}if(r.preview&&!r.error){grant.current=r.preview.approvalId;setProposal(r.preview);setPolicy(true);}else setPrepareError(r.error??"Preparation stopped.");
 }catch{if(run===generation.current)setPrepareError("Could not prepare changes. Refresh categories or review again.");}finally{if(run===generation.current){setBusy(false);setPreparing(false);}}}
 async function apply(){if(!tabActive||busy||locked||!approved||!proposal||proposal.expiresAt<=Date.now())return;const run=++generation.current;setBusy(true);setLocked(true);setApproved(false);setError(null);
 try{const r=await applyPurchaseChanges(proposal.approvalId,true);if(run!==generation.current)return;
 if(r.ok){setReceipts(current=>[...current,{destination:proposal.destination,date:proposal.date,totalCents:proposal.totalCents,...(proposal.memo!==undefined?{memo:proposal.memo}:{}),lines:structuredClone(proposal.lines),learningSaved:r.learningSaved!==false}]);setFinished(!review?.matchedCharges||r.savedChargeIndex!==undefined&&review.matchedCharges.every((c,i)=>c.eligible===false||i===r.savedChargeIndex));}
 onSessionChange?.();setStatus(r.ok&&r.learningSaved===false?"Changes saved; YNAB’s response matches. Local category learning did not complete. Do not retry the save.":r.ok?"Changes saved; YNAB’s response matches. Inspect the transaction in YNAB.":r.uncertain?"Write result unconfirmed. Inspect YNAB. Do not retry or reload to retry.":r.error??"Changes were not sent.");
 if(r.ok&&r.savedChargeIndex!==undefined&&review?.matchedCharges){const saved=r.savedChargeIndex;setReview(current=>current?{...current,matchedCharges:current.matchedCharges?.map((c,i)=>i===saved?{...c,eligible:false}:c)}:current);setSplitLocked(true);const next=review.matchedCharges.findIndex((c,i)=>i!==saved&&c.eligible!==false);setSelectedCharge(next<0?"":String(next));setPolicy(false);setLocked(false);setStatus((next<0?"All payments in this order are categorized. Inspect the results in YNAB.":"Charge saved and verified. Inspect it in YNAB, then select the next uncategorized charge. Each charge needs separate approval.")+(r.learningSaved===false?" Local learning did not complete. Do not save this charge again.":""));}
 }
 catch{onSessionChange?.();if(run===generation.current)setStatus("Write result unconfirmed. Inspect YNAB. Do not retry or reload to retry.");}
 finally{if(run===generation.current){grant.current=undefined;setProposal(null);setBusy(false);}}}

 async function reopen(){
  if(busy||locked||!review?.reviewId)return;
  const version=++generation.current;setBusy(true);setError(null);
  try{const r=await reopenPurchaseReviewTab(review.reviewId);if(version!==generation.current)return;
   if(r.ok){cancelReview();setStatus("Order tab reopened. Review the order again before preparing changes.");}else setError(r.error??"Could not reopen the order tab.");
  }catch{if(version===generation.current)setError("Could not reopen the order tab.");}
  finally{if(version===generation.current)setBusy(false);}
 }
 async function run(){if(busy||locked||!activeOrder||!visible||!interactive)return;onReviewStart?.();clearProposal();revoke(reviewRef.current);reviewRef.current=undefined;const version=++generation.current;reading.current=true;setBusy(true);setReview(null);setError(null);setChoices([]);setAssignments([]);setSelectedCharge("");setSplitLocked(false);setAdjustments([]);
 try{const r=await reviewCanadianPurchase(true);if(version!==generation.current){revoke(r.review?.reviewId);return;}if(r.review&&!r.error){setReview(r.review);setTransactionMemos(r.review.matchedCharges?r.review.matchedCharges.map(charge=>suggestTransactionMemo(r.review!,charge.memo??null)):[suggestTransactionMemo(r.review,r.review.transactionMemo??null)]);setLineMemos([...r.review.items.map(productMemo),...(r.review.items.length>1&&r.review.summary?.feeCents?["Environmental handling fee"]:[]),...(r.review.items.length>1&&r.review.summary?.shippingCents?["Shipping & handling"]:[])]);setAdjustments(r.review.items.length===1?[]:defaultAdjustmentPolicies(r.review));reviewRef.current=r.review.reviewId;setChoices([...r.review.items.map(item=>categories.some(c=>c.id===item.suggestedCategoryId)?item.suggestedCategoryId!:""),"",""]);setLineTotals(r.review.items.map(()=>false));setAssignments(Array(r.review.items.length+2).fill(""));const first=r.review.matchedCharges?.findIndex(c=>c.eligible!==false)??-1;setSelectedCharge(first<0?"":String(first));}else setError((orderReviewFailureText(r.reason)??"Order review stopped. No private error details were returned.")+(paymentDiagnosticText(r.paymentDiagnostic)?` ${paymentDiagnosticText(r.paymentDiagnostic)}`:""));}
 catch{if(version===generation.current)setError("Order review did not complete.");}finally{if(version===generation.current){reading.current=false;setBusy(false);}}}
 const lineMemoEditor=(i:number)=>review?.orderId&&!singleItem?<MemoEditor collapsible label={`Memo for line ${i+1}`} value={lineMemos[i]??""} disabled={busy||locked||!!review.matchedCharges&&assignments[i]!==String(memoIndex)} onChange={value=>{clearProposal(true);setLineMemos(current=>current.map((memo,index)=>index===i?value:memo));}}/>:null;
 const chargePicker=(i:number,label:string)=>review?.matchedCharges?<label className="flex min-w-0 flex-col gap-1 font-semibold">Payment<select aria-label={`Payment for ${label}`} className="w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 py-2 font-normal text-text" value={assignments[i]??""} disabled={busy||locked||splitLocked} onChange={e=>{clearProposal();setAssignments(current=>current.map((v,n)=>n===i?e.target.value:v));}}><option value="">Choose payment…</option>{review.matchedCharges.map((charge,index)=><option key={index} value={index}>{charge.date} · {cad(charge.cents)}</option>)}</select></label>:null;
 const combined=[...(session?.receipts??[]),...receipts].filter((r,i,all)=>all.findIndex(a=>a.date===r.date&&a.totalCents===r.totalCents)===i);
 const pending=session?.pending&&!receipts.some(r=>r.date===session.pending!.date&&r.totalCents===session.pending!.totalCents)?session.pending:undefined;
 const receiptSession:PurchaseOrderSession={receipts:combined,complete:finished||session?.complete===true,orderTotalCents:review?.totalCents??session?.orderTotalCents??0};
 if(pending)return <section aria-label="Purchase review" className="space-y-3 rounded-control border border-line p-3"><h2 className="text-[17px] font-semibold">{pending.state==='saving'?'Saving this order':'Result unconfirmed'}</h2><p role="status">{pending.state==='saving'?'A previously approved save is still being checked. Switching tabs will not retry it.':'Inspect this payment in YNAB. Do not retry or reload to retry.'}</p><p>{pending.date} · {cad(pending.totalCents)}</p>{combined.length>0&&<PurchaseReceipt session={{...receiptSession,complete:false}} visible={visible}/>}</section>;
 if(receiptSession.complete)return <PurchaseReceipt session={receiptSession} visible={visible}/>;
 return <section aria-label="Purchase review" className="flex flex-col gap-3 rounded-control border border-line p-3">
 {review?<InfoDisclosure label="Purchase review" heading={<h2 className="text-[17px] font-semibold text-text">Purchase review</h2>}>
 {singleItem?<p>The single product’s category receives the full card payment after all order adjustments. Multiple units in this product row use the same category. Item/subtotal, funding and matching-transaction checks still run. For multiple payments, each payment stays separate and needs its own approval. Product category suggestions stay editable and are remembered locally only after a verified save.</p>:<> <p>Item totals account for displayed quantities only when the complete order subtotal identifies one unambiguous interpretation of unit versus total prices. Confirmed item prices must add up to Amazon’s subtotal. Your original transaction total stays unchanged. After a verified save, product categories are remembered locally for this YNAB Plan. Suggestions use your saved choice first, then similar confirmed products, then local model comparison with category and group names. Weak or ambiguous matches need manual choices. All suggestions are editable guesses. Product vectors stay in this Firefox profile; product names and category names are processed locally. The existing model downloads on first use and may take time to initialize.</p>
 {review.matchedCharges&&<p>Confirm the whole-row payment assignments. Each payment’s exact card total is divided among its assigned rows using the adjusted card-funded values as weights. The adjustment amounts below are order-level estimates; a payment’s fixed amount takes precedence over those weights. Charge-specific tax, gift credit and coupon attribution are not established by Amazon’s order total. This is an explicit estimate, not a guessed shipment breakdown. Quantities within one product row cannot be divided between payments in this view. After saving the first payment, assignments, categories and adjustment choices are fixed for the remaining payments in this review.</p>}
 <p>Fees and net shipping default to equal distribution; coupons and gift funding default to distribution by item value. Choose all items, selected items, or a separate category for positive charges. Coupons reduce item cost before tax. Tax is estimated by adjusted pre-tax value; gift funding then reduces gross shares. A reduction cannot exceed an item’s available value. Leftover cents go by largest remainder, with displayed order breaking ties. Free Shipping offsets shipping before these controls; it is never counted twice. Adjustment choices are not learned as product categories.</p></>}

 </InfoDisclosure>:<h2 className="text-[17px] font-semibold">Purchase review</h2>}
 <AmazonTransactionsLink />
 {combined.length>0&&<PurchaseReceipt session={receiptSession} visible={visible}/>}
 {!review&&<Button disabled={busy||locked||!activeOrder||!visible||!interactive} onClick={run}>Review selected order</Button>}
 {!review&&!activeOrder&&<p role="status" className="text-[13px] font-normal leading-relaxed text-muted">Open an Amazon.ca order details page in a new tab, then select that tab.</p>}
 {busy&&!preparing&&<p role="status">{locked?"Saving approved changes. Cancel cannot undo a request already sent; inspect YNAB if the result is unconfirmed.":"Checking the Amazon payment and matching YNAB transaction, then preparing category suggestions…"}</p>}{error&&<p role="alert">{error} No transaction changed.</p>}
 {review&&(!locked||busy)&&!tabActive&&<div role="status" className="rounded-control border border-line p-3 text-[13px] leading-relaxed">
 <p>{tabState==="closed"?"Tab closed":tabState==="away"?"This review belongs to another tab. Switch back to the reviewed order tab to continue.":tabState==="changed"?"The reviewed tab now shows a different page. Cancel this review and review the correct order.":tabState==="expired"?"This review expired. Cancel it and review the order again.":"Checking the reviewed order tab…"}</p>
 {tabState==="closed"&&<Button sm className="mt-2" disabled={busy||locked} onClick={reopen}>Reopen tab</Button>}
 </div>}
 {review?.matchedCharges&&<div className="mt-1 space-y-3 text-[13px] leading-relaxed">
 <h3 className="font-semibold text-text">Split-shipment charges matched</h3>
 <p className="text-muted">{review.matchedCharges.length} Amazon charges linked to this order match separate transactions in {review.planName??"the selected YNAB plan"}.</p>
 <dl className="space-y-2">{review.matchedCharges.map((charge,i)=><div key={i} className="flex flex-wrap justify-between gap-x-3"><dt className="text-muted">{charge.date}{charge.eligible===false?" · Already categorized — preserved":""}</dt><dd className="font-medium tabular-nums">{cad(charge.cents)}</dd></div>)}</dl>
 <p className="flex justify-between border-t border-line pt-2 font-semibold"><span>Order card total</span><span className="tabular-nums">{cad(review.totalCents)}</span></p>
 <InfoDisclosure label="Payment and category guidance">{singleItem?"This order has one product. Each payment goes to its category, including all quantities and adjustments. Prepare and approve one uncategorized payment at a time; saved payments stay preserved.":"Choose a payment and category for each item below. Each product row includes all its units. Payment totals stay fixed; shares within each payment use the adjusted item values. Adjustments change estimates only within each payment; they never move money between payments. Prepare and approve one uncategorized payment at a time; existing categorized charges are preserved."}</InfoDisclosure>
 </div>}
 {review&&<fieldset disabled={!tabActive||busy||locked} className={`min-w-0 ${!tabActive?"opacity-50":""}`}>
 <p className="text-[13px] text-muted">{review.items.length} {review.items.length===1?"item":"items"} detected.</p>
 <p className="mt-1 text-[18px] font-bold">Card payment {cad(review.totalCents)}</p>
 {singleItem&&<InfoDisclosure label="Category guidance">Choose this item’s category. The full card payment includes tax, fees, shipping, discounts and gift funding. No distribution is needed.</InfoDisclosure>}
 {review.summary&&<details onToggle={scrollExpandedDetails} className="mt-2 scroll-mt-3 text-[13px]">
 <summary className="cursor-pointer font-semibold text-muted">Charge breakdown</summary>
 <dl className="mt-2 space-y-1 pl-3">
 {[
  ["Subtotal",cad(review.summary.subtotalCents)],
  ...(review.summary.couponCents?[["Discounts",`−${cad(review.summary.couponCents)}`]]:[]),
  ...(review.summary.shippingCreditCents?[["Shipping charge",cad(review.summary.shippingChargeCents!)],["Free Shipping credit",`−${cad(review.summary.shippingCreditCents)}`]]:[]),
  [review.summary.shippingCreditCents?"Net shipping":"Shipping",cad(review.summary.shippingCents)],
  ["Environmental fee",cad(review.summary.feeCents)],
  ["Tax",cad(review.summary.taxCents)],
  ["Gift credit",review.summary.giftCents?`−${cad(review.summary.giftCents)}`:cad(0)],
 ].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-x-3"><dt>{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}
 </dl></details>}
 {!singleItem&&<AdjustmentControls review={review} policies={adjustments} disabled={busy||locked||splitLocked} onChange={next=>{clearProposal();setAdjustments(next);}}/>}
 {allocationError&&<p role="alert" className="mt-3 text-[13px] leading-relaxed">{allocationError}</p>}
 <ol className={`mt-4 min-w-0 space-y-5 ${singleItem?"list-none pl-0":"list-decimal pl-5 marker:font-semibold"}`}>
 {review.items.map((item,i)=><li key={i} className="min-w-0 pl-1">
 <strong title={item.title} tabIndex={0} className="block truncate font-bold">{item.title}</strong>
 <div className="ml-2 mt-2 flex min-w-0 flex-col gap-2 text-[13px]">
 {singleItem&&item.quantity!=null&&item.quantity>1&&<p className="text-muted">Quantity: {item.quantity}</p>}
 {!singleItem&&<div className="space-y-1 text-muted"><p>Quantity: {item.quantity??"not shown"}</p>
 {item.priceCents!==undefined&&<p>Displayed price: {cad(item.priceCents)}</p>}
 {productTotals&&item.quantity!==1&&<p>Item total: {cad(productTotals[i]!)}{productTotals[i]!==item.priceCents?` (${item.quantity} × ${cad(item.priceCents!)})`:""}</p>}
 {estimate?.[i]?.feeCents?<p>Estimated added charges: {cad(estimate[i]!.feeCents)}</p>:null}
 {estimate?.[i]?.giftCardCents?<p>Estimated gift-funded share: {cad(estimate[i]!.giftCardCents)}</p>:null}
 {estimate?.[i]?.couponCents? <p>Estimated discount share: −{cad(estimate[i]!.couponCents)}</p>:null}
 <p>Estimated card share: {displayEstimate?cad(displayEstimate[i]!.cardCents):review.matchedCharges?"assign every item to a payment first":"unavailable — order amounts need review"}</p></div>}
 {!singleItem&&item.quantity!==1&&<label className="flex items-start gap-2 leading-relaxed"><input className="mt-1 shrink-0" type="checkbox" checked={lineTotals[i]??false} disabled={busy||locked||splitLocked} onChange={e=>{clearProposal();setLineTotals(p=>p.map((v,n)=>n===i?e.target.checked:v));}}/> Total price confirmed{productTotals?` (${cad(productTotals[i]!)})`:""}.</label>}
 <p className="text-muted">{item.suggestedCategoryId&&choices[i]===item.suggestedCategoryId?(item.suggestionSource==="history"?"Suggested from similar products you previously categorized.":item.suggestionSource==="model"?"Suggested by the local model from your category names. Check this guess.":"Suggested from your saved choice for this product."):""}</p>
 {!singleItem&&chargePicker(i,`item ${i+1}`)}
 <label className="flex min-w-0 flex-col gap-1 font-semibold"><span className={singleItem?undefined:"sr-only"}>{singleItem?"Category":`Category for item ${i+1}`}</span><select className="w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 py-2 font-normal text-text" value={choices[i]??""} disabled={busy||locked||splitLocked} onChange={e=>{clearProposal();setChoices(p=>p.map((v,n)=>n===i?e.target.value:v));}}><CategoryOptions categories={categories}/></select></label>
 {lineMemoEditor(i)}
 </div></li>)}
 {estimate?.slice(review.items.length).map((line,n)=>{const i=review.items.length+n;if(adjustmentIsDistributed(line.kind,adjustments))return null;return <li key={line.kind} className="min-w-0 pl-1">
 <strong className="block truncate font-bold" title={line.title}>{line.title}</strong>
 <div className="ml-2 mt-2 flex min-w-0 flex-col gap-2 text-[13px]">
 <div className="space-y-1 text-muted"><p>Amount: {cad(line.itemCents)}</p><p>Estimated card share: {displayEstimate?cad(displayEstimate[i]!.cardCents):"assign payments first"}</p></div>
 {chargePicker(i,line.title.toLowerCase())}
 <label className="flex min-w-0 flex-col gap-1 font-semibold"><span className="sr-only">Category for {line.title.toLowerCase()}</span><select className="w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 py-2 font-normal text-text" value={choices[i]??""} disabled={busy||locked||splitLocked} onChange={e=>{clearProposal();setChoices(p=>p.map((v,j)=>j===i?e.target.value:v));}}><CategoryOptions categories={categories}/></select></label>
 {lineMemoEditor(i)}
 </div></li>;})}
 </ol>

 <div className="mt-4 space-y-2 border-t border-line pt-3 text-[13px] font-normal leading-relaxed text-muted">
 {allocation&&<p className="font-semibold text-text">{singleItem?"Category total":"Estimated split total"} {cad(allocation.reduce((n,l)=>n+l.cardCents,0))}.</p>}
 {!locked&&<p role="status">{!allocation
  ? allocationError??(singleItem?"The item price and quantity could not be reconciled with Amazon’s subtotal. Check the order details and review again.":review.items.some((item,i)=>item.quantity!==1&&!lineTotals[i])
    ? "Confirm each item’s total price before preparing the split."
    : "The confirmed prices don’t add up to Amazon’s subtotal. Check the item prices before continuing.")
  : review.matchedCharges&&!splitPreview?singleItem?"The payment totals do not reconcile with this order. Cancel review and read the order again.":"Assign every item and additional charge to a payment, with at least one row per payment."
  : allocation.some((line,i)=>!choices[i]&&(i<review.items.length||!adjustmentIsDistributed(line.kind,adjustments)))
    ? allocation.length>review.items.length?"Choose a category for each item and additional charge.":singleItem?"Choose a category for this item.":"Choose a category for each item."
    : singleItem?"This payment is ready to review.":"Your split is ready to review."}</p>}

 </div>
 {review.matchedCharges&&<label className="mt-3 flex flex-col gap-1 text-[13px] font-semibold">Payment to prepare<select aria-label="Payment to prepare" className="rounded-control border border-line-strong bg-surface px-2 py-2 font-normal" value={selectedCharge} disabled={busy||locked} onChange={e=>{clearProposal();setSelectedCharge(e.target.value);}}><option value="">Choose uncategorized payment…</option>{review.matchedCharges.map((charge,i)=><option key={i} value={i} disabled={charge.eligible===false}>{charge.date} · {cad(charge.cents)}{charge.eligible===false?" · Preserved":""}</option>)}</select></label>}
 {review.orderId&&<div className="mt-4 space-y-2 border-t border-line pt-3">
 <p className="whitespace-pre-wrap break-words text-[13px] text-muted">Existing transaction memo: {(review.matchedCharges?review.matchedCharges[memoIndex]?.memo:review.transactionMemo)||"(empty)"}</p>
 <MemoEditor label="Transaction memo" value={transactionMemos[memoIndex]??""} disabled={busy||locked||!!review.matchedCharges&&(selectedCharge===""||review.matchedCharges[memoIndex]?.eligible===false)} onChange={value=>{clearProposal(true);setTransactionMemos(current=>current.map((memo,index)=>index===memoIndex?value:memo));}}/>
 {activeLineCount===1&&<InfoDisclosure label="One-line payment memo">This payment uses one category line. Its memo is the transaction memo above.</InfoDisclosure>}
 {memoInvalid&&<p role="alert">Shorten each memo to 500 characters before preparing changes.</p>}
 </div>}
 {allocation&&!locked&&<>{!singleItem&&<label className="mt-2 flex items-start gap-2 text-[13px] font-normal leading-relaxed text-muted"><input type="checkbox" checked={policy} disabled={busy} onChange={e=>{clearProposal();setPolicy(e.target.checked);}}/> {review.matchedCharges?"I confirm these whole-row payment assignments and the proportional estimate within each payment. Each original payment total stays unchanged.":"I accept these displayed line totals, adjustment destinations and distribution methods, and the estimated tax allocation."}</label>}
 <Button disabled={busy||memoInvalid||(!singleItem&&!policy)||!review.reviewId||allocation.some((line,i)=>!choices[i]&&(i<review.items.length||!adjustmentIsDistributed(line.kind,adjustments)))||!!review.matchedCharges&&(!splitPreview||selectedCharge===""||review.matchedCharges[Number(selectedCharge)]?.eligible===false||!review.matchedCharges[Number(selectedCharge)])} onClick={prepare}>{preparing?"Preparing changes…":review.matchedCharges?"Prepare selected payment":"Prepare changes"}</Button>
 {preparing&&<p role="status">Validating the current order, categories and YNAB transaction…</p>}
 {prepareError&&<p ref={prepareErrorStart} className="scroll-mt-3" role="alert">{prepareError} No transaction changed.</p>}</>}
 {proposal&&<section ref={proposalStart} aria-label="Prepared changes" className="mt-4 scroll-mt-3 flex min-w-0 flex-col gap-3 border-t border-line pt-3 text-[13px] font-normal leading-relaxed">
 <h3 className="font-semibold text-text">Prepared changes</h3>
 <div className="space-y-1 text-muted">
 <p className="font-semibold text-text">Current transaction</p>
 <p>Uncategorized outflow · {cad(proposal.totalCents)}</p>
 <p>{proposal.destination?`${proposal.destination.planName} → ${proposal.destination.accountName}`:"Selected YNAB plan"}</p>
 <p>YNAB date: {proposal.date}</p>
 {proposal.memo!==undefined&&<p className="whitespace-pre-wrap break-words">Proposed transaction memo: {proposal.memo||"(empty)"}</p>}
 {proposal.paymentDate&&proposal.paymentDate!==proposal.date&&<p>Amazon payment date: {proposal.paymentDate} · Within the 2-day matching allowance. Your YNAB date stays unchanged.</p>}
 </div>
 <div className="space-y-2">
 <p className="font-semibold text-text">{singleItem?"Proposed category":"Proposed categories"}</p>
 <dl className="space-y-2 text-muted">{proposal.lines.map((l,i)=><div key={i} className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1"><dt className="min-w-0 break-words">{l.categoryName}</dt><dd className="shrink-0 font-medium tabular-nums text-text">{cad(l.cents)}</dd>{l.memo!==undefined&&<dd className="w-full whitespace-pre-wrap break-words">Line memo: {l.memo||"(empty)"}</dd>}</div>)}</dl>
 <p className="flex flex-wrap justify-between gap-x-3 border-t border-line pt-2 font-semibold text-text"><span>Total</span><span className="tabular-nums">{cad(proposal.totalCents)}</span></p>
 </div>
 <p className="text-muted">Approval expires in five minutes.</p>
 <label className="flex items-start gap-2 text-muted"><input className="mt-1 shrink-0" type="checkbox" checked={approved} disabled={busy||locked} onChange={e=>setApproved(e.target.checked)}/><span>I approve this displayed change in {proposal.destination?.planName??"the selected YNAB plan"} and remembering these product categories locally.</span></label>
 <Button disabled={busy||locked||!approved} onClick={apply}>Save approved changes once</Button>
 </section>}

 </fieldset>}
 {(busy||(review&&!locked))&&<Button variant="secondary" onClick={cancelReview}>Cancel review</Button>}
 {status&&<p ref={resultStart} className="scroll-mt-3" role="status">{status}</p>}</section>;
}
