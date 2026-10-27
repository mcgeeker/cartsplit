import { expect, it } from "vitest";
import { previewCanadianFunding, type CanadianFundingInput } from "./ca-funding";

const input: CanadianFundingInput = {
  itemCents: [1000, 3000], feeCentsByItem: [0, 100], subtotalCents: 4000,
  beforeTaxCents: 4100, taxCents: 533, giftCardCents: 500, cardChargeCents: 4133,
};
it("assigns the fee before tax and spreads gift credit over both gross shares", () => {
  expect(previewCanadianFunding(input)).toEqual([
    { itemCents: 1000, feeCents: 0, estimatedTaxCents: 130, grossCents: 1130, giftCardCents: 122, cardCents: 1008 },
    { itemCents: 3000, feeCents: 100, estimatedTaxCents: 403, grossCents: 3503, giftCardCents: 378, cardCents: 3125 },
  ]);
});
it("conserves every cent, including tiny credits and deterministic ties", () => {
  for (let gift = 0; gift < 20; gift++) {
    const result = previewCanadianFunding({ ...input, giftCardCents: gift, cardChargeCents: 4633 - gift });
    expect(result.reduce((s, r) => s + r.cardCents, 0)).toBe(4633 - gift);
    expect(result.reduce((s, r) => s + r.giftCardCents, 0)).toBe(gift);
    expect(result.every((r) => r.cardCents >= 0 && Number.isSafeInteger(r.cardCents))).toBe(true);
  }
  const result = previewCanadianFunding({ itemCents: [1, 1], feeCentsByItem: [0, 0], subtotalCents: 2,
    beforeTaxCents: 2, taxCents: 1, giftCardCents: 1, cardChargeCents: 2 });
  expect(result.map((r) => r.estimatedTaxCents)).toEqual([1, 0]);
  expect(result.map((r) => r.cardCents)).toEqual([1, 1]);
});
it("rejects mismatches instead of scaling an incomplete summary to the card charge", () => {
  for (const patch of [ { subtotalCents: 4001 }, { beforeTaxCents: 4000 }, { cardChargeCents: 4132 },
    { giftCardCents: 4633, cardChargeCents: 0 }, { taxCents: -1 }, { giftCardCents: 1.2 },
    { cardChargeCents: NaN }, { itemCents: [0, 4000] }, { itemCents: [4000] },
    { feeCentsByItem: [0] }, { feeCentsByItem: [0, -100] }, { taxCents: Number.MAX_SAFE_INTEGER },
    { itemCents: [Number.MAX_SAFE_INTEGER + 1, 1] },
  ]) expect(() => previewCanadianFunding({ ...input, ...patch })).toThrow();
});
it("does not lose precision when intermediate weighted products exceed safe numbers", () => {
  const result = previewCanadianFunding({ itemCents: [1_000_000_000, 3_000_000_000], feeCentsByItem: [0, 0],
    subtotalCents: 4_000_000_000, beforeTaxCents: 4_000_000_000, taxCents: 520_000_000,
    giftCardCents: 1_000_000_000, cardChargeCents: 3_520_000_000 });
  expect(result.map((r) => r.cardCents)).toEqual([880_000_000, 2_640_000_000]);
});
