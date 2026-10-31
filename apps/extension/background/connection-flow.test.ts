import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import type { MessageRequest } from "@/lib/types";
import { getSettings } from "@/lib/settings";
import { embedBatch } from "@/background/embedder";

const api = vi.hoisted(() => ({
  runtime: {
    id: "cartsplit@mcgeeker", getURL: () => "moz-extension://test-only/sidepanel.html",
    onMessage: { addListener: vi.fn() }, onInstalled: { addListener: vi.fn() }, sendMessage: vi.fn(),
  },
  storage: { local: { get: vi.fn(async () => ({ learnedDataAdopted: true })), set: vi.fn() } },
  tabs: { query: vi.fn(), create: vi.fn(), get: vi.fn(), sendMessage: vi.fn(), remove: vi.fn() },
}));
vi.mock("wxt/browser", () => ({ browser: api }));
vi.mock("@/background/embedder", () => ({ embedBatch: vi.fn(async () => {throw Error("Synthetic model unavailable");}) }));
const fetchMock = vi.fn();
const sender = { id: api.runtime.id, url: api.runtime.getURL() };
let listener: (message: unknown, sender: object, response: (value: any) => void) => boolean;
const plans = [{ id: "test-a", name: "API Budget A" }, { id: "test-b", name: "API Budget B" }];
function list() { return new Response(JSON.stringify({ data: { plans } })); }
function send(message: MessageRequest): Promise<any> { return new Promise((resolve) => listener(message, sender, resolve)); }

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const mock of Object.values(api.tabs)) mock.mockReset();
  vi.mocked(embedBatch).mockReset();vi.mocked(embedBatch).mockRejectedValue(Error("Synthetic model unavailable"));
  globalThis.indexedDB = new IDBFactory();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("browser", api);
  vi.stubGlobal("chrome", {});
  vi.stubGlobal("defineBackground", (setup: () => void) => { setup(); return setup; });
  await import("../entrypoints/background");
  listener = api.runtime.onMessage.addListener.mock.calls[0]![0];
});
afterEach(() => vi.unstubAllGlobals());











describe("background connection protocol integration", () => {
  it("validates, returns sanitized status, and commits only the explicitly chosen budget", async () => {
    fetchMock.mockResolvedValueOnce(list());
    expect(await send({ type: "CONNECT_TOKEN", token: "test-only-token" })).toEqual({ plans });
    expect(await send({ type: "GET_SETTINGS" })).toEqual({ hasToken: true, planId: null, planName: null });
    fetchMock.mockResolvedValueOnce(list()).mockResolvedValueOnce(new Response(JSON.stringify({ data: { category_groups: [] } })));
    expect(await send({ type: "SAVE_PLAN", planId: "test-b", planName: "forged name" })).toEqual({ ok: true });
    expect(await send({ type: "GET_SETTINGS" })).toEqual({ hasToken: true, planId: "test-b", planName: "API Budget B" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.ynab.com/v1/plans", "https://api.ynab.com/v1/plans", "https://api.ynab.com/v1/plans/test-b/categories",
    ]);
  });

  it("does not commit inaccessible choices or a choice whose categories fail", async () => {
    fetchMock.mockResolvedValueOnce(list());
    await send({ type: "CONNECT_TOKEN", token: "test-only-token" });
    fetchMock.mockResolvedValueOnce(list());
    expect(await send({ type: "SAVE_PLAN", planId: "unknown", planName: "unknown" })).toHaveProperty("error");
    fetchMock.mockResolvedValueOnce(list()).mockResolvedValueOnce(new Response("test-only-token", { status: 500 }));
    const response = await send({ type: "SAVE_PLAN", planId: "test-a", planName: "Test A" });
    expect(response).toHaveProperty("error");
    expect(JSON.stringify(response)).not.toContain("test-only-token");
    expect((await getSettings()).planId).toBeNull();
  });

  it("serializes removal after an in-flight validation so it cannot restore a removed token", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
    const connecting = send({ type: "CONNECT_TOKEN", token: "test-only-token" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const removing = send({ type: "CLEAR_SETTINGS" });
    finish(list());
    await connecting;
    expect(await removing).toEqual({ ok: true });
    expect(await send({ type: "GET_SETTINGS" })).toEqual({ hasToken: false, planId: null, planName: null });
  });
});

it("aborts real request signals before clearing, and does not save a pending token", async () => {
  let signal!: AbortSignal;
  fetchMock.mockImplementationOnce((_url, options) => {
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  const connecting = send({ type: "CONNECT_TOKEN", token: "test-only-token" });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(await send({ type: "CLEAR_SETTINGS" })).toEqual({ ok: true });
  expect(signal.aborted).toBe(true);
  expect(await connecting).toEqual({ error: "Connection request canceled." });
  expect(await send({ type: "GET_SETTINGS" })).toEqual({ hasToken: false, planId: null, planName: null });
});

it("blocks transaction actions and bulk backfill in the actual background router", async () => {
  for (const type of ["SYNC", "START_BACKFILL", "APPROVE_TRANSACTION", "APPROVE_BATCH"] as const) {
    expect(await send({ type } as unknown as MessageRequest)).toEqual({ error: expect.stringContaining("Unknown extension request") });
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it("cancels category refresh before a delayed response can modify the cache", async () => {
  fetchMock.mockResolvedValueOnce(list());
  await send({ type: "CONNECT_TOKEN", token: "test-only-token" });
  fetchMock.mockResolvedValueOnce(list()).mockResolvedValueOnce(new Response(JSON.stringify({ data: { category_groups: [] } })));
  await send({ type: "SAVE_PLAN", planId: "test-a", planName: "Test A" });
  let finish!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
  const refreshing = send({ type: "REFRESH_CATEGORIES" });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  const removing = send({ type: "CLEAR_SETTINGS" });
  finish(new Response(JSON.stringify({ data: { category_groups: [{ name: "Late data", hidden: false, deleted: false,
    categories: [{ id: "test-late", name: "Late category", hidden: false, deleted: false }] }] } })));
  expect(await refreshing).toEqual({ error: "Connection request canceled." });
  expect(await removing).toEqual({ ok: true });
  expect(await send({ type: "GET_CATEGORIES" })).toEqual({ categories: [] });
});


it("previews and clears only local data after disconnect, requiring consent and doing no network I/O", async () => {
  const settings = await import("@/lib/settings"); const db = await import("@/lib/db");
  await settings.saveSettings({ accessToken: "test-only-token", planId: "test-a", planName: "Test" });
  await db.putCategories([{ id: "test-cat", name: "Test", groupName: "Test" }]);
  expect(await send({ type: "PREVIEW_LOCAL_DATA_DELETE" })).toHaveProperty("error", expect.stringContaining("Disconnect"));
  await send({ type: "CLEAR_SETTINGS" });
  const { preview } = await send({ type: "PREVIEW_LOCAL_DATA_DELETE" });
  expect(preview.counts).toEqual({ allocatedTransactions: 0, learnedProducts: 0, productEmbeddings: 0, categories: 1 });
  expect(JSON.stringify(preview)).not.toMatch(/test-only-token|test-cat/);
  expect(await send({ type: "DELETE_LOCAL_DATA", approvalId: preview.approvalId, confirmed: false })).toHaveProperty("error");
  expect(await db.getAllCategories()).toHaveLength(1);
  expect(await send({ type: "DELETE_LOCAL_DATA", approvalId: preview.approvalId, confirmed: true })).toEqual({ ok: true,
    counts: { allocatedTransactions: 0, learnedProducts: 0, productEmbeddings: 0, categories: 0 } });
  expect(await db.getAllCategories()).toEqual([]);
  expect(await send({ type: "GET_SETTINGS" })).toEqual({ hasToken: false, planId: null, planName: null });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not delete local records if their identifiers changed after the preview", async () => {
  const db = await import("@/lib/db");
  await db.putCategories([{ id: "before", name: "Before", groupName: "Test" }]);
  const { preview } = await send({ type: "PREVIEW_LOCAL_DATA_DELETE" });
  await db.putCategories([{ id: "after", name: "After", groupName: "Test" }]);
  expect(await send({ type: "DELETE_LOCAL_DATA", approvalId: preview.approvalId, confirmed: true })).toHaveProperty("error", expect.stringContaining("records changed"));
  expect((await db.getAllCategories())[0]?.id).toBe("after"); expect(fetchMock).not.toHaveBeenCalled();
});

it("revokes a cleanup preview when a new connection attempt starts", async () => {
  const db = await import("@/lib/db"); await db.putCategories([{ id: "before", name: "Before", groupName: "Test" }]);
  const { preview } = await send({ type: "PREVIEW_LOCAL_DATA_DELETE" });
  await send({ type: "CONNECT_TOKEN", token: "" });
  expect(await send({ type: "DELETE_LOCAL_DATA", approvalId: preview.approvalId, confirmed: true })).toHaveProperty("error", expect.stringContaining("expired"));
  expect(await db.getAllCategories()).toHaveLength(1); expect(fetchMock).not.toHaveBeenCalled();
});







async function fixedCanadianApprovalCase({planId='test-plan',planName='Test Plan',accountName='Lineitem Test',accountType='cash',importId=null,matchedId=null,dateOffsetDays=0}:{planId?:string;planName?:string;accountName?:string;accountType?:string;importId?:string|null;matchedId?:string|null;dateOffsetDays?:number}={}) {
  const date = new Date().toISOString().slice(0,10);
  const day=Date.parse(`${date}T00:00:00Z`);
  const transactionDate=new Date(day+dateOffsetDays*86400000).toISOString().slice(0,10);
  const sinceDate=new Date(day-2*86400000).toISOString().slice(0,10);
  const db = await import('@/lib/db');
  await (await import('@/lib/settings')).saveSettings({accessToken:'test-only-token',planId,planName});
  const detailUrl='https://www.amazon.ca/your-orders/order-details?orderID=synthetic-fixed';
  const paymentsUrl='https://www.amazon.ca/cpe/yourpayments/transactions';
  api.tabs.query.mockImplementation(async (q:{active?:boolean})=>q.active?[{id:51,url:detailUrl}]:[{id:52,url:paymentsUrl}]);
  api.tabs.get.mockImplementation(async(id:number)=>({url:id===51?detailUrl:paymentsUrl}));
  api.tabs.sendMessage.mockImplementation(async(_id:number,m:{type:string})=>m.type==='READ_CA_FUNDED_ORDER'?{
    orderId:'synthetic-fixed',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic first',cents:1133},{productId:'B000000002',title:'Synthetic second',cents:16999}],
    funding:{subtotalCents:18132,beforeTaxCents:18192,taxCents:2365,giftCardCents:500,cardChargeCents:20057,feeCents:60}
  }:m.type==='READ_CA_PREVIEW_PAYMENTS'?[{orderId:'synthetic-fixed',date,amountCents:20057,refund:false,currency:'unspecified'}]:{matches:true});
  const tx={id:'test-ca-tx',account_id:'test-account',date:transactionDate,amount:-200570,payee_name:'Amazon.ca',payee_id:'test-payee',memo:'Synthetic preserved memo',flag_color:null,category_id:null,approved:true,cleared:'uncleared',deleted:false,subtransactions:[],import_id:importId,matched_transaction_id:matchedId};
  fetchMock.mockImplementation(async(url:string,o:RequestInit)=>{
    let data:object;
    if(o.method==='PUT'){const update=JSON.parse(o.body as string).transaction;data={transaction:{...tx,...update,subtransactions:update.subtransactions?update.subtransactions.map((l:object)=>({...l,deleted:false})):tx.subtransactions}};}
    else if(url.endsWith('/plans')) data={plans:[{id:planId,name:planName,currency_format:{iso_code:'CAD'}}]};
    else if(url.endsWith('/accounts')) data={accounts:[{id:'test-account',name:accountName,type:accountType,direct_import_linked:accountType==='creditCard',on_budget:true,closed:false,deleted:false}]};
    else if(url.includes('/transactions?since_date=')) data={transactions:[tx]};
    else if(url.endsWith('/categories')) data={category_groups:[{name:'Test',hidden:false,deleted:false,categories:[{id:'test-grocery',name:'🛒 Groceries',hidden:false,deleted:false},{id:'test-other',name:'❗️ Stuff I forgot to plan for',hidden:false,deleted:false}]}]};
    else throw new Error('Unexpected fake route');
    return new Response(JSON.stringify({data}));
  });
  return {date,db,transactionDate,sinceDate};
}

it.each([-2,-1,0,1,2])('reviews and separately saves an imported household purchase with bank date offset %i through the actual router',async dateOffsetDays=>{
 const destination={planName:'Synthetic household plan',accountName:'Synthetic Visa'};
 const {date,transactionDate}=await fixedCanadianApprovalCase({planId:'synthetic-household',...destination,accountType:'creditCard',importId:'synthetic-import',matchedId:'synthetic-match',dateOffsetDays});
 const old=api.tabs.sendMessage.getMockImplementation()!;
 api.tabs.sendMessage.mockImplementation(async(id:number,m:{type:string})=>m.type==='READ_CA_ORDER_SUMMARY'?{
  orderId:'synthetic-fixed',currency:'unspecified',items:[{title:'Synthetic household purchase',productId:'B000000001',priceCents:20057,quantity:1,lineCents:20057}],
  subtotalCents:20057,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:20057
 }:old(id,m));
 const {review}=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});
 expect(review).toMatchObject({planName:destination.planName,totalCents:20057});
 const {preview}=await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:review.reviewId,lineTotals:[false],categories:[{id:'test-grocery',name:'🛒 Groceries'}],confirmed:true,adjustments:[]});
 expect(preview).toMatchObject({destination,date:transactionDate,paymentDate:date,totalCents:20057});
 expect(JSON.stringify(preview)).not.toMatch(/test-only-token|test-account|synthetic-import|synthetic-match/);
 expect(await send({type:'APPLY_PURCHASE_APPROVAL',approvalId:preview.approvalId,confirmed:false})).toHaveProperty('error');
 expect(fetchMock.mock.calls.filter(([,o])=>o.method==='PUT')).toHaveLength(0);
 expect(await send({type:'APPLY_PURCHASE_APPROVAL',approvalId:preview.approvalId,confirmed:true})).toMatchObject({ok:true});
 const writes=fetchMock.mock.calls.filter(([,o])=>o.method==='PUT');expect(writes).toHaveLength(1);
 expect(writes[0]![0]).toBe('https://api.ynab.com/v1/plans/synthetic-household/transactions/test-ca-tx');
 expect(JSON.parse(writes[0]![1].body)).toEqual({transaction:{category_id:'test-grocery',approved:true}});
 expect(await send({type:'GET_PURCHASE_ORDER_SESSION',orderKey:'synthetic-fixed'})).toMatchObject({session:{complete:true,receipts:[{destination,date:transactionDate,totalCents:20057}]}});
 expect(await send({type:'APPLY_PURCHASE_APPROVAL',approvalId:preview.approvalId,confirmed:true})).toHaveProperty('error');
 expect(fetchMock.mock.calls.filter(([,o])=>o.method==='PUT')).toHaveLength(1);
 expect(fetchMock.mock.calls.every(([url])=>url.endsWith('/plans')||url.startsWith('https://api.ynab.com/v1/plans/synthetic-household/'))).toBe(true);
});

it('checks YNAB eligibility before category GET during automatic review and rejects content-script callers',async()=>{
 const {sinceDate,db}=await fixedCanadianApprovalCase();const before=await db.captureLocalData();
 const oldMessage=api.tabs.sendMessage.getMockImplementation()!;
 api.tabs.sendMessage.mockImplementation(async(id:number,m:{type:string})=>m.type==='READ_CA_ORDER_SUMMARY'?{orderId:'synthetic-fixed',currency:'unspecified',items:[{title:'Synthetic first',productId:'B000000001',priceCents:1133,quantity:1,lineCents:1133},{title:'Synthetic second',productId:'B000000002',priceCents:16999,quantity:1,lineCents:16999}],subtotalCents:18132,shippingCents:0,feeCents:60,taxCents:2365,giftCents:500,totalCents:20057,itemsReconciled:true}:oldMessage(id,m));
 const command:MessageRequest={type:'REVIEW_CA_PURCHASE',confirmed:true};
 const denied=await new Promise<any>(resolve=>listener(command,{...sender,tab:{id:51}},resolve));expect(denied).toHaveProperty('error');expect(fetchMock).not.toHaveBeenCalled();
 const r=await send(command);expect(r.review).toMatchObject({items:[{title:'Synthetic first',cardCents:null,quantity:1},{title:'Synthetic second',cardCents:null,quantity:1}],totalCents:20057,allocationPending:true,summary:{feeCents:60,giftCents:500}});
 expect(JSON.stringify(r)).not.toMatch(/test-only-token|test-account|transactionId|B00000000/);
 expect(fetchMock.mock.calls.map(([url])=>url.replace('https://api.ynab.com/v1',''))).toEqual(['/plans',"/plans/test-plan/accounts",`/plans/test-plan/transactions?since_date=${sinceDate}`,"/plans/test-plan/categories"]);
 expect((await db.captureLocalData()).counts).toEqual(before.counts);
});
it('routes approved parent and product memos through one verified repeated-category save and receipt',async()=>{
 await fixedCanadianApprovalCase();const old=api.tabs.sendMessage.getMockImplementation()!;
 api.tabs.sendMessage.mockImplementation(async(id:number,m:{type:string})=>m.type==='READ_CA_ORDER_SUMMARY'?{orderId:'synthetic-fixed',currency:'unspecified',items:[{title:'Synthetic first',productId:'B000000001',priceCents:1133,quantity:1,lineCents:1133},{title:'Synthetic second',productId:'B000000002',priceCents:18924,quantity:1,lineCents:18924}],subtotalCents:20057,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:20057}:old(id,m));
 const {review}=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});expect(review.transactionMemo).toBe('Synthetic preserved memo');
 const memos={transaction:'Synthetic preserved memo\nAmazon.ca order synthetic-fixed: https://www.amazon.ca/your-orders/order-details?orderID=synthetic-fixed',lines:['First product','Second product']};
 const {preview}=await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:review.reviewId,lineTotals:[false,false],categories:[{id:'test-grocery',name:'🛒 Groceries'},{id:'test-grocery',name:'🛒 Groceries'}],confirmed:true,adjustments:[],memos});
 expect(preview).toMatchObject({memo:memos.transaction,lines:[{cents:1133,memo:'First product'},{cents:18924,memo:'Second product'}]});
 expect(await send({type:'APPLY_PURCHASE_APPROVAL',approvalId:preview.approvalId,confirmed:true})).toMatchObject({ok:true});
 const writes=fetchMock.mock.calls.filter(([,options])=>options.method==='PUT');expect(writes).toHaveLength(1);
 expect(JSON.parse(writes[0]![1].body).transaction).toMatchObject({memo:memos.transaction,category_id:null,subtransactions:[{category_id:'test-grocery',amount:-11330,memo:'First product'},{category_id:'test-grocery',amount:-189240,memo:'Second product'}]});
 expect(await send({type:'GET_PURCHASE_ORDER_SESSION',orderKey:'synthetic-fixed'})).toMatchObject({session:{complete:true,receipts:[{memo:memos.transaction,lines:[{memo:'First product'},{memo:'Second product'}]}]}});
});

it('prepares and saves reusable automatic review through actual routing, then learns and suggests exact products',async()=>{
 const {db}=await fixedCanadianApprovalCase();const before=await db.captureLocalData();
 const axis=(second:boolean)=>{const v=new Float32Array(384);v[second?1:0]=1;return v;};
 vi.mocked(embedBatch).mockImplementation(async texts=>texts.map(t=>axis(t==='Synthetic second'||t.includes('Stuff I forgot'))));
 const old=api.tabs.sendMessage.getMockImplementation()!;
 let useNewProduct=false;
 api.tabs.sendMessage.mockImplementation(async(id:number,m:{type:string})=>m.type==='READ_CA_ORDER_SUMMARY'?{orderId:'synthetic-fixed',currency:'unspecified',items:[{title:'Synthetic first',productId:useNewProduct?'B000000003':'B000000001',priceCents:1133,quantity:1,lineCents:1133},{title:'Synthetic second',productId:'B000000002',priceCents:16999,quantity:1,lineCents:16999}],subtotalCents:18132,shippingCents:0,feeCents:60,taxCents:2365,giftCents:500,totalCents:20057,itemsReconciled:true}:old(id,m));
 const {review}=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});expect(fetchMock).toHaveBeenCalledTimes(4);expect(fetchMock.mock.calls[3]![0]).toContain('/categories');
 expect(review.items.map((i:{suggestionSource:string})=>i.suggestionSource)).toEqual(['model','model']);
 expect((await db.captureLocalData()).counts).toEqual(before.counts);
 const categories=[{id:'test-grocery',name:'🛒 Groceries'},{id:'test-other',name:'❗️ Stuff I forgot to plan for'},{id:'test-other',name:'❗️ Stuff I forgot to plan for'}];
 const {preview}=await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:review.reviewId,lineTotals:[false,false],categories,confirmed:true});
 expect(preview).toMatchObject({totalCents:20057});expect(preview.lines.reduce((n:number,l:{cents:number})=>n+l.cents,0)).toBe(20057);
 expect(JSON.stringify(preview)).not.toMatch(/test-only-token|test-account|test-ca-tx|B000000001/);
 const command:MessageRequest={type:'APPLY_PURCHASE_APPROVAL',approvalId:preview.approvalId,confirmed:true};
 expect(await send({...command,confirmed:false})).toMatchObject({uncertain:false});
 expect(await send(command)).toEqual({ok:true,learningSaved:true});expect(await send(command)).toMatchObject({uncertain:false});
 const writes=fetchMock.mock.calls.filter(([,o])=>o.method==='PUT');expect(writes).toHaveLength(1);
 const update=JSON.parse(writes[0]![1].body).transaction;expect(Object.keys(update).sort()).toEqual(['approved','category_id','subtransactions']);expect(update.approved).toBe(true);expect(update.subtransactions).toHaveLength(3);expect(update.subtransactions.reduce((n:number,l:{amount:number})=>n+l.amount,0)).toBe(-200570);expect(update.subtransactions.every((l:{memo:unknown})=>l.memo===null)).toBe(true);
 expect((await db.captureLocalData()).counts).toEqual({...before.counts,learnedProducts:before.counts.learnedProducts+2,productEmbeddings:before.counts.productEmbeddings+2});
 const next=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});expect(next.review.items.map((i:{suggestedCategoryId:string})=>i.suggestedCategoryId)).toEqual(['test-grocery','test-other']);
 expect(next.review.items.map((i:{suggestionSource:string})=>i.suggestionSource)).toEqual(['exact','exact']);
 useNewProduct=true;const similar=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});
 expect(similar.review.items[0]).toMatchObject({suggestedCategoryId:'test-grocery',suggestionSource:'history'});
 expect(fetchMock.mock.calls.filter(([,o])=>o.method==='PUT')).toHaveLength(1);
 expect((await db.getLearnedProduct('test-plan:amazon-ca-reviewed:B000000001'))).toEqual({id:'test-plan:amazon-ca-reviewed:B000000001',planId:'test-plan',categoryId:'test-grocery'});
});
it.each(['GET_PURCHASE_ORDER_SESSION','SUSPEND_PURCHASE_REVIEW','GET_PURCHASE_REVIEW_TAB','REOPEN_PURCHASE_REVIEW_TAB','PREPARE_PURCHASE_APPROVAL','APPLY_PURCHASE_APPROVAL','CANCEL_PURCHASE_APPROVAL'])('rejects reusable approval %s from a content script',async type=>{
 const r=await new Promise<any>(resolve=>listener({type},{...sender,tab:{id:1}},resolve));expect(r.error).toContain('extension sidebar');expect(fetchMock).not.toHaveBeenCalled();
});

it.each(['CANCEL_PURCHASE_APPROVAL','SUSPEND_PURCHASE_REVIEW'] as const)('%s cancels an active initial review before an id exists and ignores late page data',async type=>{
 const {db}=await fixedCanadianApprovalCase();const before=await db.captureLocalData();
 let finish!:(reply:unknown)=>void;api.tabs.sendMessage.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const reading=send({type:'REVIEW_CA_PURCHASE',confirmed:true});
 await vi.waitFor(()=>expect(api.tabs.sendMessage).toHaveBeenCalledOnce());
 expect(await send({type})).toEqual({ok:true});expect(await reading).toHaveProperty('error');
 finish({orderId:'late-private-order'});await Promise.resolve();
 expect(api.tabs.sendMessage).toHaveBeenCalledOnce();expect(api.tabs.get).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();
 expect(await send({type:'GET_SETTINGS'})).toEqual({hasToken:true,planId:'test-plan',planName:'Test Plan'});
 expect((await db.captureLocalData()).counts).toEqual(before.counts);
});

it('aborts an active preparation category GET through the actual router without creating approval or writing',async()=>{
 const {db}=await fixedCanadianApprovalCase();const before=await db.captureLocalData();const old=api.tabs.sendMessage.getMockImplementation()!;
 api.tabs.sendMessage.mockImplementation(async(id:number,m:{type:string})=>m.type==='READ_CA_ORDER_SUMMARY'?{orderId:'synthetic-fixed',currency:'unspecified',items:[{title:'Synthetic first',productId:'B000000001',priceCents:1133,quantity:1,lineCents:1133},{title:'Synthetic second',productId:'B000000002',priceCents:16999,quantity:1,lineCents:16999}],subtotalCents:18132,shippingCents:0,feeCents:60,taxCents:2365,giftCents:500,totalCents:20057}:old(id,m));
 const {review}=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});fetchMock.mockClear();
 let requestSignal!:AbortSignal;
 fetchMock.mockImplementationOnce((_url:string,options:RequestInit)=>{requestSignal=options.signal!;return new Promise((_resolve,reject)=>requestSignal.addEventListener('abort',()=>reject(requestSignal.reason),{once:true}));});
 const categories=[{id:'test-grocery',name:'🛒 Groceries'},{id:'test-other',name:'❗️ Stuff I forgot to plan for'},{id:'test-other',name:'❗️ Stuff I forgot to plan for'}];
 const preparing=send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:review.reviewId,lineTotals:[false,false],categories,confirmed:true});
 await vi.waitFor(()=>expect(requestSignal).toBeDefined());
 expect(await send({type:'CANCEL_PURCHASE_APPROVAL',id:review.reviewId})).toEqual({ok:true});expect(requestSignal.aborted).toBe(true);
 const response=await preparing;expect(response).toHaveProperty('error');expect(response).not.toHaveProperty('preview');
 expect(await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:review.reviewId,lineTotals:[false,false],categories,confirmed:true})).toHaveProperty('error');
 expect(fetchMock).toHaveBeenCalledOnce();expect(fetchMock.mock.calls[0]![1].method??'GET').toBe('GET');
 expect(await send({type:'GET_SETTINGS'})).toEqual({hasToken:true,planId:'test-plan',planName:'Test Plan'});
 expect((await db.captureLocalData()).counts).toEqual(before.counts);
});

it.each(['missing','categorized','split'] as const)('returns a safe early review reason for a %s target without any write',async mode=>{
 await fixedCanadianApprovalCase();const oldPage=api.tabs.sendMessage.getMockImplementation()!;
 api.tabs.sendMessage.mockImplementation(async(id:number,m:{type:string})=>m.type==='READ_CA_ORDER_SUMMARY'?{orderId:'synthetic-fixed',currency:'unspecified',items:[{title:'Synthetic first',productId:'B000000001',priceCents:1133,quantity:1,lineCents:1133},{title:'Synthetic second',productId:'B000000002',priceCents:16999,quantity:1,lineCents:16999}],subtotalCents:18132,shippingCents:0,feeCents:60,taxCents:2365,giftCents:500,totalCents:20057,itemsReconciled:true}:oldPage(id,m));
 const original=fetchMock.getMockImplementation()!;
 fetchMock.mockImplementation(async(url:string,options:RequestInit)=>{
  const response=await original(url,options);
  if(url.includes('/transactions?')){const body=await response.json();const rows=body.data.transactions;
   if(mode==='missing')body.data.transactions=[];
   else for(const row of rows){if(mode==='categorized')row.category_id='synthetic-category';else row.subtransactions=[{category_id:'synthetic-category',amount:row.amount}];}
   return new Response(JSON.stringify(body));}
  return response;
 });
 const result=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});
 expect(result.reason).toBe(mode==='missing'?'candidate-not-found':mode==='categorized'?'targetCategorized':'targetSplit');
 expect(result.review).toBeUndefined();expect(embedBatch).not.toHaveBeenCalled();
 expect(fetchMock.mock.calls.some(([url])=>url.endsWith('/categories'))).toBe(false);
 expect(JSON.stringify(result)).not.toMatch(/test-only-token|test-account|synthetic-fixed|synthetic-category/);
 expect(fetchMock.mock.calls.every(([,o])=>!o.method||o.method==='GET')).toBe(true);
});

it('routes split-shipment matching as separate eligible charges and includes product suggestions but blocks incomplete allocation',async()=>{
 await fixedCanadianApprovalCase();
 api.tabs.sendMessage.mockImplementation(async(_id:number,m:{type:string})=>m.type==='READ_CA_ORDER_SUMMARY'?{orderId:'synthetic-fixed',currency:'unspecified',items:[{title:'Synthetic first',productId:'B000000001',priceCents:4000,quantity:1,lineCents:4000},{title:'Synthetic second',productId:'B000000002',priceCents:6000,quantity:1,lineCents:6000}],subtotalCents:10000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:10000}:m.type==='READ_CA_PREVIEW_PAYMENTS'?[{orderId:'synthetic-fixed',date:'2026-01-01',amountCents:4000,refund:false,currency:'unspecified'},{orderId:'synthetic-fixed',date:'2026-01-03',amountCents:6000,refund:false,currency:'unspecified'}]:{matches:true});
 const original=fetchMock.getMockImplementation()!;let first:any,second:any;
 fetchMock.mockImplementation(async(url:string,o:RequestInit)=>{
  if(o.method==='PUT'){const target=url.endsWith('/synthetic-first')?first:second;Object.assign(target,JSON.parse(o.body as string).transaction);return new Response(JSON.stringify({data:{transaction:target}}));}
  const response=await original(url,o);
  if(url.includes('/transactions?')){const body=await response.json(),base=body.data.transactions[0];first??={...base,id:'synthetic-first',date:'2026-01-01',amount:-40000};second??={...base,id:'synthetic-second',date:'2026-01-03',amount:-60000};body.data.transactions=[first,second];return new Response(JSON.stringify(body));}return response;
 });
 const {review,error}=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});expect(error).toBeUndefined();
 expect(review.matchedCharges).toEqual([{date:'2026-01-01',cents:4000,eligible:true,memo:'Synthetic preserved memo'},{date:'2026-01-03',cents:6000,eligible:true,memo:'Synthetic preserved memo'}]);expect(review.items).toHaveLength(2);expect(fetchMock.mock.calls.some(([url])=>url.endsWith('/categories'))).toBe(true);
 const prepared=await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:review.reviewId,lineTotals:[],categories:[],confirmed:true});expect(prepared.error).toBeTruthy();expect(prepared.preview).toBeUndefined();
 expect(fetchMock.mock.calls.every(([,o])=>!o.method||o.method==='GET')).toBe(true);expect(JSON.stringify(review)).not.toMatch(/test-only-token|synthetic-first|synthetic-second|test-account/);
 const categories=[{id:'test-grocery',name:'🛒 Groceries'},{id:'test-other',name:'❗️ Stuff I forgot to plan for'}];
 const {preview}=await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:review.reviewId,lineTotals:[false,false],categories,confirmed:true,split:{chargeIndex:0,assignments:[0,1]}});expect(preview).toMatchObject({totalCents:4000,date:'2026-01-01'});
 expect(await send({type:'APPLY_PURCHASE_APPROVAL',approvalId:preview.approvalId,confirmed:true})).toEqual({ok:true,learningSaved:true,savedChargeIndex:0});
 const writes=fetchMock.mock.calls.filter(([,o])=>o.method==='PUT');expect(writes).toHaveLength(1);expect(writes[0]![0]).toContain('/synthetic-first');expect(second.category_id).toBeNull();
 const {preview:next}=await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:review.reviewId,lineTotals:[false,false],categories,confirmed:true,split:{chargeIndex:1,assignments:[0,1]}});expect(next).toMatchObject({totalCents:6000,date:'2026-01-03'});expect(fetchMock.mock.calls.filter(([,o])=>o.method==='PUT')).toHaveLength(1);
 const db=await import('@/lib/db');expect(await db.getLearnedProduct('test-plan:amazon-ca-reviewed:B000000002')).toBeUndefined();
 const resumed=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});expect(resumed.review.matchedCharges[0].eligible).toBe(false);expect(resumed.review.matchedCharges[1].eligible).toBe(true);

});

it.each([{labels:true,modern:false},{labels:false,modern:false},{labels:false,modern:true}])('matches only the full card remainder for quantity-two orders (labels=$labels, shared adjustments=$modern)',async({labels,modern})=>{
 const {date}=await fixedCanadianApprovalCase();
 api.tabs.sendMessage.mockImplementation(async(_id:number,m:{type:string})=>m.type==='READ_CA_ORDER_SUMMARY'?{orderId:'synthetic-fixed',currency:'unspecified',items:[{title:'Synthetic quantity item',productId:'B000000001',priceCents:600,quantity:2,lineCents:null},{title:'Synthetic other',productId:'B000000002',priceCents:16932,quantity:1,lineCents:16932}],subtotalCents:18132,shippingCents:0,feeCents:60,taxCents:2365,giftCents:500,totalCents:20057}:m.type==='READ_CA_PREVIEW_PAYMENTS'?[{orderId:'synthetic-fixed',date,amountCents:20057,refund:false,currency:'unspecified',...(labels?{funding:'card'}:{})},{orderId:'synthetic-fixed',date,amountCents:500,refund:false,currency:'unspecified',...(labels?{funding:'gift_card'}:{})}]:{matches:true});
 const result=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});expect(result.error).toBeUndefined();expect(result.review).toMatchObject({totalCents:20057,items:[{quantity:2},{quantity:1}]});expect(result.review.matchedCharges).toBeUndefined();
 expect(fetchMock).toHaveBeenCalledTimes(4);expect(fetchMock.mock.calls.every(([,o])=>!o.method||o.method==='GET')).toBe(true);
 if(!labels){
  const categories=[{id:'test-grocery',name:'🛒 Groceries'},{id:'test-other',name:'❗️ Stuff I forgot to plan for'},modern?{id:'',name:''}:{id:'test-other',name:'❗️ Stuff I forgot to plan for'}];
  const adjustments:import('@/lib/types').AdjustmentPolicy[]=[{kind:'fee',mode:'selected',method:'equal',items:[0]},{kind:'gift',mode:'selected',method:'proportional',items:[1]}];
  if(modern){const invalid=await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:result.review.reviewId,lineTotals:[true,false],categories,confirmed:true,adjustments:[adjustments[0]!,{...adjustments[1]!,items:[]}]});expect(invalid.error).toContain('Select at least one item');expect(invalid.preview).toBeUndefined();}
  const {preview}=await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:result.review.reviewId,lineTotals:[true,false],categories,confirmed:true,...(modern?{adjustments}:{})});
  expect(preview).toMatchObject({totalCents:20057,date});if(modern)expect(preview.lines).toEqual([{categoryName:'🛒 Groceries',cents:1424},{categoryName:'❗️ Stuff I forgot to plan for',cents:18633}]);expect(fetchMock.mock.calls.some(([,o])=>o.method==='PUT')).toBe(false);
  expect(await send({type:'APPLY_PURCHASE_APPROVAL',approvalId:preview.approvalId,confirmed:true})).toEqual({ok:true,learningSaved:true});
  const writes=fetchMock.mock.calls.filter(([,o])=>o.method==='PUT');expect(writes).toHaveLength(1);expect(writes[0]![0]).toContain('/transactions/test-ca-tx');
  expect(JSON.parse(writes[0]![1].body).transaction.subtransactions.reduce((n:number,l:{amount:number})=>n+l.amount,0)).toBe(-200570);
  if(modern){const saved=await send({type:'GET_PURCHASE_ORDER_SESSION',orderKey:'synthetic-fixed'});expect(saved.session).toMatchObject({complete:true,receipts:[{totalCents:20057}],orderTotalCents:20057});expect(JSON.stringify(saved)).not.toMatch(/test-only-token|test-ca-tx|B000000001|Synthetic quantity item/);}
 }
});

it('prepares a sole product with quantities and adjustments as one direct YNAB category update, without a split',async()=>{
 const {db}=await fixedCanadianApprovalCase();const old=api.tabs.sendMessage.getMockImplementation()!;
 api.tabs.sendMessage.mockImplementation(async(id:number,m:{type:string})=>m.type==='READ_CA_ORDER_SUMMARY'?{orderId:'synthetic-fixed',currency:'unspecified',items:[{title:'Synthetic sole product',productId:'B000000001',priceCents:10000,quantity:2,lineCents:null}],subtotalCents:20000,shippingCents:200,shippingChargeCents:500,shippingCreditCents:300,couponCents:1000,feeCents:100,taxCents:1257,giftCents:500,totalCents:20057}:old(id,m));
 const {review,error}=await send({type:'REVIEW_CA_PURCHASE',confirmed:true});expect(error).toBeUndefined();expect(review.items).toHaveLength(1);
 const {preview}=await send({type:'PREPARE_PURCHASE_APPROVAL',reviewId:review.reviewId,lineTotals:[false],categories:[{id:'test-grocery',name:'🛒 Groceries'}],confirmed:true,adjustments:[]});
 expect(preview.lines).toEqual([{categoryName:'🛒 Groceries',cents:20057}]);expect(fetchMock.mock.calls.some(([,o])=>o.method==='PUT')).toBe(false);
 expect(await send({type:'APPLY_PURCHASE_APPROVAL',approvalId:preview.approvalId,confirmed:false})).toMatchObject({uncertain:false});
 expect(await send({type:'APPLY_PURCHASE_APPROVAL',approvalId:preview.approvalId,confirmed:true})).toMatchObject({ok:true,learningSaved:true});
 const writes=fetchMock.mock.calls.filter(([,o])=>o.method==='PUT');expect(writes).toHaveLength(1);const update=JSON.parse(writes[0]![1].body).transaction;
 expect(update).toEqual({category_id:'test-grocery',approved:true});expect(update).not.toHaveProperty('subtransactions');
 expect(await db.getLearnedProduct('test-plan:amazon-ca-reviewed:B000000001')).toMatchObject({categoryId:'test-grocery'});
 const saved=await send({type:'GET_PURCHASE_ORDER_SESSION',orderKey:'synthetic-fixed'});expect(saved.session).toMatchObject({complete:true,receipts:[{totalCents:20057,lines:[{categoryName:'🛒 Groceries',cents:20057}]}]});
});
