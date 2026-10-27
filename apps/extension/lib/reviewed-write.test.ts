import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("./auth", () => ({ getValidAccessToken: vi.fn(), NeedsReauthError: class extends Error {} }));
import { getValidAccessToken } from "./auth";
import { getReviewedTestTarget, writeReviewedTestSplit, type CanadianTestTarget, type CanadianTestLine } from "./ynab";
const network=vi.fn(), beforeSend=vi.fn(), validateContext=vi.fn();
const account={id:"test-account",name:"Lineitem Test",type:"cash",on_budget:true,closed:false,deleted:false};
const target:CanadianTestTarget={transactionId:"test-tx",accountId:account.id,accountName:account.name,date:"2026-10-22",amount:-200570,payeeName:"Amazon.ca",payeeId:"test-payee",memo:"Synthetic memo",approved:false,cleared:"uncleared",flagColor:null};
const tx={id:target.transactionId,account_id:account.id,date:target.date,amount:target.amount,payee_name:target.payeeName,payee_id:target.payeeId,memo:target.memo,approved:target.approved,cleared:target.cleared,flag_color:null,category_id:null,deleted:false,subtransactions:[]};
const lines:CanadianTestLine[]=[{categoryId:"test-first",categoryName:"🛒 Groceries",amountMilliunits:-12490,memo:null},{categoryId:"test-second",categoryName:"❗️ Stuff I forgot to plan for",amountMilliunits:-188080,memo:null}];
const saved={...tx,subtransactions:lines.map(l=>({category_id:l.categoryId,amount:l.amountMilliunits,memo:null,deleted:false}))};
const response=(data:object)=>new Response(JSON.stringify({data}));
function seed(fresh:object=tx,result:object=saved){network.mockResolvedValueOnce(response({plans:[{id:"test-plan",name:"Test Plan"}]})).mockResolvedValueOnce(response({accounts:[account]})).mockResolvedValueOnce(response({transactions:[fresh]})).mockResolvedValueOnce(response({transaction:result}));}
const write=(input=lines,signal=new AbortController().signal)=>writeReviewedTestSplit("test-plan",target,input,signal,beforeSend,validateContext);
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getValidAccessToken).mockResolvedValue("test-only-token");validateContext.mockResolvedValue(undefined);vi.stubGlobal("fetch",network);vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-23T16:00:00Z"));});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it("sends only one fixed PUT with unchanged parent approval and empty split memos, verifies response without retry",async()=>{
 seed();await write();expect(network.mock.calls.map(([,o])=>o.method??"GET")).toEqual(["GET","GET","GET","PUT"]);
 const [url,o]=network.mock.calls[3]!;expect(url).toBe("https://api.ynab.com/v1/plans/test-plan/transactions/test-tx");
 expect(JSON.parse(o.body)).toEqual({transaction:{category_id:null,approved:false,subtransactions:[{category_id:"test-first",amount:-12490,memo:null},{category_id:"test-second",amount:-188080,memo:null}]}});
 expect(beforeSend).toHaveBeenCalledWith("test-only-token");expect(validateContext).toHaveBeenCalledOnce();expect(o.redirect).toBe("error");expect(o.credentials).toBe("omit");
});
it.each([{id:"replacement"},{approved:true},{cleared:"cleared"},{cleared:"reconciled"},{memo:"Changed"},{payee_id:"changed"},{flag_color:"red"},{import_id:"imported"},{category_id:"categorized"},{subtransactions:[{}]}])("rejects changed target %j",async change=>{
 seed({...tx,...change});await expect(write()).rejects.toThrow();expect(network).toHaveBeenCalledTimes(3);expect(beforeSend).not.toHaveBeenCalled();
});
it.each([{amountMilliunits:-12480},{categoryId:"../unsafe"},{memo:"Unexpected memo"}])("rejects changed proposal %j before I/O",async change=>{
 await expect(write([{...lines[0]!,...change} as CanadianTestLine,lines[1]!])).rejects.toThrow();expect(network).not.toHaveBeenCalled();
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
 network.mockResolvedValueOnce(response({plans:[{id:"test-plan",name:"Test Plan"}]})).mockResolvedValueOnce(response({accounts:[account]})).mockResolvedValueOnce(response({transactions:[tx]})).mockRejectedValueOnce(new Error("private-body-test"));
 await expect(write()).rejects.toThrow("Could not reach YNAB");expect(network).toHaveBeenCalledTimes(4);
});
it("requires complete nonreconciled target metadata",async()=>{
 network.mockResolvedValueOnce(response({accounts:[account]})).mockResolvedValueOnce(response({transactions:[{...tx,approved:undefined}]}));await expect(getReviewedTestTarget("test-plan",target.date,20057,new AbortController().signal)).rejects.toThrow("incomplete");
});
it('uses a direct category update when all review lines share one category',async()=>{
 const one=[{...lines[0]!,amountMilliunits:-200570}];seed(tx,{...tx,category_id:one[0]!.categoryId,subtransactions:[]});await write(one);
 expect(JSON.parse(network.mock.calls[3]![1].body)).toEqual({transaction:{category_id:one[0]!.categoryId,approved:false}});
});

it.each([[], [{id:"test-plan",name:"Renamed"}], [{id:"test-plan",name:"Test Plan"},{id:"test-plan",name:"Test Plan"}]].map(plans=>({plans})))("refuses a missing, renamed or ambiguous destination before transaction I/O",async ({plans})=>{
 network.mockResolvedValueOnce(response({plans}));
 await expect(write()).rejects.toThrow("must still be Test Plan");
 expect(network).toHaveBeenCalledOnce(); expect(beforeSend).not.toHaveBeenCalled();
});
