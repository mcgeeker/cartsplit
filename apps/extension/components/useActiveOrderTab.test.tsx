// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useActiveOrderTab } from "./useActiveOrderTab";
const api = vi.hoisted(() => ({ query: vi.fn(), onActivated: { addListener: vi.fn(), removeListener: vi.fn() }, onUpdated: { addListener: vi.fn(), removeListener: vi.fn() }, onRemoved: { addListener: vi.fn(), removeListener: vi.fn() } }));
vi.mock("wxt/browser", () => ({ browser: { tabs: api } }));
function Probe() { return <button disabled={!useActiveOrderTab()}>Review</button>; }
it('enables only for the active Canadian order-details tab and follows activation/navigation', async () => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.resetAllMocks();
 api.query.mockResolvedValue([{url:'https://www.amazon.ca/cpe/yourpayments/transactions'}]);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(<Probe/>));expect(host.querySelector('button')!.disabled).toBe(true);
  api.query.mockResolvedValue([{url:'https://www.amazon.ca/your-orders/order-details?orderID=synthetic'}]);
  await act(async()=>api.onActivated.addListener.mock.calls[0]![0]());expect(host.querySelector('button')!.disabled).toBe(false);
  for(const url of ['https://www.amazon.com/your-orders/order-details','https://www.amazon.ca/your-orders/order-details-extra','https://www.amazon.ca/ap/signin']) {
   api.query.mockResolvedValue([{url}]);await act(async()=>api.onUpdated.addListener.mock.calls[0]![0]());expect(host.querySelector('button')!.disabled).toBe(true);
  }
  api.query.mockRejectedValue(new Error('private URL'));await act(async()=>api.onRemoved.addListener.mock.calls[0]![0]());expect(host.querySelector('button')!.disabled).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();expect(api.onActivated.removeListener).toHaveBeenCalledOnce();}
});
