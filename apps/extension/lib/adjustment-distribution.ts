export const DISTRIBUTE_EQUALLY = "__distribute_equally__";
export const DISTRIBUTE_EQUALLY_LABEL = "Distribute equally across items";

/** Split each chosen adjustment's card-funded cents equally, with remainder
 * pennies going to earlier displayed products. Keep all other money unchanged. */
export function distributeAdjustmentShares<T extends {kind:string;cardCents:number}>(lines:readonly T[], itemCount:number, choices:readonly string[]):T[] {
 if(!Number.isInteger(itemCount)||itemCount<1||itemCount>lines.length||choices.length!==lines.length)throw Error("Invalid distribution choices.");
 const result=lines.map(line=>({...line}));
 for(const [i,choice] of choices.entries()) {
  if(choice!==DISTRIBUTE_EQUALLY)continue;
  const line=result[i]!;
  if(i<itemCount||!['fee','shipping'].includes(line.kind)||!Number.isSafeInteger(line.cardCents)||line.cardCents<0)throw Error("Only additional charges can be distributed.");
  const base=Math.floor(line.cardCents/itemCount),remainder=line.cardCents%itemCount;
  for(let n=0;n<itemCount;n++){
   if(result[n]!.kind!=='item')throw Error("Invalid product order.");
   result[n]!.cardCents+=base+(n<remainder?1:0);
   if(!Number.isSafeInteger(result[n]!.cardCents))throw Error("Unsafe distribution total.");
  }
  line.cardCents=0;
 }
 return result;
}
