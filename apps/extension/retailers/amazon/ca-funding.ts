/** Pure, read-only arithmetic. Callers must independently verify page/payment identity,
 * CAD, quantities, a single charge, and user approval of fee/tax allocation policy.
 * This helper does not establish item-specific tax treatment from aggregate tax. */
export interface CanadianFundingInput {
  itemCents: readonly number[];
  feeCentsByItem: readonly number[];
  subtotalCents: number;
  beforeTaxCents: number;
  taxCents: number;
  giftCardCents: number; // positive contribution, normalized from the displayed deduction
  cardChargeCents: number;
}

function cents(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid funding amount.");
  return BigInt(value);
}

// Largest remainders distribute pennies exactly; ties favor earlier displayed items.
// BigInt multiplication avoids floating-point rounding and intermediate overflow.
function apportion(weights: readonly bigint[], total: bigint): bigint[] {
  const sum = weights.reduce((a, b) => a + b, BigInt(0));
  const products = weights.map((w) => w * total);
  const shares = products.map((p) => p / sum);
  const ranked = products.map((p, index) => ({ index, remainder: p % sum }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  const missing = Number(total - shares.reduce((a, b) => a + b, BigInt(0)));
  for (const { index } of ranked.slice(0, missing)) shares[index] = shares[index]! + BigInt(1);
  return shares;
}

/** Bounded first multi-item case: two quantity-one items, no shipping/discounts/refunds,
 * explicitly assigned fees, proportionally estimated tax, proportional gift credit.
 * Every returned column sums exactly; no partial reconciliation is accepted. */
export function previewCanadianFunding(input: CanadianFundingInput) {
  if (input.itemCents.length !== 2 || input.feeCentsByItem.length !== 2) throw new Error("Expected two items.");
  return allocateCanadianFunding(input);
}

/** Variable-length reconciliation for the automatic order reader. */
export function allocateCanadianFunding(input: CanadianFundingInput) {
  if (!input.itemCents.length || input.itemCents.length > 202 || input.feeCentsByItem.length !== input.itemCents.length) throw new Error("Invalid item count.");
  const items = Array.from(input.itemCents, cents);
  const fees = Array.from(input.feeCentsByItem, cents);
  if (items.some((v) => v === BigInt(0))) throw new Error("Expected positive item prices.");
  const subtotal = cents(input.subtotalCents);
  const beforeTax = cents(input.beforeTaxCents);
  const tax = cents(input.taxCents);
  const gift = cents(input.giftCardCents);
  const card = cents(input.cardChargeCents);
  const bases = items.map((v, i) => v + fees[i]!);
  const gross = beforeTax + tax;
  if (items.reduce((a,b)=>a+b,BigInt(0)) !== subtotal || bases.reduce((a,b)=>a+b,BigInt(0)) !== beforeTax ||
    gross > BigInt(Number.MAX_SAFE_INTEGER) || gift >= gross || card === BigInt(0) || gross - gift !== card) {
    throw new Error("Funding does not reconcile.");
  }
  const taxes = apportion(bases, tax);
  const totals = bases.map((v, i) => v + taxes[i]!);
  const gifts = apportion(totals, gift);
  return totals.map((v, i) => ({
    itemCents: Number(items[i]!), feeCents: Number(fees[i]!),
    estimatedTaxCents: Number(taxes[i]!), grossCents: Number(v),
    giftCardCents: Number(gifts[i]!), cardCents: Number(v - gifts[i]!),
  }));
}

/** Explicit order-level coupon policy: products only; largest-remainder cents. */
export function allocateCouponSavings(itemPrices: readonly number[], couponCents: number) {
 const weights=itemPrices.map(cents), coupon=cents(couponCents);
 if(!weights.length||weights.length>200||weights.some(w=>w===BigInt(0))||coupon>=weights.reduce((a,b)=>a+b,BigInt(0)))throw Error("Invalid coupon allocation.");
 return apportion(weights,coupon).map(Number);
}
