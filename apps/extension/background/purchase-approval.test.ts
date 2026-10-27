import {beforeEach,expect,it,vi} from "vitest";
vi.mock("./purchase-learning",()=>({suggestPurchaseCategories:vi.fn(async()=>[]),rememberPurchaseCategories:vi.fn(async()=>{})}));
const io=vi.hoisted(()=>({review:vi.fn(),target:vi.fn(),categories:vi.fn(),write:vi.fn(),settings:vi.fn(),tab:vi.fn(),query:vi.fn(),create:vi.fn()}));
vi.mock("./order-review",()=>({reviewSelectedOrder:io.review}));
vi.mock("@/lib/ynab",()=>({getReviewedTarget:io.target,getCategories:io.categories,writeReviewedSplit:io.write}));
vi.mock("@/lib/settings",()=>({getSettings:io.settings}));vi.mock("wxt/browser",()=>({browser:{tabs:{get:io.tab,query:io.query,create:io.create}}}));
let service:typeof import('./purchase-approval');
const view={items:[{title:'Synthetic',priceCents:1000,quantity:1,cardCents:1000}],totalCents:1000,summary:{subtotalCents:1000,feeCents:0,shippingCents:0,taxCents:0,giftCents:0},allocationPending:false};
const binding={connection:{accessToken:'test-only-token',planId:'test-plan',planName:'Test Plan'},detail:{id:1,url:'https://www.amazon.ca/your-orders/order-details?orderID=synthetic'},payments:{id:2,url:'https://www.amazon.ca/cpe/yourpayments/transactions'},paymentDate:'2026-10-23',identity:[{productId:'B000000001'}]};
const target={planName:'Test Plan',paymentDate:'2026-10-23',accountName:'Synthetic account',transactionId:'test-tx',accountId:'test-account',date:'2026-10-23',amount:-10000,approved:false};
const cats=[{id:'test-cat',name:'Synthetic category',groupName:'Test'}];
beforeEach(async()=>{vi.resetModules();vi.resetAllMocks();service=await import('./purchase-approval');io.query.mockImplementation(async(q:{active?:boolean})=>q.active?[{id:1,url:binding.detail.url}]:[{id:1,url:binding.detail.url},{id:2,url:binding.payments.url}]);io.review.mockImplementation(async(_c,_s,capture)=>{capture(structuredClone(binding));return structuredClone(view);});io.target.mockResolvedValue(target);io.categories.mockResolvedValue(cats);io.settings.mockResolvedValue(binding.connection);io.tab.mockImplementation(async(id:number)=>({url:id===1?binding.detail.url:binding.payments.url}));io.write.mockImplementation(async(_p,_t,_l,_s,send,context)=>{await context();send('test-only-token');});});
async function prepare(){const r=await service.startPurchaseReview(true,new AbortController().signal);return service.preparePurchaseApproval(r.reviewId,[false],cats.map(({id,name})=>({id,name})),true,new AbortController().signal);}
const apply=(id:unknown,confirmed:unknown=true)=>service.applyPurchaseApproval(id,confirmed,new AbortController().signal);
it('binds category choices to fresh review and explicit local consent, then writes once and learns only after verified success',async()=>{const p=await prepare();expect(JSON.stringify(p)).not.toMatch(/test-only-token|test-tx|test-account|B000000001/);expect(io.write).not.toHaveBeenCalled();await expect(apply(p.approvalId,false)).rejects.toThrow();await apply(p.approvalId);await expect(apply(p.approvalId)).rejects.toThrow();expect(io.write).toHaveBeenCalledOnce();});
it('consumes before awaiting so duplicate clicks cannot send twice',async()=>{const p=await prepare();const first=apply(p.approvalId);await expect(apply(p.approvalId)).rejects.toThrow();await first;expect(io.write).toHaveBeenCalledOnce();});
it.each([{planId:'synthetic-other-plan'},{planName:'Synthetic renamed plan'}])('rejects a selected-plan change after preparation: %j',async change=>{
 const proposal=await prepare();io.settings.mockResolvedValue({...binding.connection,...change});
 await expect(apply(proposal.approvalId)).rejects.toThrow('connection or page changed');expect(io.write).not.toHaveBeenCalled();
});
it.each(['category','target','product','token','page'])('rejects changed %s before sending',async mode=>{const p=await prepare();if(mode==='category')io.categories.mockResolvedValue([{...cats[0],name:'Renamed'}]);if(mode==='target')io.target.mockResolvedValue({...target,transactionId:'replacement'});if(mode==='token')io.settings.mockResolvedValue({...binding.connection,accessToken:'changed'});if(mode==='page')io.tab.mockResolvedValue({url:'https://www.amazon.ca/changed'});if(mode==='product')io.review.mockImplementation(async(_c,_s,capture)=>{capture({...binding,identity:[{productId:'B000000099'}]});return structuredClone(view);});await expect(apply(p.approvalId)).rejects.toThrow();expect(io.write).not.toHaveBeenCalled();});
it('cancels by approval id and rejects expired grants',async()=>{const p=await prepare();service.invalidatePurchaseApproval(p.approvalId);await expect(apply(p.approvalId)).rejects.toThrow();const q=await prepare();vi.spyOn(Date,'now').mockReturnValueOnce(q.expiresAt+1);await expect(apply(q.approvalId)).rejects.toThrow();vi.restoreAllMocks();});
it('rejects UI-modified proposal and checks final credential',async()=>{const p=await prepare();p.lines[0]!.cents=1;io.write.mockImplementation(async(_p,_t,lines,_s,send)=>{expect(lines[0].amountMilliunits).toBe(-10000);send('changed-token');});await expect(apply(p.approvalId)).rejects.toThrow();});
it('marks post-send failures uncertain and blocks the target from retry',async()=>{const p=await prepare();io.write.mockImplementation(async(_p,_t,_l,_s,send)=>{send('test-only-token');throw Error('private-error');});await expect(apply(p.approvalId)).rejects.toThrow('Do not retry');await expect(prepare()).rejects.toThrow();expect(io.write).toHaveBeenCalledOnce();});
it('rejects a page changed between review and preparation',async()=>{const r=await service.startPurchaseReview(true,new AbortController().signal);io.review.mockImplementation(async(_c,_s,capture)=>{capture({...binding,paymentDate:'2026-10-22'});return view;});await expect(service.preparePurchaseApproval(r.reviewId,[false],cats,true,new AbortController().signal)).rejects.toThrow();expect(io.write).not.toHaveBeenCalled();});
it('revokes final approval when categories change without discarding the original review',async()=>{
 const r=await service.startPurchaseReview(true,new AbortController().signal);const choices=cats.map(({id,name})=>({id,name}));
 const p=await service.preparePurchaseApproval(r.reviewId,[false],choices,true,new AbortController().signal);
 service.invalidatePurchaseApproval(p.approvalId);
 await expect(service.preparePurchaseApproval(r.reviewId,[false],choices,true,new AbortController().signal)).resolves.toHaveProperty('approvalId');
});

it('recomputes equal additional-charge distribution in preparation and apply, without sending its policy id to YNAB',async()=>{
 const {DISTRIBUTE_EQUALLY,DISTRIBUTE_EQUALLY_LABEL}=await import('@/lib/adjustment-distribution');
 const feeView={...view,totalCents:1100,summary:{...view.summary,feeCents:100}};
 io.review.mockImplementation(async(_c,_s,capture)=>{capture(structuredClone(binding));return structuredClone(feeView);});
 io.target.mockResolvedValue({...target,amount:-11000});
 const review=await service.startPurchaseReview(true,new AbortController().signal);
 const choices=[{id:'test-cat',name:'Synthetic category'},{id:DISTRIBUTE_EQUALLY,name:DISTRIBUTE_EQUALLY_LABEL}];
 const p=await service.preparePurchaseApproval(review.reviewId,[false],choices,true,new AbortController().signal);
 expect(p.lines).toEqual([{categoryName:'Synthetic category',cents:1100}]);
 await apply(p.approvalId);expect(io.write.mock.calls[0]![2]).toEqual([{categoryId:'test-cat',categoryName:'Synthetic category',amountMilliunits:-11000,memo:null}]);
});

it('binds different product categories to equal fee pennies and rejects a product distribution policy',async()=>{
 const {DISTRIBUTE_EQUALLY:id,DISTRIBUTE_EQUALLY_LABEL:name}=await import('@/lib/adjustment-distribution');
 const multi={...view,items:[{...view.items[0]!,priceCents:1000},{...view.items[0]!,title:'Synthetic second',priceCents:3000}],totalCents:4005,summary:{...view.summary,subtotalCents:4000,feeCents:5}};
 io.review.mockImplementation(async(_c,_s,capture)=>{capture(structuredClone(binding));return structuredClone(multi);});
 io.categories.mockResolvedValue([...cats,{id:'second-cat',name:'Second category',groupName:'Test'}]);io.target.mockResolvedValue({...target,amount:-40050});
 const r=await service.startPurchaseReview(true,new AbortController().signal);
 await expect(service.preparePurchaseApproval(r.reviewId,[false,false],[{id,name},{id:'second-cat',name:'Second category'},{id,name}],true,new AbortController().signal)).rejects.toThrow();
 const p=await service.preparePurchaseApproval(r.reviewId,[false,false],[{id:'test-cat',name:'Synthetic category'},{id:'second-cat',name:'Second category'},{id,name}],true,new AbortController().signal);
 expect(p.lines).toEqual([{categoryName:'Synthetic category',cents:1003},{categoryName:'Second category',cents:3002}]);
 await apply(p.approvalId);expect(io.write.mock.calls[0]![2].map((line:{amountMilliunits:number})=>line.amountMilliunits)).toEqual([-10030,-30020]);
});

it('reports only the bound review tab state, distinguishing another order, a closed tab and changed address',async()=>{
 const r=await service.startPurchaseReview(true,new AbortController().signal);
 expect(await service.purchaseReviewTabState(r.reviewId)).toBe('active');
 io.query.mockImplementation(async(q:{active?:boolean})=>q.active?[{id:99}]:[{id:1,url:binding.detail.url}]);
 expect(await service.purchaseReviewTabState(r.reviewId)).toBe('away');
 io.query.mockResolvedValue([{id:1,url:binding.detail.url+'&changed=1'}]);expect(await service.purchaseReviewTabState(r.reviewId)).toBe('changed');
 io.query.mockResolvedValue([]);expect(await service.purchaseReviewTabState(r.reviewId)).toBe('closed');
 expect(await service.purchaseReviewTabState('wrong-review')).toBe('expired');expect(io.create).not.toHaveBeenCalled();expect(io.write).not.toHaveBeenCalled();
});
it('reopens only the saved closed order address and invalidates the old review and proposal',async()=>{
 const r=await service.startPurchaseReview(true,new AbortController().signal);
 const p=await service.preparePurchaseApproval(r.reviewId,[false],cats,true,new AbortController().signal);
 await expect(service.reopenPurchaseReviewTab(r.reviewId)).rejects.toThrow();expect(io.create).not.toHaveBeenCalled();
 io.query.mockResolvedValue([]);io.create.mockResolvedValue({id:9});
 await service.reopenPurchaseReviewTab(r.reviewId);
 expect(io.create).toHaveBeenCalledExactlyOnceWith({url:binding.detail.url,active:true});
 expect(await service.purchaseReviewTabState(r.reviewId)).toBe('expired');await expect(apply(p.approvalId)).rejects.toThrow();expect(io.write).not.toHaveBeenCalled();
});
it('rejects applying a prepared proposal while another tab is active',async()=>{
 const p=await prepare();io.query.mockResolvedValue([{id:99}]);await expect(apply(p.approvalId)).rejects.toThrow();expect(io.write).not.toHaveBeenCalled();
});

it('projects suggestions without changing the bound snapshot and learns only the final verified product choices',async()=>{
 const learning=await import('./purchase-learning');
 vi.mocked(learning.suggestPurchaseCategories).mockResolvedValue([{categoryId:'test-cat',source:'exact'}]);
 const r=await service.startPurchaseReview(true,new AbortController().signal);
 expect(r.items[0]?.suggestedCategoryId).toBe('test-cat');
 expect(learning.rememberPurchaseCategories).not.toHaveBeenCalled();
 const p=await service.preparePurchaseApproval(r.reviewId,[false],cats,true,new AbortController().signal);
 expect(learning.rememberPurchaseCategories).not.toHaveBeenCalled();
 await expect(apply(p.approvalId)).resolves.toEqual({learningSaved:true});
 expect(learning.rememberPurchaseCategories).toHaveBeenCalledWith('test-plan',['B000000001'],[{id:'test-cat',name:'Synthetic category',groupName:'Test'}],expect.any(AbortSignal),expect.any(Array));
});
it('does not learn an unconfirmed write; a local learning failure never makes a verified save uncertain',async()=>{
 const learning=await import('./purchase-learning');
 let p=await prepare();io.write.mockRejectedValueOnce(Error('not confirmed'));
 await expect(apply(p.approvalId)).rejects.toThrow();expect(learning.rememberPurchaseCategories).not.toHaveBeenCalled();
 p=await prepare();vi.mocked(learning.rememberPurchaseCategories).mockRejectedValueOnce(Error('local storage failed'));
 await expect(apply(p.approvalId)).resolves.toEqual({learningSaved:false});
 await expect(apply(p.approvalId)).rejects.toThrow();
});
it('degrades to manual categories when suggestion storage is unavailable',async()=>{
 const learning=await import('./purchase-learning');vi.mocked(learning.suggestPurchaseCategories).mockRejectedValueOnce(Error('unavailable'));
 const r=await service.startPurchaseReview(true,new AbortController().signal);expect(r.items[0]?.suggestedCategoryId).toBeNull();
});

it('prepares the same quantity-adjusted total as the sidebar without trusting a supplied line amount',async()=>{
 const quantityView={...view,items:[{...view.items[0]!,priceCents:500,quantity:2,cardCents:null}]};
 io.review.mockImplementation(async(_c,_s,capture)=>{capture({...structuredClone(binding),identity:[{productId:'B000000001',quantity:2,lineCents:null}]});return structuredClone(quantityView);});
 const r=await service.startPurchaseReview(true,new AbortController().signal);
 const p=await service.preparePurchaseApproval(r.reviewId,[true],cats,true,new AbortController().signal);
 expect(p.lines).toEqual([{categoryName:'Synthetic category',cents:1000}]);expect(io.write).not.toHaveBeenCalled();
});

async function splitCase(){
 const base={...view,items:[{title:'Synthetic first',priceCents:1000,quantity:1,cardCents:null},{title:'Synthetic second',priceCents:2000,quantity:1,cardCents:null}],totalCents:3300,summary:{subtotalCents:3000,shippingCents:0,feeCents:0,taxCents:300,giftCents:0},matchedCharges:[{date:'2026-01-01',cents:1100,eligible:true},{date:'2026-01-03',cents:2200,eligible:true}]};
 const saved=new Set<number>();
 io.review.mockImplementation(async(_c,_s,capture)=>{capture({...structuredClone(binding),paymentDate:'2026-01-01',identity:[{productId:'B000000001',quantity:1,lineCents:1000},{productId:'B000000002',quantity:1,lineCents:2000}]});return {...structuredClone(base),matchedCharges:base.matchedCharges.map((c,i)=>({...c,eligible:!saved.has(i)}))};});
 io.target.mockImplementation(async(_p,date,cents)=>{const index=date==='2026-01-01'?0:1;if(saved.has(index))throw Error('The matching transaction already has a category.');return {...target,transactionId:`synthetic-charge-${index}`,date,amount:-cents*10};});
 io.write.mockImplementation(async(_p,t,_lines,_s,send,context)=>{await context();send('test-only-token');saved.add(t.date==='2026-01-01'?0:1);});
 const r=await service.startPurchaseReview(true,new AbortController().signal);return {r,choices:[{id:'test-cat',name:'Synthetic category'},{id:'test-cat',name:'Synthetic category'}],saved};
}
it('requires payment assignments and prepares/saves exactly one chosen charge, learning only its product',async()=>{
 const {r,choices}=await splitCase();const learning=await import('./purchase-learning');
 await expect(service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal)).rejects.toThrow();
 const p=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]});
 expect(p).toMatchObject({date:'2026-01-01',totalCents:1100,lines:[{categoryName:'Synthetic category',cents:1100}]});expect(io.write).not.toHaveBeenCalled();
 expect(await apply(p.approvalId)).toEqual({learningSaved:true,savedChargeIndex:0});expect(io.write).toHaveBeenCalledOnce();
 expect(learning.rememberPurchaseCategories).toHaveBeenLastCalledWith('test-plan',['B000000001'],[{id:'test-cat',name:'Synthetic category'}],expect.any(AbortSignal),['Synthetic first']);
 expect((await io.write.mock.calls[0]![2])[0].amountMilliunits).toBe(-11000);
 // A second charge remains a separate proposal and must be approved separately.
 const next=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:1,assignments:[0,1]});expect(next).toMatchObject({totalCents:2200,date:'2026-01-03'});expect(io.write).toHaveBeenCalledOnce();
 await expect(service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:1,assignments:[1,0]})).rejects.toThrow('allocation changed');
});
it('does not overwrite a saved split charge and still requires distinct final approval for the next charge',async()=>{
 const {r,choices}=await splitCase();const first=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]});await apply(first.approvalId);
 await expect(service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]})).rejects.toThrow('already categorized');
 const second=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:1,assignments:[0,1]});
 await expect(apply(second.approvalId,false)).rejects.toThrow();expect(io.write).toHaveBeenCalledOnce();
 expect(await apply(second.approvalId)).toMatchObject({savedChargeIndex:1});expect(io.write).toHaveBeenCalledTimes(2);
 expect(io.write.mock.calls.map(c=>c[1].transactionId)).toEqual(['synthetic-charge-0','synthetic-charge-1']);
});
it('keeps an unconfirmed split-charge save locked and does not learn or advance',async()=>{
 const {r,choices}=await splitCase(),learning=await import('./purchase-learning');
 const p=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]});
 io.write.mockImplementation(async(_p,_t,_l,_s,send)=>{send('test-only-token');throw Error('synthetic network interruption');});
 await expect(apply(p.approvalId)).rejects.toThrow('Do not retry');expect(learning.rememberPurchaseCategories).not.toHaveBeenCalled();
 await expect(service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]})).rejects.toThrow('Review expired');
});
it('rejects a changed split payment before sending, and a local learning failure cannot retry a verified charge',async()=>{
 const {r,choices}=await splitCase();let p=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]});
 const original=io.review.getMockImplementation()!;
 io.review.mockImplementationOnce(async(...args)=>{const changed=await original(...args);changed.matchedCharges[0].cents++;changed.matchedCharges[1].cents--;return changed;});
 await expect(apply(p.approvalId)).rejects.toThrow('Order changed');expect(io.write).not.toHaveBeenCalled();
 p=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]});
 const learning=await import('./purchase-learning');vi.mocked(learning.rememberPurchaseCategories).mockRejectedValueOnce(Error('synthetic disk failure'));
 expect(await apply(p.approvalId)).toEqual({learningSaved:false,savedChargeIndex:0});
 await expect(service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]})).rejects.toThrow('already categorized');expect(io.write).toHaveBeenCalledOnce();
});
it('forgets conflicting repeated-product choices across payments without teaching unrelated unsaved products',async()=>{
 const {choices}=await splitCase(),original=io.review.getMockImplementation()!;
 io.review.mockImplementation(async(...args)=>{const read=await original(...args);const capture=args[2];capture({...structuredClone(binding),paymentDate:'2026-01-01',identity:[{productId:'B000000001',quantity:1,lineCents:1000},{productId:'B000000001',quantity:1,lineCents:2000}]});return read;});
 io.categories.mockResolvedValue([...cats,{id:'other',name:'Other',groupName:'Test'}]);choices[1]={id:'other',name:'Other'};
 const r=await service.startPurchaseReview(true,new AbortController().signal);const p=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]});await apply(p.approvalId);
 const learning=await import('./purchase-learning');expect(learning.rememberPurchaseCategories).toHaveBeenLastCalledWith('test-plan',['B000000001','B000000001'],choices,expect.any(AbortSignal),['Synthetic first','Synthetic second']);
});

it('binds selected adjustment policies, recomputes the same cents on apply, and learns only product categories',async()=>{
 const multi={...view,items:[{...view.items[0]!,priceCents:1000},{...view.items[0]!,title:'Synthetic second',priceCents:3000}],totalCents:3500,summary:{subtotalCents:4000,feeCents:100,shippingCents:200,couponCents:300,taxCents:0,giftCents:500}};
 io.review.mockImplementation(async(_c,_s,capture)=>{capture({...structuredClone(binding),identity:[{productId:'B000000001'},{productId:'B000000002'}]});return structuredClone(multi);});
 io.categories.mockResolvedValue([...cats,{id:'second-cat',name:'Second category',groupName:'Test'}]);io.target.mockResolvedValue({...target,amount:-35000});
 const {defaultAdjustmentPolicies}=await import('@/lib/adjustment-allocation');
 const policies=defaultAdjustmentPolicies(multi).map(p=>({...p,mode:'selected' as const,items:p.kind==='coupon'?[1]:[0]}));
 const choices=[{id:'test-cat',name:'Synthetic category'},{id:'second-cat',name:'Second category'},{id:'',name:''},{id:'',name:''}];
 const r=await service.startPurchaseReview(true,new AbortController().signal);
 const p=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,undefined,policies);
 expect(p.lines).toEqual([{categoryName:'Synthetic category',cents:800},{categoryName:'Second category',cents:2700}]);expect(io.write).not.toHaveBeenCalled();
 policies[0]!.items=[1]; // The approval owns a clone, not the caller's mutable choices.
 await apply(p.approvalId);expect(io.write.mock.calls[0]![2].map((l:{amountMilliunits:number})=>l.amountMilliunits)).toEqual([-8000,-27000]);
 const learning=await import('./purchase-learning');expect(learning.rememberPurchaseCategories).toHaveBeenLastCalledWith('test-plan',['B000000001','B000000002'],choices.slice(0,2),expect.any(AbortSignal),['Synthetic','Synthetic second']);
});
it('rejects invalid or excessive policies before creating a proposal or reading categories again',async()=>{
 const multi={...view,totalCents:500,summary:{...view.summary,giftCents:500}};
 io.review.mockImplementation(async(_c,_s,capture)=>{capture(structuredClone(binding));return structuredClone(multi);});
 const r=await service.startPurchaseReview(true,new AbortController().signal);io.categories.mockClear();
 for(const policies of [[{kind:'gift',mode:'category',method:'equal',items:[]}],[{kind:'gift',mode:'selected',method:'equal',items:[]}],[{kind:'gift',mode:'selected',method:'equal',items:[3]}]]){
  await expect(service.preparePurchaseApproval(r.reviewId,[false],cats,true,new AbortController().signal,undefined,policies as import('@/lib/types').AdjustmentPolicy[])).rejects.toThrow();
 }
 expect(io.categories).not.toHaveBeenCalled();expect(io.write).not.toHaveBeenCalled();
});
it('locks adjustment policies across separate split-payment approvals after the first save',async()=>{
 const {choices}=await splitCase();const original=io.review.getMockImplementation()!;
 io.review.mockImplementation(async(...args)=>{const r=await original(...args);r.summary.feeCents=100;r.totalCents+=100;r.matchedCharges[0].cents+=100;return r;});
 const r=await service.startPurchaseReview(true,new AbortController().signal);const policies:import('@/lib/types').AdjustmentPolicy[]=[{kind:'fee',mode:'all',method:'equal',items:[]}];
 const selected=[...choices,{id:'',name:''}];
 const p=await service.preparePurchaseApproval(r.reviewId,[false,false],selected,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1,-1]},policies);
 expect(p.totalCents).toBe(1200);await apply(p.approvalId);
 await expect(service.preparePurchaseApproval(r.reviewId,[false,false],selected,true,new AbortController().signal,{chargeIndex:1,assignments:[0,1,-1]},[{...policies[0]!,method:'proportional'}])).rejects.toThrow('allocation changed');
 const next=await service.preparePurchaseApproval(r.reviewId,[false,false],selected,true,new AbortController().signal,{chargeIndex:1,assignments:[0,1,-1]},policies);expect(next.totalCents).toBe(2200);expect(io.write).toHaveBeenCalledOnce();
 await apply(next.approvalId);expect(io.write).toHaveBeenCalledTimes(2);
});

it('honors empty modern policies so tax-only split preview and backend penny weights agree',async()=>{
 const adjusted={...view,items:[1,2,3].map((price,i)=>({title:`Synthetic ${i}`,quantity:1,priceCents:price,cardCents:null})),summary:{subtotalCents:6,feeCents:0,shippingCents:0,taxCents:2,giftCents:0},totalCents:8,matchedCharges:[{date:'2026-01-01',cents:5,eligible:true},{date:'2026-01-02',cents:3,eligible:true}]};
 io.review.mockImplementation(async(_c,_s,capture)=>{capture({...structuredClone(binding),identity:[{productId:'B000000001'},{productId:'B000000002'},{productId:'B000000003'}]});return structuredClone(adjusted);});
 io.categories.mockResolvedValue([...cats,{id:'second',name:'Second',groupName:'Test'}]);io.target.mockResolvedValue({...target,date:'2026-01-01',amount:-50});
 const r=await service.startPurchaseReview(true,new AbortController().signal);
 const p=await service.preparePurchaseApproval(r.reviewId,[false,false,false],[{id:'test-cat',name:'Synthetic category'},{id:'second',name:'Second'},{id:'test-cat',name:'Synthetic category'}],true,new AbortController().signal,{chargeIndex:0,assignments:[0,0,1]},[]);
 expect(p.lines).toEqual([{categoryName:'Synthetic category',cents:1},{categoryName:'Second',cents:4}]);await apply(p.approvalId);expect(io.write.mock.calls[0]![2].map((l:{amountMilliunits:number})=>l.amountMilliunits)).toEqual([-10,-40]);
});

it('records a private session receipt only after verified save, survives review invalidation, and scopes its projection to the selected order and plan',async()=>{
 const sessions=await import('./purchase-session');const p=await prepare();expect(await sessions.getPurchaseOrderSession('synthetic')).toBeNull();
 await apply(p.approvalId);service.invalidatePurchaseApproval();
 const session=await sessions.getPurchaseOrderSession('synthetic');expect(session).toEqual({receipts:[{destination:{planName:'Test Plan',accountName:'Synthetic account'},date:target.date,totalCents:1000,lines:[{categoryName:'Synthetic category',cents:1000}],learningSaved:true}],complete:true,orderTotalCents:1000});
 expect(JSON.stringify(session)).not.toMatch(/test-only-token|test-tx|test-account|B000000001|Synthetic"/);
 session!.receipts[0]!.lines[0]!.cents=1;expect((await sessions.getPurchaseOrderSession('synthetic'))!.receipts[0]!.lines[0]!.cents).toBe(1000);
 await expect(sessions.getPurchaseOrderSession('other')).rejects.toThrow('Select');
 io.settings.mockResolvedValue({...binding.connection,planId:'different-plan'});expect(await sessions.getPurchaseOrderSession('synthetic')).toBeNull();
});
it('distinguishes saving and uncertain writes in session memory without offering another write',async()=>{
 const sessions=await import('./purchase-session');const p=await prepare();let fail!:(error:Error)=>void;
 io.write.mockImplementation(async(_p,_t,_l,_s,send)=>{send('test-only-token');return new Promise((_,reject)=>{fail=reject;});});
 const saving=apply(p.approvalId);await vi.waitFor(()=>expect(fail).toBeDefined());
 expect((await sessions.getPurchaseOrderSession('synthetic'))?.pending?.state).toBe('saving');
 fail(Error('synthetic connection failure'));await expect(saving).rejects.toThrow('Do not retry');
 service.invalidatePurchaseApproval();expect(await sessions.getPurchaseOrderSession('synthetic')).toMatchObject({complete:false,receipts:[],pending:{state:'uncertain',date:target.date,totalCents:1000}});
 await expect(prepare()).rejects.toThrow('already attempted');expect(io.write).toHaveBeenCalledOnce();
});
it('retains the original draft when another order is reviewed and revokes approval on suspension',async()=>{
 const first=await service.startPurchaseReview(true,new AbortController().signal);
 io.review.mockImplementationOnce(async(_c,_s,capture)=>{capture({...structuredClone(binding),detail:{...binding.detail,url:binding.detail.url.replace('synthetic','other')}});return structuredClone(view);});
 const other=await service.startPurchaseReview(true,new AbortController().signal);expect(other.reviewId).not.toBe(first.reviewId);
 const p=await service.preparePurchaseApproval(first.reviewId,[false],cats,true,new AbortController().signal);
 service.invalidatePurchaseApproval(first.reviewId,true);await expect(apply(p.approvalId)).rejects.toThrow();
 await expect(service.preparePurchaseApproval(first.reviewId,[false],cats,true,new AbortController().signal)).resolves.toHaveProperty('approvalId');expect(io.write).not.toHaveBeenCalled();
});
it('preserves the split allocation lock and saved progress while reviewing another order',async()=>{
 const {r,choices}=await splitCase();const original=io.review.getMockImplementation()!;
 const first=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:0,assignments:[0,1]});await apply(first.approvalId);
 io.review.mockImplementationOnce(async(_c,_s,capture)=>{capture({...structuredClone(binding),detail:{...binding.detail,url:binding.detail.url.replace('synthetic','other')}});return structuredClone(view);});
 await service.startPurchaseReview(true,new AbortController().signal);io.review.mockImplementation(original);
 await expect(service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:1,assignments:[1,0]})).rejects.toThrow('allocation changed');
 const next=await service.preparePurchaseApproval(r.reviewId,[false,false],choices,true,new AbortController().signal,{chargeIndex:1,assignments:[0,1]});expect(next.totalCents).toBe(2200);await apply(next.approvalId);
 const sessions=await import('./purchase-session');expect(await sessions.getPurchaseOrderSession('synthetic')).toMatchObject({complete:true,orderTotalCents:3300,receipts:[{totalCents:1100},{totalCents:2200}]});expect(io.write).toHaveBeenCalledTimes(2);
});

it('does not interrupt an approved in-flight save when another review is queued or navigation suspends an initial read',async()=>{
 const p=await prepare();let finish!:()=>void;let signal!:AbortSignal;
 io.write.mockImplementation(async(_p,_t,_l,s,send)=>{signal=s;send('test-only-token');await new Promise<void>(resolve=>{finish=resolve;});});
 const saving=apply(p.approvalId);await vi.waitFor(()=>expect(finish).toBeDefined());
 service.beginPurchaseReview();service.invalidatePurchaseApproval(undefined,true);expect(signal.aborted).toBe(false);
 finish();await expect(saving).resolves.toEqual({learningSaved:true});expect(io.write).toHaveBeenCalledOnce();
 const sessions=await import('./purchase-session');expect((await sessions.getPurchaseOrderSession('synthetic'))?.complete).toBe(true);
});

it('prepares and saves a single-product order with all adjustments to one fresh category, learning only that product',async()=>{
 const single={...view,items:[{...view.items[0]!,priceCents:1000,quantity:2}],totalCents:1785,summary:{subtotalCents:2000,couponCents:200,feeCents:100,shippingCents:300,taxCents:286,giftCents:701}};
 io.review.mockImplementation(async(_c,_s,capture)=>{capture(structuredClone(binding));return structuredClone(single);});io.target.mockResolvedValue({...target,amount:-17850});
 const r=await service.startPurchaseReview(true,new AbortController().signal);
 const p=await service.preparePurchaseApproval(r.reviewId,[false],cats,true,new AbortController().signal,undefined,[]);expect(p.lines).toEqual([{categoryName:'Synthetic category',cents:1785}]);expect(io.write).not.toHaveBeenCalled();
 await apply(p.approvalId);expect(io.write.mock.calls[0]![2]).toEqual([{categoryId:'test-cat',categoryName:'Synthetic category',amountMilliunits:-17850,memo:null}]);
 const learning=await import('./purchase-learning');expect(learning.rememberPurchaseCategories).toHaveBeenLastCalledWith('test-plan',['B000000001'],cats,expect.any(AbortSignal),['Synthetic']);
});
it('prepares separate exact payments for one product, freezes its category and learns from either verified charge',async()=>{
 const saved=new Set<number>();const single={...view,items:[{...view.items[0]!,quantity:2,priceCents:500}],matchedCharges:[{date:'2026-01-01',cents:400,eligible:true},{date:'2026-01-02',cents:600,eligible:true}]};
 io.review.mockImplementation(async(_c,_s,capture)=>{capture({...structuredClone(binding),paymentDate:'2026-01-01'});return {...structuredClone(single),matchedCharges:single.matchedCharges.map((c,i)=>({...c,eligible:!saved.has(i)}))};});
 io.target.mockImplementation(async(_p,date,cents)=>({...target,transactionId:`single-${date}`,date,amount:-cents*10}));
 io.write.mockImplementation(async(_p,t,_l,_s,send)=>{send('test-only-token');saved.add(t.date==='2026-01-01'?0:1);});
 const r=await service.startPurchaseReview(true,new AbortController().signal);
 const p=await service.preparePurchaseApproval(r.reviewId,[false],cats,true,new AbortController().signal,{chargeIndex:1,assignments:[]},[]);expect(p).toMatchObject({totalCents:600,lines:[{categoryName:'Synthetic category',cents:600}]});await apply(p.approvalId);
 const learning=await import('./purchase-learning');expect(learning.rememberPurchaseCategories).toHaveBeenLastCalledWith('test-plan',['B000000001'],cats,expect.any(AbortSignal),['Synthetic']);
 await expect(service.preparePurchaseApproval(r.reviewId,[false],[{id:'other',name:'Other'}],true,new AbortController().signal,{chargeIndex:0,assignments:[]},[])).rejects.toThrow('allocation changed');
 const next=await service.preparePurchaseApproval(r.reviewId,[false],cats,true,new AbortController().signal,{chargeIndex:0,assignments:[]},[]);expect(next.totalCents).toBe(400);expect(io.write).toHaveBeenCalledOnce();await apply(next.approvalId);expect(io.write).toHaveBeenCalledTimes(2);
});
