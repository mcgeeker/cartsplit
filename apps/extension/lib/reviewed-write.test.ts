import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("./auth", () => ({ getValidAccessToken: vi.fn(), NeedsReauthError: class extends Error {} }));
import { getValidAccessToken } from "./auth";
import { getReviewedTarget, writeReviewedSplit, type ReviewedTarget, type ReviewedLine } from "./ynab";
const network=vi.fn(), beforeSend=vi.fn(), validateContext=vi.fn();
const account={id:"test-account",name:"Lineitem Test",type:"cash",on_budget:true,closed:false,deleted:false};
const target:ReviewedTarget={planName:"Test Plan",paymentDate:"2026-10-22",transactionId:"test-tx",accountId:account.id,accountName:account.name,date:"2026-10-22",amount:-200570,payeeName:"Amazon.ca",payeeId:"test-payee",memo:"Synthetic memo",approved:false,cleared:"uncleared",flagColor:null,importId:null,matchedTransactionId:null};
const tx={id:target.transactionId,account_id:account.id,date:target.date,amount:target.amount,payee_name:target.payeeName,payee_id:target.payeeId,memo:target.memo,approved:target.approved,cleared:target.cleared,flag_color:null,category_id:null,deleted:false,subtransactions:[]};
const lines:ReviewedLine[]=[{categoryId:"test-first",categoryName:"🛒 Groceries",amountMilliunits:-12490,memo:null},{categoryId:"test-second",categoryName:"❗️ Stuff I forgot to plan for",amountMilliunits:-188080,memo:null}];
const saved={...tx,subtransactions:lines.map(l=>({category_id:l.categoryId,amount:l.amountMilliunits,memo:null,deleted:false}))};
const response=(data:object)=>new Response(JSON.stringify({data}));
const plan={id:"test-plan",name:"Test Plan",currency_format:{iso_code:"CAD"}};
function seed(fresh:object=tx,result:object=saved){network.mockResolvedValueOnce(response({plans:[plan]})).mockResolvedValueOnce(response({accounts:[account]})).mockResolvedValueOnce(response({transactions:[fresh]})).mockResolvedValueOnce(response({transaction:result}));}
const write=(input=lines,signal=new AbortController().signal)=>writeReviewedSplit("test-plan",target,input,signal,beforeSend,validateContext);
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getValidAccessToken).mockResolvedValue("test-only-token");validateContext.mockResolvedValue(undefined);vi.stubGlobal("fetch",network);vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-23T16:00:00Z"));});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it("sends only one fixed PUT with unchanged parent approval and empty split memos, verifies response without retry",async()=>{
 seed();await write();expect(network.mock.calls.map(([,o])=>o.method??"GET")).toEqual(["GET","GET","GET","PUT"]);
 const [url,o]=network.mock.calls[3]!;expect(url).toBe("https://api.ynab.com/v1/plans/test-plan/transactions/test-tx");
 expect(JSON.parse(o.body)).toEqual({transaction:{category_id:null,approved:false,subtransactions:[{category_id:"test-first",amount:-12490,memo:null},{category_id:"test-second",amount:-188080,memo:null}]}});
 expect(beforeSend).toHaveBeenCalledWith("test-only-token");expect(validateContext).toHaveBeenCalledOnce();expect(o.redirect).toBe("error");expect(o.credentials).toBe("omit");
});
it.each([{id:"replacement"},{date:"2026-10-23"},{approved:true},{cleared:"cleared"},{cleared:"reconciled"},{memo:"Changed"},{payee_id:"changed"},{flag_color:"red"},{import_id:"imported"},{category_id:"categorized"},{subtransactions:[{}]}])("rejects changed target %j",async change=>{
 seed({...tx,...change});await expect(write()).rejects.toThrow();expect(network).toHaveBeenCalledTimes(3);expect(beforeSend).not.toHaveBeenCalled();
});
it.each([{amountMilliunits:-12480},{categoryId:"../unsafe"},{memo:"Unexpected memo"}])("rejects changed proposal %j before I/O",async change=>{
 await expect(write([{...lines[0]!,...change} as ReviewedLine,lines[1]!])).rejects.toThrow();expect(network).not.toHaveBeenCalled();
});
it("cancels during final credential lookup and rechecks context after final candidate reads",async()=>{
 seed();const c=new AbortController();vi.mocked(getValidAccessToken).mockResolvedValueOnce("test-only-token").mockResolvedValueOnce("test-only-token").mockResolvedValueOnce("test-only-token").mockImplementationOnce(async()=>{c.abort();return "test-only-token";});
 await expect(write(lines,c.signal)).rejects.toMatchObject({name:"AbortError"});expect(network).toHaveBeenCalledTimes(3);expect(beforeSend).not.toHaveBeenCalled();
});
it("stops on changed final page context before the token lookup for PUT",async()=>{
 seed();validateContext.mockRejectedValueOnce(new Error("Changed page"));await expect(write()).rejects.toThrow("Changed page");expect(network).toHaveBeenCalledTimes(3);expect(beforeSend).not.toHaveBeenCalled();
});
it.each([{id:"other"},{amount:-1},{account_id:"other"},{date:"2026-10-21"},{memo:null},{payee_name:"Other"},{payee_id:"other"},{approved:true},{cleared:"cleared"},{flag_color:"red"},{deleted:true},{subtransactions:[]},{subtransactions:[saved.subtransactions[0],saved.subtransactions[0]]},{subtransactions:[{...saved.subtransactions[0],amount:-12480},saved.subtransactions[1]]},{subtransactions:[{...saved.subtransactions[0],transfer_account_id:"other"},saved.subtransactions[1]]}])("never claims success for mismatched response %j",async change=>{
 seed(tx,{...saved,...change});await expect(write()).rejects.toThrow("Could not verify");expect(network).toHaveBeenCalledTimes(4);
});
it("does not retry after network failure and never includes raw network errors",async()=>{
 network.mockResolvedValueOnce(response({plans:[plan]})).mockResolvedValueOnce(response({accounts:[account]})).mockResolvedValueOnce(response({transactions:[tx]})).mockRejectedValueOnce(new Error("private-body-test"));
 await expect(write()).rejects.toThrow("Could not reach YNAB");expect(network).toHaveBeenCalledTimes(4);
});
it("requires complete nonreconciled target metadata",async()=>{
 network.mockResolvedValueOnce(response({plans:[plan]})).mockResolvedValueOnce(response({accounts:[account]})).mockResolvedValueOnce(response({transactions:[{...tx,approved:undefined}]}));await expect(getReviewedTarget("test-plan",target.date,20057,new AbortController().signal)).rejects.toThrow("incomplete");
});
it('uses a direct category update when all review lines share one category',async()=>{
 const one=[{...lines[0]!,amountMilliunits:-200570}];seed(tx,{...tx,category_id:one[0]!.categoryId,subtransactions:[]});await write(one);
 expect(JSON.parse(network.mock.calls[3]![1].body)).toEqual({transaction:{category_id:one[0]!.categoryId,approved:false}});
});

it.each([[], [{...plan,id:"other-plan"}], [plan,plan]].map(plans=>({plans})))("refuses a missing or ambiguous destination before account/transaction I/O",async ({plans})=>{
 network.mockResolvedValueOnce(response({plans}));
 await expect(write()).rejects.toThrow("missing or ambiguous");
 expect(network).toHaveBeenCalledOnce(); expect(beforeSend).not.toHaveBeenCalled();
});

it('requires a new review after a destination is renamed',async()=>{
 network.mockResolvedValueOnce(response({plans:[{...plan,name:'Synthetic renamed plan'}]})).mockResolvedValueOnce(response({accounts:[account]})).mockResolvedValueOnce(response({transactions:[tx]}));
 await expect(write()).rejects.toThrow('transaction changed');expect(network).toHaveBeenCalledTimes(3);expect(beforeSend).not.toHaveBeenCalled();
});

const importedTarget={...target,planName:'Synthetic household plan',accountName:'Synthetic Visa',importId:'synthetic-import',matchedTransactionId:'synthetic-match'};
const importedTx={...tx,import_id:importedTarget.importId,matched_transaction_id:importedTarget.matchedTransactionId};
const importedSaved={...saved,...importedTx,subtransactions:saved.subtransactions};
function seedImported(result:object=importedSaved){
 network.mockResolvedValueOnce(response({plans:[{...plan,name:importedTarget.planName}]}))
 .mockResolvedValueOnce(response({accounts:[{...account,name:importedTarget.accountName,type:'creditCard',direct_import_linked:true}]}))
 .mockResolvedValueOnce(response({transactions:[importedTx]})).mockResolvedValueOnce(response({transaction:result}));
}
it('saves a reviewed split in a linked household credit-card account without sending import or parent metadata',async()=>{
 seedImported();await writeReviewedSplit(plan.id,importedTarget,lines,new AbortController().signal,beforeSend,validateContext);
 expect(network.mock.calls.filter(([,o])=>o.method==='PUT')).toHaveLength(1);
 expect(JSON.parse(network.mock.calls[3]![1].body)).toEqual({transaction:{category_id:null,approved:false,subtransactions:lines.map(l=>({category_id:l.categoryId,amount:l.amountMilliunits,memo:null}))}});
 expect(beforeSend).toHaveBeenCalledOnce();
});
it.each([{import_id:null},{import_id:'replacement'},{matched_transaction_id:null},{matched_transaction_id:'replacement'}])('does not confirm a save if YNAB changes imported metadata: %j',async change=>{
 seedImported({...importedSaved,...change});
 await expect(writeReviewedSplit(plan.id,importedTarget,lines,new AbortController().signal,beforeSend,validateContext)).rejects.toThrow('Could not verify');
 expect(network.mock.calls.filter(([,o])=>o.method==='PUT')).toHaveLength(1);expect(network).toHaveBeenCalledTimes(4);
});

it('keeps final matching anchored to Amazon’s date and preserves the different YNAB date',async()=>{
 const posted={...tx,date:'2026-10-24'},bound={...target,date:posted.date};
 network.mockResolvedValueOnce(response({plans:[plan]})).mockResolvedValueOnce(response({accounts:[account]}))
 .mockResolvedValueOnce(response({transactions:[posted,{...tx,id:'synthetic-outside',date:'2026-10-26'}]}))
 .mockResolvedValueOnce(response({transaction:{...saved,date:posted.date}}));
 await writeReviewedSplit(plan.id,bound,lines,new AbortController().signal,beforeSend,validateContext);
 expect(network.mock.calls[2]![0]).toContain('since_date=2026-10-20');
 expect(JSON.parse(network.mock.calls[3]![1].body).transaction).not.toHaveProperty('date');
 expect(beforeSend).toHaveBeenCalledOnce();
});
it('detects a new ambiguous match at the original window’s earlier edge before PUT',async()=>{
 const posted={...tx,date:'2026-10-24'},bound={...target,date:posted.date};
 network.mockResolvedValueOnce(response({plans:[plan]})).mockResolvedValueOnce(response({accounts:[account]}))
 .mockResolvedValueOnce(response({transactions:[posted,{...tx,id:'synthetic-competitor',date:'2026-10-20'}]}));
 await expect(writeReviewedSplit(plan.id,bound,lines,new AbortController().signal,beforeSend,validateContext)).rejects.toThrow('exactly one');
 expect(network).toHaveBeenCalledTimes(3);expect(beforeSend).not.toHaveBeenCalled();
});
it('does not confirm a response that rewrites the bank date to Amazon’s date',async()=>{
 seed({...tx,date:'2026-10-24'},saved);
 await expect(writeReviewedSplit(plan.id,{...target,date:'2026-10-24'},lines,new AbortController().signal,beforeSend,validateContext)).rejects.toThrow('Could not verify');
 expect(network.mock.calls.filter(([,o])=>o.method==='PUT')).toHaveLength(1);
});
