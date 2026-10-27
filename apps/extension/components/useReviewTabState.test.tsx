// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {useReviewTabState} from './useReviewTabState';
import {getPurchaseReviewTab} from '@/lib/messaging';
const events=vi.hoisted(()=>({onActivated:{addListener:vi.fn(),removeListener:vi.fn()},onUpdated:{addListener:vi.fn(),removeListener:vi.fn()},onRemoved:{addListener:vi.fn(),removeListener:vi.fn()}}));
vi.mock('wxt/browser',()=>({browser:{tabs:events}}));
vi.mock('@/lib/messaging',()=>({getPurchaseReviewTab:vi.fn()}));
function Probe({id}:{id:string}){return <p>{useReviewTabState(id)}</p>;}
it('updates on tab events and ignores a late status belonging to an old review',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.clearAllMocks();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  vi.mocked(getPurchaseReviewTab).mockResolvedValue({state:'active'});
  await act(async()=>root.render(<Probe id="first"/>));expect(host.textContent).toBe('active');
  vi.mocked(getPurchaseReviewTab).mockResolvedValue({state:'away'});
  await act(async()=>events.onActivated.addListener.mock.calls[0]![0]());expect(host.textContent).toBe('away');
  vi.mocked(getPurchaseReviewTab).mockResolvedValue({state:'closed'});
  await act(async()=>events.onRemoved.addListener.mock.calls[0]![0]());expect(host.textContent).toBe('closed');
  let finish!:(reply:{state:'closed'})=>void;
  vi.mocked(getPurchaseReviewTab).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  await act(async()=>events.onUpdated.addListener.mock.calls[0]![0]());
  vi.mocked(getPurchaseReviewTab).mockResolvedValue({state:'active'});
  await act(async()=>root.render(<Probe id="second"/>));expect(host.textContent).toBe('active');
  await act(async()=>finish({state:'closed'}));expect(host.textContent).toBe('active');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();expect(events.onRemoved.removeListener).toHaveBeenCalledTimes(2);}
});
