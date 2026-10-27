import {useEffect,useState} from 'react';
import {browser} from 'wxt/browser';
import {orderKeyFromUrl} from '@/lib/order-context';
export function useActiveOrderContext(){
 const [context,setContext]=useState<{orderKey:string|null;tabId:number|null;ready:boolean}>({orderKey:null,tabId:null,ready:false});
 useEffect(()=>{
  let alive=true,revision=0;
  const check=async()=>{const version=++revision;
   try{const tabs=await browser.tabs.query({active:true,currentWindow:true});const tab=tabs.length===1?tabs[0]:undefined;
    if(alive&&version===revision){const next={orderKey:orderKeyFromUrl(tab?.url),tabId:tab?.id??null,ready:true};setContext(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);}
   }catch{if(alive&&version===revision)setContext({orderKey:null,tabId:null,ready:true});}
  };
  const changed=()=>{setContext(old=>({...old,ready:false}));void check();};
  browser.tabs.onActivated.addListener(changed);browser.tabs.onUpdated.addListener(changed);browser.tabs.onRemoved.addListener(changed);
  const timer=setInterval(()=>void check(),1000);void check();
  return()=>{alive=false;clearInterval(timer);browser.tabs.onActivated.removeListener(changed);browser.tabs.onUpdated.removeListener(changed);browser.tabs.onRemoved.removeListener(changed);};
 },[]);
 return context;
}
