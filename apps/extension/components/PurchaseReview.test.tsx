// @vitest-environment happy-dom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import PurchaseReview from "./PurchaseReview";
import {reviewCanadianPurchase,preparePurchaseChanges,applyPurchaseChanges,cancelPurchaseChanges,reopenPurchaseReviewTab} from "@/lib/messaging";
const tabContext=vi.hoisted(()=>({state:"active"}));
vi.mock("./useReviewTabState",()=>({useReviewTabState:()=>tabContext.state}));
vi.mock("./useActiveOrderTab",()=>({useActiveOrderTab:()=>true}));
vi.mock("./AmazonTransactionsLink",()=>({default:()=>null}));
vi.mock("@/lib/messaging",()=>({reviewCanadianPurchase:vi.fn(),preparePurchaseChanges:vi.fn(),applyPurchaseChanges:vi.fn(),suspendPurchaseReview:vi.fn(async()=>{}),cancelPurchaseChanges:vi.fn(async()=>{}),reopenPurchaseReviewTab:vi.fn()}));
it("reads only on click without a test-plan checkbox and clears canceled results",async()=>{
 vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<PurchaseReview categories={[{id:"test-category",name:"Synthetic category",groupName:"Test"}]}/>));
  expect(reviewCanadianPurchase).not.toHaveBeenCalled();const button=host.querySelector("button")!;expect(button.disabled).toBe(false);
  expect(host.querySelectorAll('select')).toHaveLength(0);
  expect(host.querySelector('input')).toBeNull();
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{items:[{title:"Synthetic item",cardCents:1234,quantity:1,priceCents:1234}],totalCents:1234,summary:{subtotalCents:1234,shippingCents:0,feeCents:0,taxCents:0,giftCents:0}}});
  await act(async()=>button.click());expect(reviewCanadianPurchase).toHaveBeenCalledWith(true);
  expect(host.textContent).toContain("Synthetic item");expect(host.textContent).toContain("Synthetic category");
  expect([...host.querySelectorAll('button')].some(b=>b.textContent==='Review selected order')).toBe(false);
  expect(host.querySelectorAll('ol > li')).toHaveLength(1);
  expect(host.querySelector('ol strong')?.getAttribute('title')).toBe('Synthetic item');
  expect(host.querySelectorAll('select')).toHaveLength(1);
  expect(host.querySelectorAll('input')).toHaveLength(0);expect(host.textContent).toContain('No distribution is needed');
  expect(host.textContent).toContain('Choose a category for this item.');
  const explanation=[...host.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='How this works')!;
  expect(explanation.open).toBe(false);
  await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="Cancel review")!.click());expect(host.textContent).not.toContain("Synthetic item");expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Review selected order')!.disabled).toBe(false);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
it("defaults fees to distribution and keeps category mode and price confirmation explicit",async()=>{
 vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const change=async(el:HTMLSelectElement,value:string)=>{await act(async()=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});};
 try{
  await act(async()=>root.render(<PurchaseReview categories={[{id:'synthetic-category',name:'Synthetic category',groupName:'Test'}]}/>));
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{items:[{title:'Synthetic item',quantity:null,priceCents:1000,cardCents:null},{title:'Synthetic other',quantity:1,priceCents:1000,cardCents:null}],totalCents:2373,summary:{subtotalCents:2000,feeCents:100,shippingCents:0,taxCents:273,giftCents:0},allocationPending:true}});
  await act(async()=>host.querySelector('button')!.click());
  expect(host.textContent).toContain('Confirm each item’s total price before preparing the split.');
  expect(host.textContent).toContain('Estimated card share: CAD 11.87');expect(host.textContent).not.toContain('Prepare changes');
  await act(async()=>host.querySelectorAll('input')[0]!.click());
  expect(host.textContent).toContain('Estimated split total CAD 23.73');expect(host.querySelectorAll('ol > li')).toHaveLength(2);
  const mode=host.querySelector<HTMLSelectElement>('select[aria-label="Apply environmental handling fee to"]')!;
  expect(mode.value).toBe('all');await change(mode,'category');
  expect(host.querySelectorAll('ol > li')).toHaveLength(3);expect(host.textContent).toContain('Estimated card share: CAD 11.30');
  await change(host.querySelector<HTMLSelectElement>('ol select')!,'synthetic-category');
  await change(host.querySelector<HTMLSelectElement>('ol li:nth-child(3) select')!,'synthetic-category');
  await change(mode,'all');expect(host.querySelectorAll('ol > li')).toHaveLength(2);expect(host.textContent).toContain('Estimated card share: CAD 11.87');
  expect(applyPurchaseChanges).not.toHaveBeenCalled();
  await act(async()=>host.querySelectorAll('input')[0]!.click());expect(host.textContent).toContain('Confirm each item’s total price before preparing the split.');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it("requires prepared proposal and separate final consent before saving once",async()=>{
 vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const click=async(text:string)=>{await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!.click());};
 try{
 await act(async()=>root.render(<PurchaseReview categories={[{id:'test-cat',name:'Synthetic category',groupName:'Test'}]}/>));
 vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{reviewId:'test-review',items:[{title:'Synthetic',quantity:1,priceCents:1000,cardCents:1000}],totalCents:1000,summary:{subtotalCents:1000,feeCents:0,shippingCents:0,taxCents:0,giftCents:0}}});
 await click('Review selected order');
 const select=host.querySelector('select')!;await act(async()=>{select.value='test-cat';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.textContent).toContain('This payment is ready to review.');
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Prepare changes')!.disabled).toBe(false);
 expect(host.querySelectorAll('input')).toHaveLength(0);
 vi.mocked(preparePurchaseChanges).mockResolvedValueOnce({preview:{destination:{planName:'Synthetic household plan',accountName:'Synthetic Visa'},approvalId:'test-approval',expiresAt:Date.now()+300000,paymentDate:'2026-10-23',date:'2026-10-24',totalCents:1000,lines:[{categoryName:'Synthetic category',cents:1000}]}});
 await click('Prepare changes');expect(preparePurchaseChanges).toHaveBeenCalledWith('test-review',[false],[{id:'test-cat',name:'Synthetic category'}],true,undefined,[]);
 const save=[...host.querySelectorAll('button')].find(b=>b.textContent==='Save approved changes once')!;expect(save.disabled).toBe(true);expect(applyPurchaseChanges).not.toHaveBeenCalled();
 expect(host.textContent).toContain('Synthetic household plan → Synthetic Visa');
 expect(host.textContent).toContain('I approve this displayed change in Synthetic household plan');
 expect(host.textContent).toContain('YNAB date: 2026-10-24');
 expect(host.textContent).toContain('Amazon payment date: 2026-10-23');
 expect(host.textContent).toContain('Your YNAB date stays unchanged.');
 expect(host.textContent).not.toContain('Test Plan');
 await act(async()=>host.querySelectorAll('input')[0]!.click());vi.mocked(applyPurchaseChanges).mockResolvedValueOnce({ok:true});await click('Save approved changes once');
 expect(applyPurchaseChanges).toHaveBeenCalledExactlyOnceWith('test-approval',true);expect(host.textContent).toContain('Changes saved');expect(host.textContent).toContain('Saved to YNAB');expect(host.querySelectorAll('select')).toHaveLength(0);expect(host.textContent).toContain('Synthetic household plan → Synthetic Visa');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it("preserves policy consent during preparation and shows failure beside the button",async()=>{
 vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const click=async(text:string)=>{await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!.click());};
 try{
 await act(async()=>root.render(<PurchaseReview categories={[{id:'test-cat',name:'Synthetic category',groupName:'Test'}]}/>));
 vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{reviewId:'test-review',items:[{title:'Synthetic',quantity:1,priceCents:500,cardCents:500},{title:'Synthetic second',quantity:1,priceCents:500,cardCents:500}],totalCents:1000,summary:{subtotalCents:1000,feeCents:0,shippingCents:0,taxCents:0,giftCents:0}}});
 await click('Review selected order');await act(async()=>{for(const select of host.querySelectorAll('select')){select.value='test-cat';select.dispatchEvent(new Event('change',{bubbles:true}));}});
 const policy=host.querySelectorAll('input')[0]!;await act(async()=>policy.click());
 let finish!:(value:{error:string})=>void;vi.mocked(preparePurchaseChanges).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 await click('Prepare changes');expect(policy.checked).toBe(true);expect(host.textContent).toContain('Validating the current order');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Preparing changes…')!.disabled).toBe(true);
 await act(async()=>finish({error:'Synthetic target is unavailable.'}));expect(policy.checked).toBe(true);
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Prepare changes')!;expect(button.nextElementSibling?.getAttribute('role')).toBe('alert');expect(button.nextElementSibling?.textContent).toContain('Synthetic target is unavailable');expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

const syntheticReview={reviewId:'test-review',items:[{title:'Synthetic cancel item',quantity:1,priceCents:1000,cardCents:1000}],totalCents:1000,summary:{subtotalCents:1000,feeCents:0,shippingCents:0,taxCents:0,giftCents:0}};
const syntheticProposal=()=>({approvalId:'test-approval',expiresAt:Date.now()+300000,date:'2026-10-23',totalCents:1000,lines:[{categoryName:'Synthetic category',cents:1000}]});
function deferred<T>(){let finish!:(result:T)=>void;const promise=new Promise<T>(resolve=>{finish=resolve;});return {promise,finish};}
async function cancellationScreen(){
 vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<PurchaseReview categories={[{id:'test-cat',name:'Synthetic category',groupName:'Test'}]}/>));
 const click=async(text:string)=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button,`Missing ${text}`).toBeDefined();await act(async()=>button!.click());};
 const start=async()=>{await click('Review selected order');};
 const choose=async()=>{const select=host.querySelector('select')!;await act(async()=>{select.value='test-cat';select.dispatchEvent(new Event('change',{bubbles:true}));});if(host.querySelector('input'))await act(async()=>host.querySelector<HTMLInputElement>('input')!.click());};
 const close=async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();};
 return {host,root,click,start,choose,close};
}

it('cancels the initial read without disconnecting and revokes its late review',async()=>{
 const screen=await cancellationScreen();
 try{
  const pending=deferred<Awaited<ReturnType<typeof reviewCanadianPurchase>>>();vi.mocked(reviewCanadianPurchase).mockReturnValueOnce(pending.promise);
  await screen.start();expect(screen.host.textContent).toContain('Checking the Amazon payment');
  await screen.click('Cancel review');expect(cancelPurchaseChanges).toHaveBeenCalledExactlyOnceWith(undefined);
  expect(screen.host.textContent).toContain('Review canceled. No transaction changed.');
  await act(async()=>pending.finish({review:syntheticReview}));
  expect(cancelPurchaseChanges).toHaveBeenLastCalledWith('test-review');expect(screen.host.textContent).not.toContain('Synthetic cancel item');
  expect(screen.host.querySelectorAll('select')).toHaveLength(0);expect(applyPurchaseChanges).not.toHaveBeenCalled();expect(preparePurchaseChanges).not.toHaveBeenCalled();
 }finally{await screen.close();}
});

it('cancels an in-flight initial read on sidebar unmount before an id exists',async()=>{
 const screen=await cancellationScreen();let closed=false;
 try{
  const pending=deferred<Awaited<ReturnType<typeof reviewCanadianPurchase>>>();vi.mocked(reviewCanadianPurchase).mockReturnValueOnce(pending.promise);
  await screen.start();await screen.close();closed=true;
  expect(cancelPurchaseChanges).toHaveBeenCalledExactlyOnceWith();
  pending.finish({review:syntheticReview});await Promise.resolve();
  expect(cancelPurchaseChanges).toHaveBeenLastCalledWith('test-review');expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{if(!closed)await screen.close();}
});

it('keeps Cancel review available after discovery before a proposal exists',async()=>{
 const screen=await cancellationScreen();
 try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:syntheticReview});await screen.start();
  await screen.click('Cancel review');expect(cancelPurchaseChanges).toHaveBeenLastCalledWith('test-review');
  expect(screen.host.textContent).not.toContain('Synthetic cancel item');expect(screen.host.textContent).toContain('No transaction changed');
  expect(preparePurchaseChanges).not.toHaveBeenCalled();expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await screen.close();}
});

it('cancels preparation and revokes a late proposal without restoring consent or Save',async()=>{
 const screen=await cancellationScreen();
 try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:syntheticReview});await screen.start();await screen.choose();
  const pending=deferred<Awaited<ReturnType<typeof preparePurchaseChanges>>>();vi.mocked(preparePurchaseChanges).mockReturnValueOnce(pending.promise);
  await screen.click('Prepare changes');expect(screen.host.textContent).not.toContain('Checking the Amazon payment');
  await screen.click('Cancel review');expect(cancelPurchaseChanges).toHaveBeenLastCalledWith('test-review');
  await act(async()=>pending.finish({preview:syntheticProposal()}));expect(cancelPurchaseChanges).toHaveBeenLastCalledWith('test-approval');
  expect(screen.host.textContent).not.toMatch(/Before:|Save approved|Preparing changes|Synthetic cancel item/);
  expect(screen.host.querySelectorAll('input')).toHaveLength(0);expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await screen.close();}
});

it('keeps a canceled save locked and unconfirmed even when its late reply reports success',async()=>{
 const screen=await cancellationScreen();
 try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:syntheticReview});await screen.start();await screen.choose();
  vi.mocked(preparePurchaseChanges).mockResolvedValueOnce({preview:syntheticProposal()});await screen.click('Prepare changes');
  await act(async()=>[...screen.host.querySelectorAll('input')].at(-1)!.click());
  const pending=deferred<Awaited<ReturnType<typeof applyPurchaseChanges>>>();vi.mocked(applyPurchaseChanges).mockReturnValueOnce(pending.promise);
  await screen.click('Save approved changes once');expect(screen.host.textContent).toContain('Cancel cannot undo a request already sent');
  await screen.click('Cancel review');expect(cancelPurchaseChanges).toHaveBeenLastCalledWith('test-approval');
  await act(async()=>pending.finish({ok:true}));
  expect(screen.host.textContent).toContain('Result unconfirmed. Inspect YNAB; do not retry or reload to retry.');
  expect(screen.host.textContent).not.toMatch(/Changes saved|No transaction changed/);
  expect([...screen.host.querySelectorAll('button')].find(b=>b.textContent==='Review selected order')!.disabled).toBe(true);
  expect(applyPurchaseChanges).toHaveBeenCalledOnce();
 }finally{await screen.close();}
});

it('keeps the review button available after a failed read for an explicit retry',async()=>{
 const screen=await cancellationScreen();
 try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({error:'Review stopped',reason:'paymentsRead'});
  await screen.start();
  expect(screen.host.textContent).toContain('The Transactions reader encountered an unexpected error');
  expect([...screen.host.querySelectorAll('button')].find(b=>b.textContent==='Review selected order')!.disabled).toBe(false);
  expect(reviewCanadianPurchase).toHaveBeenCalledOnce();
 }finally{await screen.close();}
});

it('dims a review away from its bound tab, resumes choices on return and reopens closed tabs only into a fresh review',async()=>{
 const screen=await cancellationScreen();
 const render=async()=>{await act(async()=>screen.root.render(<PurchaseReview categories={[{id:'test-cat',name:'Synthetic category',groupName:'Test'}]}/>));};
 try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:syntheticReview});await screen.start();await screen.choose();
  tabContext.state='away';await render();
  expect(screen.host.querySelector('fieldset')!.disabled).toBe(true);expect(screen.host.querySelector('fieldset')!.className).toContain('opacity-50');
  expect(screen.host.textContent).toContain('Switch back to the reviewed order tab');
  tabContext.state='active';await render();expect(screen.host.querySelector('fieldset')!.disabled).toBe(false);expect(screen.host.querySelector('select')!.value).toBe('test-cat');
  tabContext.state='closed';await render();expect(screen.host.textContent).toContain('Tab closed');
  vi.mocked(reopenPurchaseReviewTab).mockResolvedValueOnce({ok:true});await screen.click('Reopen tab');
  expect(reopenPurchaseReviewTab).toHaveBeenCalledExactlyOnceWith('test-review');expect(screen.host.textContent).toContain('Order tab reopened. Review the order again');
  expect(screen.host.textContent).not.toContain('Synthetic cancel item');expect(preparePurchaseChanges).not.toHaveBeenCalled();expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{tabContext.state='active';await screen.close();}
});

it.each([['exact','Suggested from your saved choice'],['history','Suggested from similar products'],['model','Suggested by the local model']] as const)('prefills an editable %s suggestion with its origin',async(source,label)=>{
 vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const categories=[{id:'learned',name:'Remembered',groupName:'Test'},{id:'replacement',name:'Corrected',groupName:'Test'}];
 vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{reviewId:'review',items:[{title:'Synthetic repeat',suggestedCategoryId:'learned',suggestionSource:source,priceCents:100,quantity:1,cardCents:100}],totalCents:100,summary:{subtotalCents:100,shippingCents:0,feeCents:0,taxCents:0,giftCents:0}}});
 try{
 await act(async()=>root.render(<PurchaseReview categories={categories}/>));
 await act(async()=>host.querySelector('button')!.click());
 const select=host.querySelector('select')!;expect(select.value).toBe('learned');expect(host.textContent).toContain(label);
 await act(async()=>{select.value='replacement';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(select.value).toBe('replacement');expect(host.textContent).not.toContain(label);expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('shows the quantity-adjusted item total and gift-funded card share before confirming it',async()=>{
 vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{reviewId:'synthetic',items:[{title:'Synthetic quantity item',priceCents:600,quantity:2,cardCents:null},{title:'Synthetic other',priceCents:2800,quantity:1,cardCents:null}],totalCents:2500,summary:{subtotalCents:4000,shippingCents:0,feeCents:0,taxCents:0,giftCents:1500}}});
 try{
 await act(async()=>root.render(<PurchaseReview categories={[]}/>));await act(async()=>host.querySelector('button')!.click());
 const first=host.querySelector('ol li')!;expect(first.textContent).toContain('Item total: CAD 12.00 (2 × CAD 6.00)');expect(first.textContent).toContain('Estimated card share: CAD 7.50');expect(first.textContent).toContain('Total price confirmed (CAD 12.00)');
 expect(host.textContent).not.toContain('Prepare changes');await act(async()=>first.querySelector('input')!.click());expect(host.textContent).toContain('Estimated split total CAD 25.00');expect(host.textContent).not.toContain('confirmed prices don’t add up');expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('shows matched split-shipment charges without proposing an unreviewed allocation or save',async()=>{
 vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);tabContext.state='active';const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{reviewId:'synthetic',items:[],totalCents:10000,matchedCharges:[{date:'2026-01-01',cents:4000},{date:'2026-01-03',cents:6000}]}});
 try{await act(async()=>root.render(<PurchaseReview categories={[]}/>));await act(async()=>host.querySelector('button')!.click());
 expect(host.textContent).toContain('Split-shipment charges matched');expect(host.textContent).toContain('CAD 40.00');expect(host.textContent).toContain('CAD 60.00');expect(host.textContent).toContain('CAD 100.00');
 expect(host.querySelector('select[aria-label="Payment to prepare"]')).not.toBeNull();expect(host.textContent).not.toMatch(/Prepare changes|Save approved changes once/);expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it.each([true,false])('shows suggestions and requires separate payment approval (learningSaved=%s)',async learningSaved=>{
 vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);tabContext.state='active';const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const categories=[{id:'synthetic-category',name:'Synthetic category',groupName:'Test'}];
 vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{reviewId:'synthetic',items:[{title:'Synthetic first',quantity:1,priceCents:1000,cardCents:null,suggestedCategoryId:'synthetic-category',suggestionSource:'exact'},{title:'Synthetic second',quantity:1,priceCents:2000,cardCents:null,suggestedCategoryId:'synthetic-category',suggestionSource:'model'}],totalCents:3300,summary:{subtotalCents:3000,shippingCents:0,feeCents:0,taxCents:300,giftCents:0},matchedCharges:[{date:'2026-01-01',cents:1100,eligible:true},{date:'2026-01-03',cents:2200,eligible:true}]}});
 const click=async(text:string)=>{await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!.click());};
 try{
 await act(async()=>root.render(<PurchaseReview categories={categories}/>));await click('Review selected order');expect(host.textContent).toContain('Suggested from your saved choice');expect(host.textContent).toContain('Suggested by the local model');
 const button=()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Prepare selected payment')!;expect(button().disabled).toBe(true);
 for(const [i,value] of ['0','1'].entries()){const select=host.querySelector(`select[aria-label="Payment for item ${i+1}"]`)! as HTMLSelectElement;await act(async()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});}
 expect(host.querySelector('ol li')!.textContent).toContain('Estimated card share: CAD 11.00');await act(async()=>host.querySelector('input')!.click());expect(button().disabled).toBe(false);
 vi.mocked(preparePurchaseChanges).mockResolvedValueOnce({preview:{approvalId:'first',expiresAt:Date.now()+300000,date:'2026-01-01',totalCents:1100,lines:[{categoryName:'Synthetic category',cents:1100}]}});await click('Prepare selected payment');
 expect(preparePurchaseChanges).toHaveBeenCalledWith('synthetic',[false,false],[{id:'synthetic-category',name:'Synthetic category'},{id:'synthetic-category',name:'Synthetic category'}],true,{chargeIndex:0,assignments:[0,1]},[]);expect(applyPurchaseChanges).not.toHaveBeenCalled();
 await act(async()=>[...host.querySelectorAll('input')].at(-1)!.click());vi.mocked(applyPurchaseChanges).mockResolvedValueOnce({ok:true,learningSaved,savedChargeIndex:0});await click('Save approved changes once');
 expect(applyPurchaseChanges).toHaveBeenCalledExactlyOnceWith('first',true);expect(host.querySelector<HTMLSelectElement>('select[aria-label="Payment to prepare"]')!.value).toBe('1');expect(host.textContent).toContain('Already categorized — preserved');expect(host.querySelector<HTMLSelectElement>('select[aria-label="Payment for item 1"]')!.disabled).toBe(true);expect(button().disabled).toBe(true);expect(host.textContent).not.toContain('Save approved changes once');if(!learningSaved)expect(host.textContent).toContain('Local learning did not complete');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('shows the parsed payment comparison on a failed review without returning private page errors',async()=>{
 vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({error:'generic background error',reason:'paymentGroupTotal',paymentDiagnostic:{orderCents:2500,chargeCents:[2500,1500],orderCurrency:'unspecified',chargeCurrencies:['unspecified','unspecified']}});
 try{await act(async()=>root.render(<PurchaseReview categories={[]}/>));await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toContain('order card total $25.00');expect(host.textContent).toContain('2 linked purchase rows totaling $40.00');expect(host.textContent).not.toContain('generic background error');expect(preparePurchaseChanges).not.toHaveBeenCalled();}finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('uses exclusive selected-item checkboxes, blocks excessive reductions and revokes a proposal after a policy edit',async()=>{
 const screen=await cancellationScreen();const change=async(el:HTMLSelectElement,value:string)=>{await act(async()=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});};
 const r={...syntheticReview,items:[{title:'Synthetic small',priceCents:1000,quantity:1,cardCents:null,suggestedCategoryId:'test-cat'},{title:'Synthetic large',priceCents:3000,quantity:1,cardCents:null,suggestedCategoryId:'test-cat'}],summary:{subtotalCents:4000,shippingCents:0,feeCents:0,couponCents:1500,taxCents:0,giftCents:0},totalCents:2500};
 try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:r});await screen.start();
  const mode=screen.host.querySelector<HTMLSelectElement>('select[aria-label="Apply discounts to"]')!;
  expect([...mode.options].map(o=>o.value)).toEqual(['all','selected']);
  expect(screen.host.querySelector('[aria-label="Items for discounts"]')).toBeNull();
  await change(mode,'selected');expect(screen.host.textContent).toContain('Select at least one item');
  expect(screen.host.textContent).not.toContain('Prepare changes');
  await act(async()=>screen.host.querySelector<HTMLInputElement>('input[aria-label="Discounts: item 1"]')!.click());
  expect(screen.host.textContent).toContain('exceeds the selected items');expect(screen.host.textContent).not.toContain('confirmed prices don’t add up');
  await act(async()=>{screen.host.querySelector<HTMLInputElement>('input[aria-label="Discounts: item 1"]')!.click();screen.host.querySelector<HTMLInputElement>('input[aria-label="Discounts: item 2"]')!.click();});
  expect(screen.host.querySelector('ol li:nth-child(2)')!.textContent).toContain('Estimated card share: CAD 15.00');
  await act(async()=>[...screen.host.querySelectorAll('input')].at(-1)!.click());
  vi.mocked(preparePurchaseChanges).mockResolvedValueOnce({preview:{...syntheticProposal(),totalCents:2500,lines:[{categoryName:'Synthetic category',cents:2500}]}});await screen.click('Prepare changes');
  expect(preparePurchaseChanges).toHaveBeenCalledWith('test-review',[false,false],[{id:'test-cat',name:'Synthetic category'},{id:'test-cat',name:'Synthetic category'}],true,undefined,[{kind:'coupon',mode:'selected',method:'proportional',items:[1]}]);
  expect(screen.host.querySelector('[aria-label="Prepared changes"]')).not.toBeNull();
  await change(mode,'all');expect(cancelPurchaseChanges).toHaveBeenCalledWith('test-approval');expect(screen.host.querySelector('[aria-label="Prepared changes"]')).toBeNull();
  expect(screen.host.querySelector('[aria-label="Items for discounts"]')).toBeNull();expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{await screen.close();}
});

it('keeps split payment and adjustment choices fixed after the first verified save',async()=>{
 const screen=await cancellationScreen();
 try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{...syntheticReview,items:[{title:'Synthetic first',priceCents:1000,quantity:1,cardCents:null,suggestedCategoryId:'test-cat'},{title:'Synthetic second',priceCents:2000,quantity:1,cardCents:null,suggestedCategoryId:'test-cat'}],summary:{subtotalCents:3000,shippingCents:0,feeCents:100,taxCents:0,giftCents:0},totalCents:3100,matchedCharges:[{date:'2026-01-01',cents:1100,eligible:true},{date:'2026-01-02',cents:2000,eligible:true}]}});await screen.start();
  for(const [i,value] of ['0','1'].entries()){const select=screen.host.querySelector<HTMLSelectElement>(`select[aria-label="Payment for item ${i+1}"]`)!;await act(async()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});}
  await act(async()=>screen.host.querySelector('input')!.click());
  vi.mocked(preparePurchaseChanges).mockResolvedValueOnce({preview:{...syntheticProposal(),totalCents:1100}});await screen.click('Prepare selected payment');
  expect(preparePurchaseChanges).toHaveBeenLastCalledWith('test-review',[false,false],[{id:'test-cat',name:'Synthetic category'},{id:'test-cat',name:'Synthetic category'},{id:'',name:''}],true,{chargeIndex:0,assignments:[0,1,-1]},[{kind:'fee',mode:'all',method:'equal',items:[]}]);
  await act(async()=>[...screen.host.querySelectorAll('input')].at(-1)!.click());vi.mocked(applyPurchaseChanges).mockResolvedValueOnce({ok:true,savedChargeIndex:0});await screen.click('Save approved changes once');
  expect(screen.host.querySelector<HTMLFieldSetElement>('section[aria-label="Adjustments"] fieldset')!.disabled).toBe(true);expect(screen.host.querySelector<HTMLSelectElement>('select[aria-label="Payment to prepare"]')!.value).toBe('1');
  expect(applyPurchaseChanges).toHaveBeenCalledOnce();
 }finally{await screen.close();}
});

it.each([false,true])('reveals an async proposal after it appears without stealing focus or scrolling on consent edits (reduced motion=%s)',async reduced=>{
 const screen=await cancellationScreen();
 const original=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollIntoView');
 const scroll=vi.fn();Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:scroll});
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:reduced})));
 try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:syntheticReview});await screen.start();
  expect(scroll.mock.instances).toContain(screen.host.querySelector('fieldset'));
  await screen.choose();scroll.mockClear();
  const pending=deferred<Awaited<ReturnType<typeof preparePurchaseChanges>>>();vi.mocked(preparePurchaseChanges).mockReturnValueOnce(pending.promise);
  await screen.click('Prepare changes');expect(scroll).not.toHaveBeenCalled();
  const focused=[...screen.host.querySelectorAll('button')].find(b=>b.textContent==='Cancel review')!;focused.focus();
  expect(document.activeElement).toBe(focused);
  await act(async()=>pending.finish({preview:syntheticProposal()}));
  expect(scroll).toHaveBeenCalledExactlyOnceWith({behavior:reduced?'instant':'smooth',block:'start',inline:'nearest'});
  expect(scroll.mock.instances[0]).toBe(screen.host.querySelector('[aria-label="Prepared changes"]'));
  expect(document.activeElement).toBe(focused);
  scroll.mockClear();await act(async()=>[...screen.host.querySelectorAll('input')].at(-1)!.click());
  expect(scroll).not.toHaveBeenCalled();expect(applyPurchaseChanges).not.toHaveBeenCalled();
 }finally{
  if(original)Object.defineProperty(HTMLElement.prototype,'scrollIntoView',original);else Reflect.deleteProperty(HTMLElement.prototype,'scrollIntoView');
  await screen.close();
 }
});

it('needs only one category for a single product with multiple units and all detected adjustments, then still requires final save approval',async()=>{
 const screen=await cancellationScreen();try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{reviewId:'test-review',items:[{title:'Synthetic single',quantity:2,priceCents:1000,cardCents:null}],totalCents:1785,summary:{subtotalCents:2000,couponCents:200,feeCents:100,shippingCents:300,taxCents:286,giftCents:701}}});await screen.start();
  expect(screen.host.querySelectorAll('select')).toHaveLength(1);expect(screen.host.querySelectorAll('input')).toHaveLength(0);expect(screen.host.querySelector('[aria-label="Adjustments"]')).toBeNull();expect(screen.host.querySelectorAll('ol li')).toHaveLength(1);
  expect(screen.host.textContent).toContain('Quantity: 2');expect(screen.host.textContent).toContain('Category total CAD 17.85');
  const select=screen.host.querySelector('select')!;await act(async()=>{select.value='test-cat';select.dispatchEvent(new Event('change',{bubbles:true}));});
  const button=[...screen.host.querySelectorAll('button')].find(b=>b.textContent==='Prepare changes')!;expect(button.disabled).toBe(false);
  vi.mocked(preparePurchaseChanges).mockResolvedValueOnce({preview:{...syntheticProposal(),totalCents:1785,lines:[{categoryName:'Synthetic category',cents:1785}]}});await screen.click('Prepare changes');
  expect(preparePurchaseChanges).toHaveBeenCalledWith('test-review',[false],[{id:'test-cat',name:'Synthetic category'}],true,undefined,[]);expect(applyPurchaseChanges).not.toHaveBeenCalled();expect(screen.host.querySelectorAll('input')).toHaveLength(1);
  expect([...screen.host.querySelectorAll('button')].find(b=>b.textContent==='Save approved changes once')!.disabled).toBe(true);
 }finally{await screen.close();}
});
it('shows an amount error rather than a hidden quantity-confirmation instruction when a single product cannot reconcile',async()=>{
 const screen=await cancellationScreen();try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{...syntheticReview,items:[{...syntheticReview.items[0]!,quantity:2,priceCents:333}]}});await screen.start();
  expect(screen.host.textContent).toContain('could not be reconciled');expect(screen.host.textContent).not.toContain('Confirm each item’s total price');expect(screen.host.textContent).not.toContain('Prepare changes');
 }finally{await screen.close();}
});
it('uses the same single category for separate charges of one product, with no product-payment assignments and no batch save',async()=>{
 const screen=await cancellationScreen();try{
  vi.mocked(reviewCanadianPurchase).mockResolvedValueOnce({review:{...syntheticReview,items:[{...syntheticReview.items[0]!,suggestedCategoryId:'test-cat',quantity:2,priceCents:500}],matchedCharges:[{date:'2026-01-01',cents:400,eligible:true},{date:'2026-01-02',cents:600,eligible:true}]}});await screen.start();
  expect(screen.host.querySelectorAll('select')).toHaveLength(2);expect(screen.host.querySelector('select[aria-label="Payment for item 1"]')).toBeNull();expect(screen.host.querySelectorAll('input')).toHaveLength(0);
  vi.mocked(preparePurchaseChanges).mockResolvedValueOnce({preview:{...syntheticProposal(),totalCents:400,lines:[{categoryName:'Synthetic category',cents:400}]}});await screen.click('Prepare selected payment');
  expect(preparePurchaseChanges).toHaveBeenCalledWith('test-review',[false],[{id:'test-cat',name:'Synthetic category'}],true,{chargeIndex:0,assignments:[]},[]);
  await act(async()=>screen.host.querySelector('input')!.click());vi.mocked(applyPurchaseChanges).mockResolvedValueOnce({ok:true,learningSaved:true,savedChargeIndex:0});await screen.click('Save approved changes once');
  expect(screen.host.querySelector<HTMLSelectElement>('select[aria-label="Payment to prepare"]')!.value).toBe('1');expect(screen.host.querySelector<HTMLSelectElement>('ol select')!.disabled).toBe(true);expect(screen.host.querySelectorAll('input')).toHaveLength(0);expect(applyPurchaseChanges).toHaveBeenCalledOnce();
 }finally{await screen.close();}
});
