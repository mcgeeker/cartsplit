// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import OrderLookup from "./OrderLookup";
const api=vi.hoisted(()=>({sendMessage:vi.fn()}));
vi.mock("wxt/browser",()=>({browser:{runtime:api}}));
const lookup={state:'paused',pages:50,message:'Search paused. Continue to check more payment pages.',candidates:[]};
let root:Root,host:HTMLDivElement;
beforeEach(()=>{
  vi.resetAllMocks();vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  api.sendMessage.mockResolvedValue({lookup});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
it.each(['invalid','rejected'])('recovers from a %s status read and clears the stale error',async mode=>{
  if(mode==='invalid')api.sendMessage.mockResolvedValueOnce({error:'Lookup could not continue.'});
  else api.sendMessage.mockRejectedValueOnce(new Error('private browser error'));
  await act(async()=>root.render(<OrderLookup/>));
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Could not read lookup status');
  expect(host.textContent).not.toContain('Checking lookup status');
  expect(host.textContent).not.toContain('private browser error');
  await act(async()=>vi.advanceTimersByTimeAsync(500));
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(host.querySelector('[role=status]')?.textContent).toBe(lookup.message);
  expect(api.sendMessage).toHaveBeenCalledWith({type:'LOOKUP_STATUS'});
});
it('keeps a failed lookup action visible when status polling succeeds',async()=>{
  await act(async()=>root.render(<OrderLookup/>));
  api.sendMessage.mockResolvedValueOnce({error:'Could not resume. Start again from YNAB.'});
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Continue')!.click());
  await act(async()=>vi.advanceTimersByTimeAsync(500));
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Could not resume');
  expect(api.sendMessage).toHaveBeenCalledWith({type:'LOOKUP_CONTINUE'});
});
it('renders sidebar progress only after a register lookup starts',async()=>{
 api.sendMessage.mockResolvedValueOnce({lookup:{...lookup,state:'idle'}});
 await act(async()=>root.render(<OrderLookup embedded/>));expect(host.textContent).toBe('');
 await act(async()=>vi.advanceTimersByTimeAsync(500));
 expect(host.querySelector('section[aria-label="Find Amazon order"]')).not.toBeNull();
 expect(host.querySelector('main')).toBeNull();expect(host.textContent).toContain('50 payment pages checked');
});
it('hides a dismissed completed lookup and shows the next lookup without remounting',async()=>{
 api.sendMessage.mockResolvedValueOnce({lookup:{...lookup,state:'opened',dismissed:true}});
 await act(async()=>root.render(<OrderLookup embedded/>)); expect(host.textContent).toBe('');
 await act(async()=>vi.advanceTimersByTimeAsync(500));
 expect(host.textContent).toContain('Find Amazon order');expect(host.textContent).toContain('50 payment pages checked');
});
