import { getAllProductEmbeddings, getLearnedProduct, learnedKey, putReviewedLearning } from '@/lib/db';
import type { Category, LearnedProduct, ProductEmbedding, PurchaseSuggestionSource } from '@/lib/types';

const RETAILER = 'amazon-ca-reviewed';
// Bump this marker if weights, dimensions, pooling or normalization change.
// A revision pin alone must not silently reinterpret vectors from other weights.
const MODEL = 'bge-small-en-v1.5:q8:384:v1';
const DIMS = 384;
const HISTORY_THRESHOLD = 0.75;
const CATEGORY_THRESHOLD = 0.45;
const MARGIN = 0.08;
const POOL_CAP = 500;
const CATEGORY_CACHE_CAP = 512;
type CategoryVector = {categoryId:string; embedding:Float32Array};
// One category snapshot, in background memory only. Product text is never cached.
let categoryCache: {key:string; rows:CategoryVector[]} | null = null;
let cacheRevision = 0;

/** Connection changes discard derived category data and invalidate pending fills. */
export function clearPurchaseSuggestionCache(): void {
 categoryCache = null;
 cacheRevision += 1;
}
type Suggestion = { categoryId: string | null; source: PurchaseSuggestionSource | null };
const empty = (): Suggestion => ({ categoryId: null, source: null });

function validVector(vector: Float32Array): boolean {
 return vector instanceof Float32Array && vector.length === DIMS && vector.every(Number.isFinite) && vector.some(v => v !== 0);
}
function cosine(a: Float32Array, b: Float32Array): number {
 let dot=0,aa=0,bb=0;
 for(let i=0;i<DIMS;i++){dot+=a[i]!*b[i]!;aa+=a[i]!*a[i]!;bb+=b[i]!*b[i]!;}
 return dot/Math.sqrt(aa*bb);
}
/** Scores are similarity heuristics, not probabilities. Require both strength and separation. */
function winner(query: Float32Array, candidates: {categoryId:string; embedding:Float32Array}[], threshold:number):string|null {
 if(!validVector(query))return null;
 const best=new Map<string,number>();
 for(const row of candidates){if(!validVector(row.embedding))continue;const score=cosine(query,row.embedding);best.set(row.categoryId,Math.max(best.get(row.categoryId)??-1,score));}
 const ranked=[...best].sort((a,b)=>b[1]-a[1]);
 return ranked[0] && ranked[0][1]>=threshold && (!ranked[1] || ranked[0][1]-ranked[1][1]>=MARGIN) ? ranked[0][0] : null;
}
function reviewedPool(rows:ProductEmbedding[],planId:string,valid?:Set<string>){
 const prefix=learnedKey(planId,RETAILER,'');
 return rows.filter(r=>r.planId===planId&&r.id.startsWith(prefix)&&r.modelId===MODEL&&(!valid||valid.has(r.categoryId))&&validVector(r.embedding));
}
// Bounded batches avoid running many model invocations concurrently. No text is sent to a service.
async function vectors(texts:string[],signal:AbortSignal):Promise<Float32Array[]>{
 signal.throwIfAborted();if(!texts.length)return [];
 const {embedBatch}=await import('./embedder');signal.throwIfAborted();const result:Float32Array[]=[];
 for(let i=0;i<texts.length;i+=8){signal.throwIfAborted();const batch=await embedBatch(texts.slice(i,i+8),signal);signal.throwIfAborted();if(batch.length!==texts.slice(i,i+8).length||batch.some(v=>!validVector(v)))throw Error('Invalid local model output.');result.push(...batch);}
 return result;
}

/** Reuse only identical model inputs and category IDs from the same plan.
 * Fresh API/category validation remains outside this cache. Large plans still
 * use every category for scoring, but do not retain an oversized snapshot. */
async function categoryVectors(planId:string,categories:Category[],signal:AbortSignal):Promise<CategoryVector[]>{
 signal.throwIfAborted();
 const inputs = categories.map(category => ({
  id: category.id,
  text: `Shopping category: ${category.name.slice(0,256)}. Budget group: ${category.groupName.slice(0,256)}.`,
 }));
 const cacheable = inputs.length <= CATEGORY_CACHE_CAP;
 const key = cacheable ? JSON.stringify([MODEL, planId,
  inputs.map(input => [input.id, input.text]).sort((a,b) => a[0]!.localeCompare(b[0]!)),
 ]) : null;
 if (key !== null && categoryCache?.key === key) return categoryCache.rows;
 const revision = cacheRevision;
 const encoded = await vectors(inputs.map(input => input.text), signal);
 signal.throwIfAborted();
 const rows = inputs.map((input,index) => ({categoryId:input.id, embedding:encoded[index]!}));
 if (key !== null && revision === cacheRevision) categoryCache = {key,rows};
 return rows;
}
export async function suggestPurchaseCategories(planId:string, productIds:string[], categories:Category[], signal:AbortSignal, titles:string[]=[]):Promise<Suggestion[]>{
 const counts = new Map<string, number>();
 for (const category of categories) counts.set(category.id, (counts.get(category.id) ?? 0) + 1);
 const valid = new Set(categories.filter(category => counts.get(category.id) === 1).map(category => category.id));
 const result:Suggestion[]=[];
 for(const productId of productIds){
  signal.throwIfAborted();const id=learnedKey(planId,RETAILER,productId),row=await getLearnedProduct(id);signal.throwIfAborted();
  result.push(row?.id===id&&row.planId===planId&&valid.has(row.categoryId)?{categoryId:row.categoryId,source:'exact'}:empty());
 }
 const missing=productIds.map((_,i)=>i).filter(i=>!result[i]!.categoryId&&titles[i]?.trim());
 if(!missing.length||!valid.size)return result;
 try{
  let pool:ProductEmbedding[]=[];
  try{pool=reviewedPool(await getAllProductEmbeddings(planId),planId,valid);}catch{signal.throwIfAborted();}
  let encodedCategories:CategoryVector[]|undefined;
  for(const i of missing){
   const [query]=await vectors([titles[i]!.slice(0,1000)],signal);
   const historical=winner(query!,pool,HISTORY_THRESHOLD);
   if(historical){result[i]={categoryId:historical,source:'history'};continue;}
   if(!encodedCategories){
    const current=categories.filter(c=>valid.has(c.id));
    encodedCategories=await categoryVectors(planId,current,signal);
   }
   const predicted=winner(query!,encodedCategories,CATEGORY_THRESHOLD);
   if(predicted)result[i]={categoryId:predicted,source:'model'};
  }
 }catch{signal.throwIfAborted(); /* Preserve exact/completed suggestions; unavailable model leaves the rest manual. */}
 return result;
}
export async function rememberPurchaseCategories(planId:string,productIds:string[],choices:{id:string}[],signal:AbortSignal,titles:string[]=[]){
 signal.throwIfAborted();if(productIds.length!==choices.length)throw Error('Learning items changed.');
 const grouped=new Map<string,Set<string>>();
 productIds.forEach((productId,i)=>{const set=grouped.get(productId)??new Set<string>();set.add(choices[i]!.id);grouped.set(productId,set);});
 const rows:LearnedProduct[]=[...grouped].flatMap(([productId,categories])=>categories.size===1?[{id:learnedKey(planId,RETAILER,productId),planId,categoryId:[...categories][0]!}]:[]);
 const removed=[...grouped].filter(([,categories])=>categories.size>1).map(([id])=>learnedKey(planId,RETAILER,id));
 const touched=productIds.map(id=>learnedKey(planId,RETAILER,id));
 let embeddings:ProductEmbedding[]=[];let evicted:string[]=[];
 try{
  const existing=reviewedPool(await getAllProductEmbeddings(planId),planId).filter(r=>!touched.includes(r.id));signal.throwIfAborted();
  const eligible=rows.filter(r=>titles[productIds.findIndex(id=>learnedKey(planId,RETAILER,id)===r.id)]?.trim());
  const encoded=await vectors(eligible.map(r=>titles[productIds.findIndex(id=>learnedKey(planId,RETAILER,id)===r.id)]!.slice(0,1000)),signal);
  embeddings=eligible.map((r,i)=>({...r,title:'',embedding:encoded[i]!,lastSeen:new Date().toISOString(),modelId:MODEL}));
  const kept=[...existing,...embeddings].sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen));const counts=new Map<string,number>();let total=0;
  for(const row of kept){const count=counts.get(row.categoryId)??0;if(count>=50||total>=POOL_CAP)evicted.push(row.id);else{counts.set(row.categoryId,count+1);total++;}}
  embeddings=embeddings.filter(r=>!evicted.includes(r.id));
 }catch{signal.throwIfAborted(); /* Exact learning still works if embedding generation/storage reads fail. */}
 // Replace both stores atomically, deleting old vectors even when a correction cannot be embedded.
 await putReviewedLearning(rows,removed,signal,embeddings,[...touched,...evicted]);
}
