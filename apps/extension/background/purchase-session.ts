import {browser} from 'wxt/browser';
import {getSettings} from '@/lib/settings';
import {orderKeyFromUrl} from '@/lib/order-context';
import type {PurchaseOrderSession,PurchaseSavedReceipt} from '@/lib/types';

// Receipts stay in background memory: no persisted receipt store, credentials,
// product titles or YNAB requests. Settings are read locally to scope the projection.
const sessions=new Map<string,{session:PurchaseOrderSession;transactions:Set<string>}>();
const key=(planId:string,url:string)=>{const order=orderKeyFromUrl(url);return order?`${planId}:${order}`:null;};
function entry(planId:string,url:string,total:number){
 const id=key(planId,url);if(!id)return null;let value=sessions.get(id);
 if(!value){value={session:{receipts:[],complete:false,orderTotalCents:total},transactions:new Set()};sessions.set(id,value);}
 return value;
}
export function purchaseSessionPending(planId:string,url:string,total:number,date:string,cents:number,state:'saving'|'uncertain'){
 const value=entry(planId,url,total);if(value)value.session.pending={state,date,totalCents:cents};
}
export function purchaseSessionSaved(planId:string,url:string,total:number,transactionId:string,receipt:PurchaseSavedReceipt,complete:boolean){
 const value=entry(planId,url,total);if(!value)return;
 if(!value.transactions.has(transactionId)){value.transactions.add(transactionId);value.session.receipts.push(structuredClone(receipt));}
 value.session.complete=complete;delete value.session.pending;
 // Bound completed receipts; never evict unresolved writes or partial progress.
 const completed=[...sessions].filter(([,v])=>v.session.complete&&!v.session.pending);
 for(const [id] of completed.slice(0,Math.max(0,completed.length-100)))sessions.delete(id);
}
export async function getPurchaseOrderSession(orderKey:unknown){
 const tabs=await browser.tabs.query({active:true,currentWindow:true});
 if(typeof orderKey!=='string'||tabs.length!==1||orderKeyFromUrl(tabs[0]?.url)!==orderKey)throw Error('Select the order tab.');
 const settings=await getSettings();if(!settings.planId||settings.planName!=='Test Plan')return null;
 return structuredClone(sessions.get(`${settings.planId}:${orderKey}`)?.session??null);
}
