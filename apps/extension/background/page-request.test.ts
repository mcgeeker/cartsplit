import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('wxt/browser', () => ({ browser: { tabs: { sendMessage: send } } }));
import { requestOrderPage, OrderPageRequestError } from './page-request';
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
const read = (signal = new AbortController().signal) => requestOrderPage(1,signal,'READ_CA_PREVIEW_PAYMENTS');
it('sends only the explicit read command and returns the untrusted reply for caller validation',async()=>{
 send.mockResolvedValue([{synthetic:true}]);expect(await read()).toEqual([{synthetic:true}]);
 expect(send).toHaveBeenCalledExactlyOnceWith(1,{type:'READ_CA_PREVIEW_PAYMENTS'});
});
it.each([false,true])('sanitizes rejected or thrown browser errors (synchronous=%s)',async synchronous=>{
 const error=Error('private-page-url test-only-secret');
 if(synchronous)send.mockImplementation(()=>{throw error;});else send.mockRejectedValue(error);
 const result=await read().catch(error=>error);
 expect(result).toBeInstanceOf(OrderPageRequestError);
 if(!(result instanceof OrderPageRequestError))throw Error('Expected a closed transport error.');
 expect(result.reason).toBe('unavailable');
 expect(result.message).not.toMatch(/private-page|test-only-secret/);
});
it.each([null,undefined])('distinguishes an empty response without retrying',async reply=>{
 send.mockResolvedValue(reply);await expect(read()).rejects.toMatchObject({reason:'empty'});expect(send).toHaveBeenCalledOnce();
});
it('times out once at ten seconds and ignores a late response',async()=>{
 let finish!:(value:unknown)=>void;send.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=read();const failed=expect(pending).rejects.toMatchObject({reason:'timeout'});
 await vi.advanceTimersByTimeAsync(10000);await failed;finish([]);await Promise.resolve();
 expect(send).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('cancels a pending request promptly and clears its timeout',async()=>{
 send.mockReturnValue(new Promise(()=>{}));const controller=new AbortController();
 const failed=expect(read(controller.signal)).rejects.toMatchObject({name:'AbortError'});
 controller.abort();await failed;expect(send).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('does not contact a tab for an already canceled request',()=>{
 const controller=new AbortController();controller.abort();
 expect(()=>read(controller.signal)).toThrow();expect(send).not.toHaveBeenCalled();
});
