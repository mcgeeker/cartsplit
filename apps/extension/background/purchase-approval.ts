import {purchaseSessionPending,purchaseSessionSaved} from "./purchase-session";
import {splitChargeAllocation} from "@/lib/split-charge-allocation";
import {adjustmentIsDistributed} from "@/lib/adjustment-allocation";
import type {AdjustmentPolicy,SplitChargeSelection} from "@/lib/types";
import {OrderReviewError} from "@/lib/order-review-status";
import {purchasePreparationStage,PurchasePreparationError} from "@/lib/purchase-preparation-status";
import type {PurchasePreparationStage} from "@/lib/purchase-preparation-status";
import { suggestPurchaseCategories, rememberPurchaseCategories } from "./purchase-learning";
import { DISTRIBUTE_EQUALLY, DISTRIBUTE_EQUALLY_LABEL, distributeAdjustmentShares } from "@/lib/adjustment-distribution";
import {browser} from "wxt/browser";
import type {OrderReviewBinding} from "./order-review";
import {selectedPurchaseAdapter} from "@/retailers/review-registry";
import {getSettings} from "@/lib/settings";
import {getReviewedTarget,getCategories,writeReviewedSplit} from "@/lib/ynab";
import {resolveReviewAllocation} from "@/lib/review-allocation";
import type {PurchaseApprovalPreview} from "@/lib/types";
let revision=0;
let active:{id:string|null;controller:AbortController;writing:boolean}|null=null;
type Snapshot=Awaited<ReturnType<typeof read>>;
const reviews=new Map<string,{id:string;expiresAt:number;snapshot:Snapshot;splitLock?:string}>();
let pending:{id:string;reviewId:string;expiresAt:number;snapshot:Snapshot;target:Awaited<ReturnType<typeof getReviewedTarget>>;confirmations:boolean[];choices:{id:string;name:string}[];split?:SplitChargeSelection;adjustments?:AdjustmentPolicy[];lines:Awaited<ReturnType<typeof chosenLines>>}|null=null;
// Sticky per background lifetime: a sent write can never be retried here, even
// when transport/response verification fails. Reload is not proof of rollback.
const attempted=new Set<string>();
let reopening=false;
export type ReviewTabState="active"|"away"|"closed"|"changed"|"expired"|"unavailable";
export async function purchaseReviewTabState(id:unknown):Promise<ReviewTabState>{
 const source=typeof id==="string"?reviews.get(id):undefined;
 if(typeof id!=="string"||!source||source.id!==id||source.expiresAt<=Date.now())return "expired";
 try{
  const tabs=await browser.tabs.query({});
  const tab=tabs.find(t=>t.id===source.snapshot.binding.detail.id);
  if(reviews.get(source.id)!==source)return "expired";
  if(!tab)return "closed";
  if(tab.url!==source.snapshot.binding.detail.url)return "changed";
  const current=await browser.tabs.query({active:true,currentWindow:true});
  if(reviews.get(source.id)!==source)return "expired";
  return current.length===1&&current[0]!.id===tab.id?"active":"away";
 }catch{return "unavailable";}
}
export async function reopenPurchaseReviewTab(id:unknown){
 if(reopening||active)throw Error("Review is busy.");
 const source=typeof id==="string"?reviews.get(id):undefined;if(!source||source.id!==id)throw Error("Review expired.");
 reopening=true;
 try{
  if(await purchaseReviewTabState(id)!=="closed"||reviews.get(source.id)!==source)throw Error("Review tab is not closed.");
  await browser.tabs.create({url:source.snapshot.binding.detail.url,active:true});
  if(reviews.get(source.id)===source)invalidatePurchaseApproval(source.id);
 }finally{reopening=false;}
}
export class PurchaseWriteUncertainError extends Error{constructor(){super("Write result unconfirmed. Inspect YNAB. Do not retry or reload to retry.");}}
/** Starting another order cancels an active operation/grant, retaining other drafts. */
export function beginPurchaseReview(){pending=null;if(!active?.writing){revision++;active?.controller.abort();}return revision;}
export function invalidatePurchaseApproval(id?:unknown,preserveReview=false){
 if(preserveReview&&active?.writing)return revision; // Navigation never interrupts an approved save.
 if(id!==undefined&&!reviews.has(id as string)&&pending?.id!==id&&pending?.reviewId!==id&&active?.id!==id)return revision;
 if(id===undefined){if(!preserveReview)reviews.clear();pending=null;revision++;active?.controller.abort();}
 else {
  if(!preserveReview)reviews.delete(id as string);
  if(pending?.id===id||pending?.reviewId===id)pending=null;
  if(active?.id===id){revision++;active.controller.abort();}
 }
 return revision;
}
async function read(signal:AbortSignal,validateTarget=false){let binding:OrderReviewBinding|undefined;const view=await selectedPurchaseAdapter.review(true,signal,b=>{binding=b;},validateTarget);signal.throwIfAborted();if(!binding)throw Error("Review binding missing.");return{binding,view};}
/** Recheck the original tabs, selected tab and local connection after awaits. */
async function context(b:OrderReviewBinding,signal:AbortSignal){
 const d=await browser.tabs.get(b.detail.id);signal.throwIfAborted();const p=await browser.tabs.get(b.payments.id);signal.throwIfAborted();const s=await getSettings();signal.throwIfAborted();
 const selected=await browser.tabs.query({active:true,currentWindow:true});signal.throwIfAborted();
 if(selected.length!==1||selected[0]!.id!==b.detail.id)throw Error("Select the reviewed order tab.");
 if(d.url!==b.detail.url||p.url!==b.payments.url||s.accessToken!==b.connection.accessToken||s.planId!==b.connection.planId||s.planName!==b.connection.planName)throw Error("Review connection or page changed.");
}
/** One review operation owns cancellation. Navigation preserves in-flight writes;
 * explicit disconnect still aborts them and reports uncertainty after send. */
async function operation<T>(id:string|null,signal:AbortSignal,run:(s:AbortSignal,check:()=>void)=>Promise<T>,writing=false){
 signal.throwIfAborted();const version=revision;const op={id,controller:new AbortController(),writing};active=op;const abort=()=>op.controller.abort();signal.addEventListener('abort',abort,{once:true});
 const check=()=>{signal.throwIfAborted();op.controller.signal.throwIfAborted();if(version!==revision)throw Error("Review canceled.");};
 try{check();return await run(op.controller.signal,check);}finally{signal.removeEventListener('abort',abort);if(active===op)active=null;}
}
/** Eligibility may change after a saved shipment; every other field stays bound. */
function snapshotIdentity(snapshot:Snapshot){const copy=structuredClone(snapshot);for(const c of copy.view.matchedCharges??[])delete c.eligible;return JSON.stringify(copy);}
function payment(snapshot:Snapshot,split?:SplitChargeSelection){
 const charges=snapshot.view.matchedCharges;
 if(charges){const selected=charges[split?.chargeIndex??-1];if(!selected)throw Error("Select a charge to prepare.");if(selected.eligible===false)throw Error("This charge is already categorized or split. Preserve it.");return selected;}
 if(split)throw Error("Unexpected split-charge selection.");
 return {date:snapshot.binding.paymentDate,cents:snapshot.view.totalCents};
}
function allocationKey(confirmations:boolean[],choices:{id:string;name:string}[],split:SplitChargeSelection,adjustments?:AdjustmentPolicy[]){return JSON.stringify({confirmations,choices,assignments:split.assignments,adjustments});}
/** Recompute cents from fresh order data and resolve exact current category IDs.
 * Neither sidebar amounts nor suggestion confidence authorize a financial write. */
async function chosenLines(snapshot:Snapshot,confirmations:boolean[],choices:{id:string;name:string}[],signal:AbortSignal,split?:SplitChargeSelection,adjustments?:AdjustmentPolicy[]){
 const allocated=resolveReviewAllocation(snapshot.view,confirmations,adjustments);
 if(!Array.isArray(choices)||choices.length!==allocated.length)throw Error("Choose a category for every item and adjustment.");
 const shares=snapshot.view.matchedCharges?splitChargeAllocation(allocated,snapshot.view.matchedCharges,split!,adjustments!==undefined)[split!.chargeIndex]!:null;
 const distributed=adjustments?allocated:distributeAdjustmentShares(allocated,snapshot.view.items.length,choices.map(c=>c?.id));
 let categories:Awaited<ReturnType<typeof getCategories>>;try{categories=await getCategories(snapshot.binding.connection.planId!,signal);}catch{signal.throwIfAborted();throw new PurchasePreparationError("categories");}signal.throwIfAborted();
 const result=new Map<string,{categoryId:string;categoryName:string;amountMilliunits:number;memo:null}>();
 for(const [i,c] of choices.entries()){
  if(adjustments&&i>=snapshot.view.items.length&&adjustmentIsDistributed(allocated[i]!.kind,adjustments)){if(c?.id!==""||c?.name!=="")throw Error("Invalid distribution choice.");continue;}
  if(!c||typeof c.id!=="string"||!/^[\w-]+$/.test(c.id)||typeof c.name!=="string")throw Error("Invalid category.");
  if(c.id===DISTRIBUTE_EQUALLY){if(adjustments)throw Error("Invalid distribution choice.");if(shares)throw Error("Assign split-shipment adjustments to a charge and category.");if(i<snapshot.view.items.length||c.name!==DISTRIBUTE_EQUALLY_LABEL)throw Error("Invalid distribution choice.");continue;}
  const matches=categories.filter(a=>a.id===c.id);if(matches.length!==1||matches[0]!.name!==c.name)throw Error("A selected category changed. Refresh categories.");
  const cents=shares?.[i]??distributed[i]!.cardCents;const prior=result.get(c.id);
  if(prior)prior.amountMilliunits-=cents*10;else result.set(c.id,{categoryId:c.id,categoryName:c.name,amountMilliunits:-cents*10,memo:null});
 }
 const lines=[...result.values()].filter(l=>l.amountMilliunits<0);if(lines.some(l=>!Number.isSafeInteger(l.amountMilliunits)))throw Error("Unsafe split total.");return lines;
}
export async function startPurchaseReview(confirmed:unknown,signal:AbortSignal,expectedRevision?:number){
 if(expectedRevision!==undefined&&expectedRevision!==revision)throw Error("Queued review canceled.");
 beginPurchaseReview();if(confirmed!==true)throw Error("Confirm this purchase.");
 return operation(null,signal,async(s,check)=>{const snapshot=await read(s,true);check();const id=crypto.randomUUID();let suggestions:Awaited<ReturnType<typeof suggestPurchaseCategories>>=snapshot.view.items.map(()=>({categoryId:null,source:null}));
   try{const categories=await getCategories(snapshot.binding.connection.planId!,s);check();suggestions=await suggestPurchaseCategories(snapshot.binding.connection.planId!,snapshot.binding.identity.map(i=>i.productId),categories,s,snapshot.view.items.map(i=>i.title));}catch{check();}
   check();for(const [key,r] of reviews)if(r.expiresAt<=Date.now()||r.snapshot.binding.detail.url===snapshot.binding.detail.url&&r.snapshot.binding.connection.planId===snapshot.binding.connection.planId)reviews.delete(key);reviews.set(id,{id,expiresAt:Date.now()+600000,snapshot:structuredClone(snapshot)});return{...snapshot.view,items:snapshot.view.items.map((item,i)=>({...item,suggestedCategoryId:suggestions[i]?.categoryId??null,suggestionSource:suggestions[i]?.source??null})),reviewId:id};});
}
export async function preparePurchaseApproval(id:unknown,lineTotals:unknown,choices:unknown,confirmed:unknown,signal:AbortSignal,split?:SplitChargeSelection,adjustments?:AdjustmentPolicy[]):Promise<PurchaseApprovalPreview>{
 const source=typeof id==="string"?reviews.get(id):undefined;pending=null;

 if(confirmed!==true||typeof id!=="string"||!source||source.id!==id||source.expiresAt<=Date.now()||!Array.isArray(lineTotals)||lineTotals.length!==source.snapshot.view.items.length||lineTotals.some(v=>typeof v!=="boolean")||!Array.isArray(choices))throw Error("Review expired or choices incomplete.");
 if(source.splitLock&&(!split||source.splitLock!==allocationKey(lineTotals as boolean[],choices as {id:string;name:string}[],split,adjustments)))throw Error("Charge allocation changed after saving.");
 return operation(id,signal,async(s,check)=>{
  let fresh:Snapshot;try{fresh=await read(s);}catch(error){if(error instanceof OrderReviewError)throw error;s.throwIfAborted();throw new PurchasePreparationError("read");}check();if(snapshotIdentity(fresh)!==snapshotIdentity(source.snapshot)||source.expiresAt<=Date.now())throw Error("Order changed. Review again.");
  const confirmations=lineTotals as boolean[],selected=choices as {id:string;name:string}[];
  const lines=await chosenLines(fresh,confirmations,selected,s,split,adjustments);check();
  const charge=payment(fresh,split),b=fresh.binding;let target:Awaited<ReturnType<typeof getReviewedTarget>>;let stage:PurchasePreparationStage="target";
  try{target=await getReviewedTarget(b.connection.planId!,charge.date,charge.cents,s,value=>{stage=purchasePreparationStage(value)??stage;});}catch(error){s.throwIfAborted();if(error instanceof Error&&["The target is incomplete or reconciled.","The matching transaction is already split.","The matching transaction already has a category."].includes(error.message))throw error;throw new PurchasePreparationError(stage);}check();
  if(target.planName!==b.connection.planName)throw new PurchasePreparationError("context");
  const key=`${b.connection.planId}:${target.transactionId}`;if(attempted.has(key))throw Error("This transaction was already attempted. Inspect YNAB; do not retry.");
  await context(b,s);check();if(source.expiresAt<=Date.now())throw Error("Review expired.");const approvalId=crypto.randomUUID(),expiresAt=Date.now()+300000;
  pending={id:approvalId,reviewId:source.id,expiresAt,snapshot:structuredClone(fresh),target:structuredClone(target),confirmations:structuredClone(confirmations),choices:structuredClone(selected),...(split?{split:structuredClone(split)}:{}),...(adjustments?{adjustments:structuredClone(adjustments)}:{}),lines:structuredClone(lines)};
  return{approvalId,expiresAt,destination:{planName:target.planName,accountName:target.accountName},paymentDate:charge.date,date:target.date,totalCents:charge.cents,lines:lines.map(l=>({categoryName:l.categoryName,cents:-l.amountMilliunits/10}))};
 });
}
export async function applyPurchaseApproval(id:unknown,confirmed:unknown,signal:AbortSignal){
 signal.throwIfAborted();const grant=pending;
 if(confirmed!==true||typeof id!=="string"||!grant||grant.id!==id||grant.expiresAt<=Date.now())throw Error("Approve an unused, unexpired proposal first.");
 pending=null; // Consume before awaiting anything.
 return operation(id,signal,async(s,check)=>{
  const b=grant.snapshot.binding,key=`${b.connection.planId}:${grant.target.transactionId}`;
  const checkGrant=(token?:string)=>{check();if(grant.expiresAt<=Date.now()||attempted.has(key)||(token!==undefined&&token!==b.connection.accessToken))throw Error("Approval expired, changed or already used.");};
  let sent=false;
  try{
   checkGrant();await context(b,s);checkGrant();const fresh=await read(s);checkGrant();if(snapshotIdentity(fresh)!==snapshotIdentity(grant.snapshot))throw Error("Order changed.");
   const lines=await chosenLines(fresh,grant.confirmations,grant.choices,s,grant.split,grant.adjustments);checkGrant();if(JSON.stringify(lines)!==JSON.stringify(grant.lines))throw Error("Category allocation changed.");
   const charge=payment(fresh,grant.split);
   const target=await getReviewedTarget(b.connection.planId!,charge.date,charge.cents,s);checkGrant();if(JSON.stringify(target)!==JSON.stringify(grant.target))throw Error("Target transaction changed.");
   await writeReviewedSplit(b.connection.planId!,target,lines,s,token=>{checkGrant(token);attempted.add(key);sent=true;purchaseSessionPending(b.connection.planId!,b.detail.url,grant.snapshot.view.totalCents,target.date,charge.cents,"saving");},async()=>{await context(b,s);checkGrant();});
   const source=reviews.get(grant.reviewId);
   if(grant.split&&source){
    source.splitLock=allocationKey(grant.confirmations,grant.choices,grant.split,grant.adjustments);
    source.expiresAt=Date.now()+600000;
    source.snapshot.view.matchedCharges![grant.split.chargeIndex]!.eligible=false;
   }else reviews.delete(grant.reviewId);
   // A confirmed remote save remains successful even if the optional local commit fails.
   let learningSaved=false;
   try{check();await context(b,s);check();const selectedProducts=b.identity.map((item,i)=>({item,index:i})).filter(({index})=>!grant.split||fresh.view.items.length===1||grant.split.assignments[index]===grant.split.chargeIndex);
   // Conflicting choices for a repeated product remove its mapping rather than
   // teaching an unsaved payment's choice. Include only conflicts with saved products.
   const learned=b.identity.map((item,index)=>({item,index})).filter(({item,index})=>selectedProducts.some(saved=>saved.index===index||saved.item.productId===item.productId&&grant.choices[saved.index]!.id!==grant.choices[index]!.id));
   await rememberPurchaseCategories(b.connection.planId!,learned.map(({item})=>item.productId),learned.map(({index})=>grant.choices[index]!),s,learned.map(({index})=>grant.snapshot.view.items[index]!.title));learningSaved=true;}catch{/* No retry of the financial write. */}
   const complete=!grant.split||fresh.view.matchedCharges!.every((c,i)=>c.eligible===false||i===grant.split!.chargeIndex);
   purchaseSessionSaved(b.connection.planId!,b.detail.url,fresh.view.totalCents,target.transactionId,{destination:{planName:target.planName,accountName:target.accountName},date:target.date,totalCents:charge.cents,lines:lines.map(l=>({categoryName:l.categoryName,cents:-l.amountMilliunits/10})),learningSaved},complete);
   return {learningSaved,...(grant.split?{savedChargeIndex:grant.split.chargeIndex}:{})};
  }catch(error){if(sent){reviews.delete(grant.reviewId);purchaseSessionPending(b.connection.planId!,b.detail.url,grant.snapshot.view.totalCents,grant.target.date,-grant.target.amount/10,"uncertain");throw new PurchaseWriteUncertainError();}throw error;}
 },true);
}
