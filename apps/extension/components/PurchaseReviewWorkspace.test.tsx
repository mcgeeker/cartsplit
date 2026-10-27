// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
import Workspace from './PurchaseReviewWorkspace';
import {applyPurchaseChanges,cancelPurchaseChanges,getPurchaseOrderSession,preparePurchaseChanges,reviewCanadianPurchase,suspendPurchaseReview} from '@/lib/messaging';
import type {PurchaseOrderSession} from '@/lib/types';
const context=vi.hoisted(()=>({orderKey:'first' as string|null,tabId:1,ready:true}));
vi.mock('./useActiveOrderContext',()=>({useActiveOrderContext:()=>({...context})}));
vi.mock('./useActiveOrderTab',()=>({useActiveOrderTab:()=>true}));
vi.mock('./useReviewTabState',()=>({useReviewTabState:()=>'active'}));
vi.mock('./AmazonTransactionsLink',()=>({default:()=>null}));
vi.mock('@/lib/messaging',()=>({getPurchaseOrderSession:vi.fn(),reviewCanadianPurchase:vi.fn(),preparePurchaseChanges:vi.fn(),applyPurchaseChanges:vi.fn(),cancelPurchaseChanges:vi.fn(async()=>{}),suspendPurchaseReview:vi.fn(async()=>{}),reopenPurchaseReviewTab:vi.fn()}));
const categories=[{id:'cat',name:'Synthetic category',groupName:'Test'}];
const sessions=new Map<string,PurchaseOrderSession>();
const receipt={date:'2026-01-01',totalCents:1000,lines:[{categoryName:'Synthetic category',cents:1000}],learningSaved:true};
const completed:PurchaseOrderSession={receipts:[receipt],orderTotalCents:1000,complete:true};
const review=(id:string)=>({reviewId:id,items:[{title:`Synthetic ${id}`,priceCents:1000,quantity:1,cardCents:null,suggestedCategoryId:'cat'}],totalCents:1000,summary:{subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0}});
beforeEach(()=>{
 vi.clearAllMocks();sessions.clear();Object.assign(context,{orderKey:'first',tabId:1,ready:true});
 vi.mocked(getPurchaseOrderSession).mockImplementation(async key=>({session:structuredClone(sessions.get(key)??null)}));
 vi.mocked(reviewCanadianPurchase).mockImplementation(async()=>({review:review(context.orderKey!)}));
 vi.mocked(preparePurchaseChanges).mockImplementation(async id=>({preview:{...receipt,approvalId:`approval-${id}`,expiresAt:Date.now()+300000}}));
 vi.mocked(applyPurchaseChanges).mockImplementation(async id=>{sessions.set(id.replace('approval-',''),structuredClone(completed));return {ok:true,learningSaved:true};});
});
async function screen(){
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
 const render=async()=>{await act(async()=>root.render(<Workspace categories={categories}/>));};await render();
 const elements=<T extends Element>(selector:string)=>[...host.querySelectorAll<T>(selector)].filter(e=>!e.closest('[hidden]'));
 const click=async(label:string)=>{const button=elements<HTMLButtonElement>('button').find(b=>b.textContent===label);expect(button,`Missing ${label}`).toBeDefined();expect(button!.disabled).toBe(false);await act(async()=>button!.click());};
 const select=async(label:string,value:string)=>{const element=elements<HTMLSelectElement>(`select[aria-label="${label}"]`)[0]!;await act(async()=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));});};
 const consent=async()=>{const input=elements<HTMLInputElement>('input').at(-1);if(input)await act(async()=>input.click());};
 const start=async()=>{await click('Review selected order');};
 const prepare=async()=>{await consent();await click('Prepare changes');};
 const save=async()=>{await consent();await click('Save approved changes once');};
 const move=async(id:string|null,tabId=context.tabId)=>{Object.assign(context,{orderKey:id,tabId});await render();};
 const text=()=>elements<HTMLElement>('section').map(e=>e.textContent).join(' ');
 const remount=async()=>{await act(async()=>root.unmount());root=createRoot(host);await render();};
 const close=async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();};
 return {host,elements,click,select,consent,start,prepare,save,move,text,remount,close};
}
it('shows a fresh review for other orders and a read-only receipt on return, including sidebar reopening',async()=>{
 const s=await screen();try{
  await s.start();await s.prepare();await s.save();expect(s.text()).toContain('Saved to YNAB');expect(s.elements('select')).toHaveLength(0);
  await s.move('second',2);expect(s.text()).not.toContain('Saved to YNAB');await s.start();expect(s.text()).toContain('Synthetic second');
  await s.move('first',1);expect(s.text()).toContain('CAD 10.00');expect(s.text()).toContain('Saved to YNAB');expect(s.elements('button')).toHaveLength(0);
  await s.move('third',1);expect(s.text()).not.toContain('Saved to YNAB');expect(s.elements<HTMLButtonElement>('button')[0]!.disabled).toBe(false);
  await s.move(null,5);expect(s.text()).toContain('Select an Amazon.ca order details page');expect(s.elements<HTMLButtonElement>('button')[0]!.disabled).toBe(true);
  await s.move('first',9);await s.remount();expect(s.text()).toContain('Saved to YNAB');expect(s.elements('button')).toHaveLength(0);
  expect(reviewCanadianPurchase).toHaveBeenCalledTimes(2);expect(applyPurchaseChanges).toHaveBeenCalledExactlyOnceWith('approval-first',true);
 }finally{await s.close();}
});
it('preserves drafts but revokes prepared approval and final consent when leaving an order',async()=>{
 const s=await screen();try{
  await s.start();await s.prepare();await s.consent();expect(s.text()).toContain('Prepared changes');
  await s.move('second',2);expect(cancelPurchaseChanges).toHaveBeenCalledWith('approval-first');await s.start();
  await s.move('first',1);expect(s.text()).toContain('Synthetic first');expect(s.text()).not.toContain('Prepared changes');
  expect(s.elements<HTMLSelectElement>('select')[0]!.value).toBe('cat');expect(s.elements('input')).toHaveLength(0);
  expect(s.elements<HTMLButtonElement>('button').find(b=>b.textContent==='Prepare changes')!.disabled).toBe(false);
  expect(reviewCanadianPurchase).toHaveBeenCalledTimes(2);expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await s.close();}
});
it('keeps an in-flight save attached to its order while navigating and never cancels or retries it',async()=>{
 let finish!:(r:{ok:true;learningSaved:true})=>void;vi.mocked(applyPurchaseChanges).mockImplementationOnce(async()=>new Promise(resolve=>{finish=resolve;}));
 const s=await screen();try{
  await s.start();await s.prepare();await s.save();sessions.set('first',{receipts:[],complete:false,orderTotalCents:1000,pending:{state:'saving',date:receipt.date,totalCents:1000}});
  await s.move('second',2);expect(s.elements<HTMLButtonElement>('button')[0]!.disabled).toBe(false);expect(cancelPurchaseChanges).not.toHaveBeenCalled();expect(suspendPurchaseReview).not.toHaveBeenCalled();
  await s.move('first',1);expect(s.text()).toContain('Saving this order');
  sessions.set('first',structuredClone(completed));await act(async()=>finish({ok:true,learningSaved:true}));
  expect(s.text()).toContain('Saved to YNAB');expect(applyPurchaseChanges).toHaveBeenCalledOnce();
 }finally{await s.close();}
});
it('retains an unconfirmed warning across navigation and sidebar reopening while allowing another order',async()=>{
 vi.mocked(applyPurchaseChanges).mockImplementationOnce(async()=>{sessions.set('first',{receipts:[],complete:false,orderTotalCents:1000,pending:{state:'uncertain',date:receipt.date,totalCents:1000}});return {error:'Write result unconfirmed.',uncertain:true};});
 const s=await screen();try{
  await s.start();await s.prepare();await s.save();expect(s.text()).toContain('Result unconfirmed');expect(s.elements('button')).toHaveLength(0);
  await s.move('second',2);expect(s.elements<HTMLButtonElement>('button')[0]!.disabled).toBe(false);await s.start();
  await s.move('first',1);expect(s.text()).toContain('Do not retry or reload to retry');await s.remount();expect(s.text()).toContain('Result unconfirmed');expect(s.elements('button')).toHaveLength(0);
  expect(applyPurchaseChanges).toHaveBeenCalledOnce();
 }finally{await s.close();}
});
it('restores partial split progress and still requires separate approval for the remaining payment',async()=>{
 vi.mocked(reviewCanadianPurchase).mockImplementation(async()=>({review:context.orderKey==='first'?{...review('first'),items:[...review('first').items,{...review('first').items[0]!,title:'Synthetic other'}],totalCents:2000,summary:{...review('first').summary,subtotalCents:2000},matchedCharges:[{date:'2026-01-01',cents:1000,eligible:true},{date:'2026-01-02',cents:1000,eligible:true}]}:review(context.orderKey!)}));
 vi.mocked(applyPurchaseChanges).mockImplementation(async()=>{sessions.set('first',{receipts:[receipt],complete:false,orderTotalCents:2000});return {ok:true,learningSaved:true,savedChargeIndex:0};});
 const s=await screen();try{
  await s.start();await s.select('Payment for item 1','0');await s.select('Payment for item 2','1');await s.consent();await s.click('Prepare selected payment');await s.save();
  expect(s.text()).toContain('Saved payments');await s.move('second',2);await s.start();await s.move('first',1);
  expect(s.text()).toContain('Already categorized — preserved');expect(s.elements<HTMLSelectElement>('select[aria-label="Payment to prepare"]')[0]!.value).toBe('1');
  expect(s.elements<HTMLSelectElement>('select[aria-label="Payment for item 1"]')[0]!.disabled).toBe(true);expect(s.elements<HTMLInputElement>('input')[0]!.checked).toBe(false);
  await s.consent();await s.click('Prepare selected payment');expect(preparePurchaseChanges).toHaveBeenCalledTimes(2);expect(vi.mocked(preparePurchaseChanges).mock.calls.at(-1)![4]).toEqual({chargeIndex:1,assignments:[0,1]});expect(applyPurchaseChanges).toHaveBeenCalledOnce();
 }finally{await s.close();}
});

it('discards a late initial review after navigation without disturbing another order’s draft',async()=>{
 let finish!:(r:{review:ReturnType<typeof review>})=>void;vi.mocked(reviewCanadianPurchase).mockImplementationOnce(async()=>new Promise(resolve=>{finish=resolve;}));
 const s=await screen();try{
  await s.start();await s.move('second',2);expect(suspendPurchaseReview).toHaveBeenCalledWith(undefined);await s.start();expect(s.text()).toContain('Synthetic second');
  await act(async()=>finish({review:review('first')}));expect(cancelPurchaseChanges).toHaveBeenCalledWith('first');expect(s.text()).toContain('Synthetic second');
  await s.move('first',1);expect(s.text()).not.toContain('Synthetic first');expect(s.elements<HTMLButtonElement>('button')[0]!.disabled).toBe(false);expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await s.close();}
});
it('cancels preparation on navigation while preserving choices and ignoring the late approval',async()=>{
 let finish!:(r:{preview:{approvalId:string;expiresAt:number;date:string;totalCents:number;lines:{categoryName:string;cents:number}[]}})=>void;
 vi.mocked(preparePurchaseChanges).mockImplementationOnce(async()=>new Promise(resolve=>{finish=resolve;}));
 const s=await screen();try{
  await s.start();await s.prepare();await s.move('second',2);expect(suspendPurchaseReview).toHaveBeenCalledWith('first');
  await act(async()=>finish({preview:{...receipt,approvalId:'late',expiresAt:Date.now()+300000}}));expect(cancelPurchaseChanges).toHaveBeenCalledWith('late');
  await s.move('first',1);expect(s.elements<HTMLSelectElement>('select')[0]!.value).toBe('cat');expect(s.text()).not.toContain('Prepared changes');expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await s.close();}
});

it('revokes approval when moving to a duplicate tab for the same order without losing choices',async()=>{
 const s=await screen();try{
  await s.start();await s.prepare();await s.consent();await s.move('first',9);
  expect(cancelPurchaseChanges).toHaveBeenCalledWith('approval-first');expect(s.text()).not.toContain('Prepared changes');expect(s.elements<HTMLSelectElement>('select')[0]!.value).toBe('cat');
  await s.move('first',1);expect(s.elements('input')).toHaveLength(0);expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await s.close();}
});

it.each(['constructor','__proto__','toString'])('treats %s as an order key, never as inherited state',async id=>{
 context.orderKey=id;const s=await screen();try{
  expect(s.text()).toContain('Review selected order');await s.start();expect(s.text()).toContain(`Synthetic ${id}`);
  await s.move('second',2);await s.move(id,1);expect(s.text()).toContain(`Synthetic ${id}`);
 }finally{await s.close();}
});
