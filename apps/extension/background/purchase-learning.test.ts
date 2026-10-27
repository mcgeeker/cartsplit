import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),pool:vi.fn(),embed:vi.fn()}));
vi.mock('@/lib/db',()=>({getLearnedProduct:db.get,getAllProductEmbeddings:db.pool,putReviewedLearning:db.put,learnedKey:(p:string,r:string,i:string)=>`${p}:${r}:${i}`}));
vi.mock('./embedder',()=>({embedBatch:db.embed}));
import {suggestPurchaseCategories,rememberPurchaseCategories,clearPurchaseSuggestionCache} from './purchase-learning';
const signal=()=>new AbortController().signal;
const cats=[{id:'cat',name:'Category',groupName:'Group'}];
beforeEach(()=>{vi.resetAllMocks();clearPurchaseSuggestionCache();db.pool.mockResolvedValue([]);});
it('uses exact product and plan keys and rejects stale categories or mismatched stored plan',async()=>{
 db.get.mockImplementation(async(id:string)=>({id,planId:'plan',categoryId:'cat'}));
 expect(await suggestPurchaseCategories('plan',['A','B'],cats,signal())).toEqual([{categoryId:'cat',source:'exact'},{categoryId:'cat',source:'exact'}]);
 expect(db.get).toHaveBeenCalledWith('plan:amazon-ca-reviewed:A');
 expect(await suggestPurchaseCategories('other',['A'],cats,signal())).toEqual([{categoryId:null,source:null}]);
 expect(await suggestPurchaseCategories('plan',['A'],[],signal())).toEqual([{categoryId:null,source:null}]);
 db.get.mockResolvedValue(undefined);expect(await suggestPurchaseCategories('plan',['new'],cats,signal())).toEqual([{categoryId:null,source:null}]);
});
it('stores only product keys/category ids and replaces corrections; ambiguous duplicates are forgotten',async()=>{
 await rememberPurchaseCategories('plan',['A','A','B','C'],[{id:'cat'},{id:'different'},{id:'cat'},{id:'corrected'}],signal());
 expect(db.put).toHaveBeenCalledExactlyOnceWith([
 {id:'plan:amazon-ca-reviewed:B',planId:'plan',categoryId:'cat'},
 {id:'plan:amazon-ca-reviewed:C',planId:'plan',categoryId:'corrected'},
 ],['plan:amazon-ca-reviewed:A'],expect.any(AbortSignal),[],expect.arrayContaining(['plan:amazon-ca-reviewed:A','plan:amazon-ca-reviewed:B','plan:amazon-ca-reviewed:C']));
});
it('does not read or write when already canceled and propagates local failures',async()=>{
 const c=new AbortController();c.abort();
 await expect(suggestPurchaseCategories('p',['A'],cats,c.signal)).rejects.toThrow();
 await expect(rememberPurchaseCategories('p',['A'],[{id:'cat'}],c.signal)).rejects.toThrow();
 expect(db.get).not.toHaveBeenCalled();expect(db.put).not.toHaveBeenCalled();
 db.put.mockRejectedValue(Error('storage unavailable'));await expect(rememberPurchaseCategories('p',['A'],[{id:'cat'}],signal())).rejects.toThrow();
});

function vector(x=1,y=0){const v=new Float32Array(384);v[0]=x;v[1]=y;return v;}
const categorySet=[{id:'cat',name:'Groceries',groupName:'Everyday'},{id:'other',name:'Clothes',groupName:'Everyday'}];
function history(id='A',categoryId='cat',embedding=vector(),planId='plan'){
 return {id:`${planId}:amazon-ca-reviewed:${id}`,planId,categoryId,embedding,title:'',lastSeen:'2026-10-24',modelId:'bge-small-en-v1.5:q8:384:v1'};
}
it('exact choices take precedence without loading model or history',async()=>{
 db.get.mockImplementation(async(id:string)=>({id,planId:'plan',categoryId:'cat'}));
 expect(await suggestPurchaseCategories('plan',['A'],categorySet,signal(),['Bread'])).toEqual([{categoryId:'cat',source:'exact'}]);
 expect(db.embed).not.toHaveBeenCalled();expect(db.pool).not.toHaveBeenCalled();
});
it('uses strong reviewed history first and never embeds category names on a history hit',async()=>{
 db.pool.mockResolvedValue([history()]);db.embed.mockResolvedValue([vector()]);
 expect(await suggestPurchaseCategories('plan',['B'],categorySet,signal(),['Bread'])).toEqual([{categoryId:'cat',source:'history'}]);
 expect(db.embed).toHaveBeenCalledExactlyOnceWith(['Bread'],expect.any(AbortSignal));
});
it('uses category names when history is absent, weak or ambiguous; reuses category vectors within the review',async()=>{
 db.pool.mockResolvedValue([history(),history('B','other',vector())]);
 db.embed.mockResolvedValueOnce([vector()]).mockResolvedValueOnce([vector(),vector(0,1)]).mockResolvedValueOnce([vector()]);
 expect(await suggestPurchaseCategories('plan',['C','D'],categorySet,signal(),['Bread','Pasta'])).toEqual([{categoryId:'cat',source:'model'},{categoryId:'cat',source:'model'}]);
 expect(db.embed.mock.calls[1]![0]).toEqual(['Shopping category: Groceries. Budget group: Everyday.','Shopping category: Clothes. Budget group: Everyday.']);
 expect(db.put).not.toHaveBeenCalled();
});
it.each(['other-plan','legacy','stale','wrong-model'])('ignores %s history',async mode=>{
 const row=history();if(mode==='other-plan')row.planId='other-plan';if(mode==='legacy')row.id='plan:amazon:A';if(mode==='stale')row.categoryId='deleted';if(mode==='wrong-model')row.modelId='another-model';
 db.pool.mockResolvedValue([row]);db.embed.mockResolvedValueOnce([vector()]).mockResolvedValueOnce([vector(),vector(0,1)]);
 expect(await suggestPurchaseCategories('plan',['new'],categorySet,signal(),['Bread'])).toEqual([{categoryId:'cat',source:'model'}]);
});
it.each(['weak','ambiguous','invalid'])('leaves %s model predictions manual',async mode=>{
 db.embed.mockResolvedValueOnce([vector()]).mockResolvedValueOnce(mode==='weak'?[vector(0,1),vector(-1,0)]:mode==='ambiguous'?[vector(),vector(.99,.01)]:[new Float32Array(384),vector(0,1)]);
 expect(await suggestPurchaseCategories('plan',['new'],categorySet,signal(),['Bread'])).toEqual([{categoryId:null,source:null}]);
});
it('retains exact suggestions on model failure and does not log private text',async()=>{
 db.get.mockImplementation(async(id:string)=>id.endsWith(':A')?{id,planId:'plan',categoryId:'cat'}:undefined);db.embed.mockRejectedValue(Error('unavailable'));
 expect(await suggestPurchaseCategories('plan',['A','B'],categorySet,signal(),['Bread','Pasta'])).toEqual([{categoryId:'cat',source:'exact'},{categoryId:null,source:null}]);
});
it('cancellation after inference prevents any suggestion result or learning mutation',async()=>{
 const c=new AbortController();db.embed.mockImplementation(async()=>{c.abort();return [vector()];});
 await expect(suggestPurchaseCategories('plan',['new'],categorySet,c.signal,['Bread'])).rejects.toThrow();expect(db.put).not.toHaveBeenCalled();
});
it('stores vectors only with verified choices, omits raw titles and atomically removes conflicts and stale corrections',async()=>{
 db.embed.mockResolvedValue([vector()]);
 await rememberPurchaseCategories('plan',['A','A','B'],[{id:'cat'},{id:'other'},{id:'cat'}],signal(),['Private title','Private title','Bread']);
 const [rows,removed,,embeddings,removedVectors]=db.put.mock.calls[0]!;
 expect(rows).toEqual([{id:'plan:amazon-ca-reviewed:B',planId:'plan',categoryId:'cat'}]);expect(removed).toEqual(['plan:amazon-ca-reviewed:A']);
 expect(embeddings).toEqual([expect.objectContaining({id:'plan:amazon-ca-reviewed:B',title:'',embedding:vector()})]);
 expect(removedVectors).toContain('plan:amazon-ca-reviewed:A');expect(JSON.stringify(db.put.mock.calls)).not.toContain('Private title');
});
it('still commits exact corrections when the model fails and removes their old vectors',async()=>{
 db.embed.mockRejectedValue(Error('model unavailable'));
 await rememberPurchaseCategories('plan',['A'],[{id:'other'}],signal(),['Bread']);
 expect(db.put).toHaveBeenCalledWith([{id:'plan:amazon-ca-reviewed:A',planId:'plan',categoryId:'other'}],[],expect.any(AbortSignal),[],['plan:amazon-ca-reviewed:A']);
});
it('bounds reviewed vectors per category and leaves legacy/other-plan vectors alone',async()=>{
 db.pool.mockResolvedValue(Array.from({length:50},(_,i)=>history(`old-${i}`)).concat([{...history(),id:'plan:amazon:legacy'}]));db.embed.mockResolvedValue([vector()]);
 await rememberPurchaseCategories('plan',['new'],[{id:'cat'}],signal(),['Bread']);
 const removed=db.put.mock.calls[0]![4];expect(removed).toHaveLength(2);expect(removed).toContain('plan:amazon-ca-reviewed:new');expect(removed).not.toContain('plan:amazon:legacy');
});
it('falls through weak history to category-name prediction',async()=>{
 db.pool.mockResolvedValue([history('old','other',vector(0,1))]);
 db.embed.mockResolvedValueOnce([vector()]).mockResolvedValueOnce([vector(),vector(0,1)]);
 expect(await suggestPurchaseCategories('plan',['new'],categorySet,signal(),['Bread'])).toEqual([{categoryId:'cat',source:'model'}]);
});
it('limits reviewed history to 500 vectors per plan as well as the per-category cap',async()=>{
 db.pool.mockResolvedValue(Array.from({length:500},(_,i)=>history(`old-${i}`,`category-${Math.floor(i/50)}`)));db.embed.mockResolvedValue([vector()]);
 await rememberPurchaseCategories('plan',['new'],[{id:'new-category'}],signal(),['Bread']);
 expect(db.put.mock.calls[0]![4]).toHaveLength(2);
});
it('never commits learning when cancellation arrives during vector generation',async()=>{
 const controller=new AbortController();db.embed.mockImplementation(async()=>{controller.abort();return [vector()];});
 await expect(rememberPurchaseCategories('plan',['new'],[{id:'cat'}],controller.signal,['Bread'])).rejects.toThrow();expect(db.put).not.toHaveBeenCalled();
});

function modelByText() {
 db.embed.mockImplementation(async (texts:string[]) => texts.map(text =>
  text.startsWith('Shopping category:') && !text.includes('category: Groceries.') ? vector(0,1) : vector(),
 ));
}
it('embeds 24 categories once, then only the new product on a later review',async()=>{
 modelByText();
 const many=[categorySet[0]!,...Array.from({length:23},(_,i)=>({id:`other-${i}`,name:`Other ${i}`,groupName:'Everyday'}))];
 expect(await suggestPurchaseCategories('plan',['A'],many,signal(),['Product A'])).toEqual([{categoryId:'cat',source:'model'}]);
 expect(db.embed).toHaveBeenCalledTimes(4); // One product + three batches of eight categories.
 db.embed.mockClear();
 expect(await suggestPurchaseCategories('plan',['B'],[...many].reverse(),signal(),['Product B'])).toEqual([{categoryId:'cat',source:'model'}]);
 expect(db.embed).toHaveBeenCalledExactlyOnceWith(['Product B'],expect.any(AbortSignal));
 expect(db.put).not.toHaveBeenCalled();
});
it.each(['plan','id','name','group','removed'] as const)('invalidates cached category vectors after a %s change',async change=>{
 modelByText();await suggestPurchaseCategories('plan',['A'],categorySet,signal(),['Product A']);db.embed.mockClear();
 const current=structuredClone(categorySet);
 if(change==='id')current[0]!.id='new-id';
 if(change==='name')current[0]!.name='Food';
 if(change==='group')current[0]!.groupName='New group';
 if(change==='removed')current.pop();
 await suggestPurchaseCategories(change==='plan'?'other-plan':'plan',['B'],current,signal(),['Product B']);
 expect(db.embed).toHaveBeenCalledTimes(2);
 expect(db.embed.mock.calls[1]![0]).toHaveLength(current.length);
});
it('does not use a cached category that was deleted or became ambiguous',async()=>{
 modelByText();await suggestPurchaseCategories('plan',['A'],categorySet,signal(),['Product A']);
 expect(await suggestPurchaseCategories('plan',['B'],[categorySet[1]!],signal(),['Product B'])).toEqual([{categoryId:null,source:null}]);
 expect(await suggestPurchaseCategories('plan',['C'],[categorySet[0]!,categorySet[0]!,categorySet[1]!],signal(),['Product C'])).toEqual([{categoryId:null,source:null}]);
});
it('discards the memory cache on explicit connection cleanup',async()=>{
 modelByText();await suggestPurchaseCategories('plan',['A'],categorySet,signal(),['Product A']);db.embed.mockClear();
 clearPurchaseSuggestionCache();
 await suggestPurchaseCategories('plan',['B'],categorySet,signal(),['Product B']);expect(db.embed).toHaveBeenCalledTimes(2);
});
it.each(['canceled','cleared','failed'] as const)('never caches a %s category-vector fill',async mode=>{
 modelByText();const controller=new AbortController();let once=true;
 db.embed.mockImplementation(async(texts:string[])=>{
  if(texts[0]?.startsWith('Shopping category:')&&once){
   once=false;
   if(mode==='canceled')controller.abort();
   if(mode==='cleared')clearPurchaseSuggestionCache();
   if(mode==='failed')throw Error('Synthetic failure');
  }
  return texts.map(text=>text.includes('Shopping category: Clothes')?vector(0,1):vector());
 });
 const first=suggestPurchaseCategories('plan',['A'],categorySet,controller.signal,['Product A']);
 if(mode==='canceled')await expect(first).rejects.toMatchObject({name:'AbortError'});else await first;
 db.embed.mockClear();await suggestPurchaseCategories('plan',['B'],categorySet,signal(),['Product B']);
 expect(db.embed).toHaveBeenCalledTimes(2);expect(db.put).not.toHaveBeenCalled();
});
it('uses all categories beyond the cache cap without retaining an oversized snapshot',async()=>{
 modelByText();const many=Array.from({length:513},(_,i)=>({id:`category-${i}`,name:`Other ${i}`,groupName:'Everyday'}));
 await suggestPurchaseCategories('plan',['A'],many,signal(),['Product A']);db.embed.mockClear();
 await suggestPurchaseCategories('plan',['B'],many,signal(),['Product B']);
 expect(db.embed).toHaveBeenCalledTimes(1+Math.ceil(513/8));
 expect(db.embed.mock.calls.slice(1).flatMap(([texts])=>texts)).toHaveLength(513);
});
