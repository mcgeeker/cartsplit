import {beforeEach,expect,it,vi} from 'vitest';
const io=vi.hoisted(()=>({settings:vi.fn(),query:vi.fn(),compare:vi.fn(),target:vi.fn(),get:vi.fn(),lookup:vi.fn()}));
vi.mock('./order-lookup',()=>({lookupPaymentsForOrder:io.lookup}));
vi.mock('@/lib/ynab',()=>({getReviewedTarget:io.target,inspectReviewedCharge:io.target}));
vi.mock('@/lib/settings',()=>({getSettings:io.settings}));vi.mock('wxt/browser',()=>({browser:{tabs:{query:io.query,get:io.get}}}));vi.mock('./page-request',async original=>({...await original<object>(),requestOrderPage:io.compare}));
import {reviewSelectedOrder} from './order-review';
import {OrderPageRequestError} from './page-request';
beforeEach(()=>{vi.resetAllMocks();io.settings.mockResolvedValue({accessToken:'test-only-token',planId:'test-plan',planName:'Test Plan'});io.query.mockResolvedValue([{id:1,url:'https://www.amazon.ca/your-orders/order-details?orderID=synthetic'}]);});
const run=()=>reviewSelectedOrder(true,new AbortController().signal);
it('identifies an incorrect selected tab before any page read',async()=>{io.query.mockResolvedValue([{id:1,url:'https://www.amazon.ca/cpe/yourpayments/transactions'}]);await expect(run()).rejects.toMatchObject({stage:'tab'});expect(io.compare).not.toHaveBeenCalled();});
it.each(['gst','shipping','items'])('preserves closed reader failure %s without exposing private values',async stage=>{io.compare.mockResolvedValue({orderReadFailure:stage,private:'private-product'});const e=await run().catch(e=>e);expect(e.stage).toBe(stage);expect(e.message).not.toContain('private-product');});
it('hides arbitrary browser errors behind a read-stage diagnostic',async()=>{io.compare.mockRejectedValue(new Error('private-product test-only-token'));const e=await run().catch(e=>e);expect(e.stage).toBe('read');expect(e.message).not.toMatch(/private-product|test-only-token/);});

it.each(['missing','amount','duplicate','unreadable','malformed'])('distinguishes a readable page missing the order from %s payment failures',async mode=>{
 const detail='https://www.amazon.ca/your-orders/order-details?orderID=synthetic';
 io.query.mockResolvedValueOnce([{id:1,url:detail}]).mockResolvedValueOnce([{id:2,url:'https://www.amazon.ca/cpe/yourpayments/transactions'}]);
 io.compare.mockResolvedValueOnce({orderId:'synthetic',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic item',priceCents:1000,quantity:1,lineCents:1000}],subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:1000});
 const row={orderId:mode==='missing'?'different': 'synthetic',date:'2026-10-24',amountCents:mode==='amount'?2000:1000,refund:false,currency:'unspecified'};
 if(mode==='unreadable')io.compare.mockRejectedValueOnce(Error('private browser failure'));
 else io.compare.mockResolvedValueOnce(mode==='malformed'?[{...row,date:'bad'}]:mode==='duplicate'?[row,row]:[row]);
 const error=await run().catch(e=>e);
 expect(error.stage).toBe(mode==='missing'?'paymentsOrderMissing':mode==='unreadable'?'paymentsRead':mode==='malformed'?'validation':mode==='duplicate'?'paymentGroupDuplicate':'paymentGroupTotal');
 expect(error.message).not.toContain('private browser failure');
});


it.each(['paymentsLoading','paymentsPage','paymentsLanguage','paymentsDates','paymentsAmounts','paymentsRows','paymentsLinks','__proto__','private error'])('projects only an allowed payment-read reason: %s',async code=>{
 io.query.mockResolvedValueOnce([{id:1,url:'https://www.amazon.ca/your-orders/order-details?orderID=synthetic'}]).mockResolvedValueOnce([{id:2,url:'https://www.amazon.ca/cpe/yourpayments/transactions'}]);
 io.compare.mockResolvedValueOnce({orderId:'synthetic',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic item',priceCents:1000,quantity:1,lineCents:1000}],subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:1000}).mockResolvedValueOnce({paymentsReadFailure:code});
 const error=await run().catch(e=>e);expect(error.stage).toBe(code.startsWith('payments')?code:'paymentsRead');expect(error.message).not.toContain('private error');
});

it.each(['unavailable','timeout','empty'] as const)('distinguishes a %s reader transport failure before YNAB',async reason=>{
 preflightCase();io.compare.mockReset();
 io.compare.mockResolvedValueOnce({orderId:'synthetic',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic item',priceCents:1000,quantity:1,lineCents:1000}],subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:1000}).mockRejectedValueOnce(new OrderPageRequestError(reason));
 await expect(run()).rejects.toMatchObject({stage:reason==='timeout'?'paymentsTimeout':reason==='empty'?'paymentsReaderEmpty':'paymentsReaderUnavailable'});
 expect(io.target).not.toHaveBeenCalled();
});

it('stops an independently reconciled zero-card summary before reading payments or producing a review',async()=>{
 io.compare.mockResolvedValueOnce({orderId:'synthetic',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic item',priceCents:1000,quantity:1,lineCents:1000}],subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:100,giftCents:1100,totalCents:0});
 await expect(run()).rejects.toMatchObject({stage:'noCardPayment'});expect(io.query).toHaveBeenCalledOnce();expect(io.compare).toHaveBeenCalledOnce();
});

function preflightCase(){
 const detail='https://www.amazon.ca/your-orders/order-details?orderID=synthetic',payments='https://www.amazon.ca/cpe/yourpayments/transactions';
 io.query.mockResolvedValueOnce([{id:1,url:detail}]).mockResolvedValueOnce([{id:2,url:payments}]);
 io.get.mockImplementation(async(id:number)=>({url:id===1?detail:payments}));
 io.compare.mockResolvedValueOnce({orderId:'synthetic',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic item',priceCents:1000,quantity:1,lineCents:1000}],subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:1000}).mockResolvedValueOnce([{orderId:'synthetic',date:'2026-01-01',amountCents:1000,refund:false,currency:'unspecified'}]);
}
it.each(['candidate-not-found','candidate-ambiguous','candidate-auth','candidate-account'] as const)('stops initial Review at %s without publishing review data',async stage=>{
 preflightCase();const capture=vi.fn();
 io.target.mockImplementation(async(_p,_d,_c,_s,report)=>{report(stage);throw Error('synthetic-private-error');});
 await expect(reviewSelectedOrder(true,new AbortController().signal,capture,true)).rejects.toMatchObject({stage});
 expect(capture).not.toHaveBeenCalled();expect(io.get).not.toHaveBeenCalled();
 expect(io.target).toHaveBeenCalledWith('test-plan','2026-01-01',1000,expect.any(AbortSignal),expect.any(Function));
});
it('continues initial Review only after a valid target and uses the linked payment date',async()=>{
 preflightCase();io.target.mockResolvedValue({planName:'Test Plan',transactionId:'synthetic-only'});const capture=vi.fn();
 await expect(reviewSelectedOrder(true,new AbortController().signal,capture,true)).resolves.toMatchObject({totalCents:1000,items:[{cardCents:1000}]});
 expect(capture).toHaveBeenCalledOnce();expect(io.target).toHaveBeenCalledOnce();
});
it('uses the verified lookup payments tab when another payments tab is already open',async()=>{
 preflightCase();io.target.mockResolvedValue({planName:'Test Plan',transactionId:'synthetic-only',memo:null});io.lookup.mockReturnValue(2);
 io.query.mockImplementation(async(q:{active?:boolean})=>q.active?[{id:1,url:'https://www.amazon.ca/your-orders/order-details?orderID=synthetic'}]:[{id:9,url:'https://www.amazon.ca/cpe/yourpayments/transactions?old=1'},{id:2,url:'https://www.amazon.ca/cpe/yourpayments/transactions'}]);
 await expect(reviewSelectedOrder(true,new AbortController().signal,undefined,true)).resolves.toMatchObject({orderId:'synthetic',transactionMemo:null});
 expect(io.compare).toHaveBeenCalledWith(2,expect.any(AbortSignal),'READ_CA_PREVIEW_PAYMENTS');
});
it('cancellation during the preflight prevents a completed Review',async()=>{
 preflightCase();const controller=new AbortController(),capture=vi.fn();
 io.target.mockImplementation(async()=>{controller.abort();return {};});
 await expect(reviewSelectedOrder(true,controller.signal,capture,true)).rejects.toMatchObject({name:'AbortError'});expect(capture).not.toHaveBeenCalled();expect(io.get).not.toHaveBeenCalled();
});

it('matches every split-shipment charge using its own payment date/amount and returns no financial identifiers',async()=>{
 preflightCase();io.compare.mockReset();
 io.compare.mockResolvedValueOnce({orderId:'synthetic',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic item',priceCents:1000,quantity:1,lineCents:1000}],subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:1000}).mockResolvedValueOnce([{orderId:'synthetic',date:'2026-01-01',amountCents:400,refund:false,currency:'unspecified'},{orderId:'synthetic',date:'2026-01-03',amountCents:600,refund:false,currency:'unspecified'}]);
 io.target.mockImplementation(async(_p,date)=>({planName:'Test Plan',transactionId:`synthetic-${date}`}));const capture=vi.fn();
 const result=await reviewSelectedOrder(true,new AbortController().signal,capture,true);
 expect(result).toMatchObject({items:[{title:'Synthetic item'}],totalCents:1000,matchedCharges:[{date:'2026-01-01',cents:400,eligible:true},{date:'2026-01-03',cents:600,eligible:true}]});
 expect(io.target.mock.calls.map(([plan,date,cents])=>[plan,date,cents])).toEqual([['test-plan','2026-01-01',400],['test-plan','2026-01-03',600]]);
 expect(JSON.stringify(result)).not.toMatch(/test-only-token|transactionId|B000000001|synthetic-/);expect(capture).toHaveBeenCalledOnce();
});

it('does not publish a partial split-shipment match when a later charge is ineligible',async()=>{
 preflightCase();io.compare.mockReset();
 io.compare.mockResolvedValueOnce({orderId:'synthetic',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic item',priceCents:1000,quantity:1,lineCents:1000}],subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:1000}).mockResolvedValueOnce([{orderId:'synthetic',date:'2026-01-01',amountCents:400,refund:false,currency:'unspecified'},{orderId:'synthetic',date:'2026-01-03',amountCents:600,refund:false,currency:'unspecified'}]);
 io.target.mockResolvedValueOnce({planName:'Test Plan',transactionId:'synthetic-first'}).mockRejectedValueOnce(Error('The matching transaction is already split.'));const capture=vi.fn();
 await expect(reviewSelectedOrder(true,new AbortController().signal,capture,true)).rejects.toMatchObject({stage:'targetSplit'});expect(capture).not.toHaveBeenCalled();expect(io.get).not.toHaveBeenCalled();
});

it('accepts a reconciled gift-funded order with quantity two and one matching card charge',async()=>{
 preflightCase();io.compare.mockReset();io.target.mockResolvedValue({planName:'Test Plan',transactionId:'synthetic-only'});
 io.compare.mockResolvedValueOnce({orderId:'synthetic',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic quantity item',priceCents:600,quantity:2,lineCents:null},{productId:'B000000002',title:'Synthetic other',priceCents:2800,quantity:1,lineCents:2800}],subtotalCents:4000,shippingCents:0,shippingChargeCents:500,shippingCreditCents:500,feeCents:0,taxCents:0,giftCents:1500,totalCents:2500}).mockResolvedValueOnce([{orderId:'synthetic',date:'2026-01-01',amountCents:2500,refund:false,currency:'unspecified'}]);
 expect(await reviewSelectedOrder(true,new AbortController().signal,undefined,true)).toMatchObject({totalCents:2500,summary:{giftCents:1500},items:[{quantity:2},{quantity:1}]});
});
it('preserves safe parsed payment diagnostics through the reader error wrapper',async()=>{
 preflightCase();io.compare.mockReset();
 io.compare.mockResolvedValueOnce({orderId:'synthetic',currency:'unspecified',items:[{productId:'B000000001',title:'Synthetic item',priceCents:1000,quantity:1,lineCents:1000}],subtotalCents:1000,shippingCents:0,feeCents:0,taxCents:0,giftCents:0,totalCents:1000}).mockResolvedValueOnce([{orderId:'synthetic',date:'2026-01-01',amountCents:1000,refund:false,currency:'CAD'}]);
 await expect(reviewSelectedOrder(true,new AbortController().signal,undefined,true)).rejects.toMatchObject({stage:'paymentGroupCurrency',paymentDiagnostic:{orderCents:1000,chargeCents:[1000],orderCurrency:'unspecified',chargeCurrencies:['CAD']}});expect(io.target).not.toHaveBeenCalled();
});
