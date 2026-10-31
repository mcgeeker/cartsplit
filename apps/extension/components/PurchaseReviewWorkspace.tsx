import {useEffect,useState} from 'react';
import {Button} from '@lineitem/ui';
import type {Category,PurchaseOrderSession} from '@/lib/types';
import {getPurchaseOrderSession} from '@/lib/messaging';
import {useActiveOrderContext} from './useActiveOrderContext';
import PurchaseReview from './PurchaseReview';
import AmazonTransactionsLink from './AmazonTransactionsLink';

/** Keep drafts mounted by order; completed receipts live in background session memory. */
export default function PurchaseReviewWorkspace({categories,onReviewStart}:{categories:Category[];onReviewStart?:()=>void}){
 const context=useActiveOrderContext();
 const [orders,setOrders]=useState<Record<string,{loaded:boolean;session:PurchaseOrderSession|null;error:boolean}>>(() => Object.create(null));
 const [revision,refresh]=useState(0);
 useEffect(()=>{
  const id=context.orderKey;if(!id||!context.ready)return;
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined;
  setOrders(old=>Object.hasOwn(old,id)?old:{...old,[id]:{loaded:false,session:null,error:false}});
  const read=async()=>{
   try{const result=await getPurchaseOrderSession(id);if(!alive)return;
    if(result.error)throw Error('Session unavailable.');
    setOrders(old=>({...old,[id]:{loaded:true,session:result.session??null,error:false}}));
    if(result.session?.pending?.state==='saving')timer=setTimeout(()=>void read(),1000);
   }catch{if(alive)setOrders(old=>({...old,[id]:{loaded:true,session:(Object.hasOwn(old,id)?old[id]?.session:null)??null,error:true}}));}
  };
  void read();return()=>{alive=false;if(timer)clearTimeout(timer);};
 },[context.orderKey,context.ready,revision]);
 const selected=context.orderKey&&Object.hasOwn(orders,context.orderKey)?orders[context.orderKey]:undefined;
 return <>
 {(!context.orderKey||!selected?.loaded||selected.error)&&<section aria-label="Purchase review" className="flex flex-col gap-3 rounded-control border border-line p-3">
 <h2 className="text-[17px] font-semibold">Purchase review</h2><AmazonTransactionsLink/>
 <Button disabled>Review selected order</Button>
 <p role="status" className="text-[13px] leading-relaxed text-muted">{!context.ready?'Checking the selected tab…':!context.orderKey?'Select an Amazon.ca order details page to continue.':selected?.error?'Could not read this order’s session. Check again before reviewing.':'Checking this order’s session…'}</p>
 {selected?.error&&<Button variant="secondary" onClick={()=>refresh(n=>n+1)}>Check order status again</Button>}
 </section>}
 {Object.entries(orders).map(([id,entry])=>entry.loaded?<div key={id} hidden={context.orderKey!==id||entry.error}>
 <PurchaseReview categories={categories} visible={context.orderKey===id&&!entry.error} interactive={context.ready} activeTabId={context.tabId} session={entry.session} onReviewStart={onReviewStart} onSessionChange={()=>refresh(n=>n+1)}/>
 </div>:null)}
 </>;
}
