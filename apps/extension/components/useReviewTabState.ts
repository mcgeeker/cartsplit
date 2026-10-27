import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { getPurchaseReviewTab } from "@/lib/messaging";
import type { ReviewTabState } from "@/background/purchase-approval";

export function useReviewTabState(id?:string):ReviewTabState {
 const [result,setResult]=useState<{id:string;state:ReviewTabState}|null>(null);
 useEffect(()=>{
  if(!id)return;
  let alive=true,revision=0;
  const check=async()=>{const run=++revision;try{const reply=await getPurchaseReviewTab(id);if(alive&&run===revision)setResult({id,state:reply.state});}catch{if(alive&&run===revision)setResult({id,state:"unavailable"});}};
  const changed=()=>{setResult({id,state:"unavailable"});void check();};
  browser.tabs.onActivated.addListener(changed);browser.tabs.onUpdated.addListener(changed);browser.tabs.onRemoved.addListener(changed);
  const timer=setInterval(()=>void check(),1000);void check();
  return()=>{alive=false;clearInterval(timer);browser.tabs.onActivated.removeListener(changed);browser.tabs.onUpdated.removeListener(changed);browser.tabs.onRemoved.removeListener(changed);};
 },[id]);
 return !id?"active":result?.id===id?result.state:"unavailable";
}
