/** Metadata only. Ignore tracking parameters, fragments and tab identity. */
export function orderKeyFromUrl(value?:string):string|null{
 try{
  const url=new URL(value??'');
  if(url.origin!=='https://www.amazon.ca'||url.username||url.password||!/^\/your-orders\/order-details\/?$/.test(url.pathname))return null;
  const ids=[...url.searchParams].filter(([key])=>key.toLowerCase()==='orderid').map(([,id])=>id);
  return ids.length===1&&/^[\w-]{1,80}$/.test(ids[0]!)?ids[0]!:null;
 }catch{return null;}
}
