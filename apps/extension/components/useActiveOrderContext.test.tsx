// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {useActiveOrderContext} from './useActiveOrderContext';
import {orderKeyFromUrl} from '@/lib/order-context';
const api=vi.hoisted(()=>({query:vi.fn(),onActivated:{addListener:vi.fn(),removeListener:vi.fn()},onUpdated:{addListener:vi.fn(),removeListener:vi.fn()},onRemoved:{addListener:vi.fn(),removeListener:vi.fn()}}));
vi.mock('wxt/browser',()=>({browser:{tabs:api}}));
const url=(id:string)=>`https://www.amazon.ca/your-orders/order-details?orderID=${id}`;
function Probe(){return <output>{JSON.stringify(useActiveOrderContext())}</output>;}
it('tracks distinct orders within one tab and ignores stale asynchronous metadata responses',async()=>{
 vi.resetAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  api.query.mockResolvedValue([{id:1,url:url('first')}]);await act(async()=>root.render(<Probe/>));expect(host.textContent).toContain('"orderKey":"first"');
  let finish!:(tabs:{id:number;url:string}[])=>void;api.query.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  await act(async()=>api.onUpdated.addListener.mock.calls[0]![0]());expect(host.textContent).toContain('"ready":false');
  api.query.mockResolvedValue([{id:1,url:url('second')}]);await act(async()=>api.onActivated.addListener.mock.calls[0]![0]());
  await act(async()=>finish([{id:1,url:url('old')} ]));expect(host.textContent).toContain('"orderKey":"second"');
  api.query.mockResolvedValue([{id:2,url:'https://app.ynab.com/'}]);await act(async()=>api.onActivated.addListener.mock.calls[0]![0]());expect(host.textContent).toContain('"orderKey":null');
  expect(api.query.mock.calls.every(([query])=>query.active===true&&query.currentWindow===true)).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();expect(api.onUpdated.removeListener).toHaveBeenCalledOnce();}
});
it('recognizes the same order across tracking parameters and rejects missing, duplicate or foreign identities',()=>{
 expect(orderKeyFromUrl(`${url('first')}&ref=synthetic#section`)).toBe('first');expect(orderKeyFromUrl('https://www.amazon.ca/your-orders/order-details/?orderId=first')).toBe('first');
 for(const value of [url(''),url('first')+'&orderID=second','https://www.amazon.com/your-orders/order-details?orderID=first','https://www.amazon.ca/your-orders/order-details-extra?orderID=first','https://someone@www.amazon.ca/your-orders/order-details?orderID=first',url('%2Fother'),undefined])expect(orderKeyFromUrl(value)).toBeNull();
});
