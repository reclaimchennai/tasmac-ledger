/**
 * Per-bottle cost breakdown.
 *
 * Reconstructs what makes up a TASMAC MRP from the state's own published tax
 * schedule (the excise-duty / VAT / special-fee GOs). A retail MRP is the
 * *second point of sale* price, which by the Tamil Nadu VAT Act (Second
 * Schedule) is inclusive of VAT plus the 2% additional tax. So the tax slice is
 * exact arithmetic; excise is computed from the ₹/proof-litre and ₹/bulk-litre
 * rates; the remainder is manufacturer/import cost plus TASMAC's own margin,
 * which the published documents do not separate, so neither do we.
 *
 * Sources: VAT29.05.2020, taxes_and_duty (2017 / 2020 / 2024 excise GOs), and
 * the 2014 & 2023 import special-fee GOs. See src/lib/schema.sql notes.
 *
 * One stated assumption: Indian spirits are taken at the standard **42.8% v/v**
 * (75° proof) to convert bottle volume to proof litres for excise. The GOs'
 * own per-case figures confirm it (₹200/PL × 6.75 PL = ₹1350/case). Beer and
 * wine use bulk litre, so they need no strength assumption.
 */

export type TaxClass = 'spirit' | 'beer' | 'wine' | 'foreign';

/** Standard Indian spirit strength, proof-litres per bulk litre (42.8% ÷ 57.06%). */
const PL_PER_LITRE = 0.428 / 0.5706; // ≈ 0.75

/** VAT at the second point of sale, as a fraction. Foreign liquor is 14.5%. */
const VAT: Record<TaxClass, number> = {
  spirit: 2.20,
  beer: 2.60,
  wine: 2.50,
  foreign: 0.145,
};
const ADDITIONAL = 0.02; // 2% additional tax, all liquor, since 2016-04-01

/** Excise duty tiers, chosen by the date the price was in effect. */
interface ExciseTier {
  from: string; // ISO; applies to observations on/after this date until the next tier
  spiritPL: { ordinary: number; medium: number; premium: number }; // ₹ per proof litre
  beerBL: number; // ₹ per bulk litre
  wineBL: number;
  mrp180: { ordinary: number; medium: number }; // MRP thresholds (180ml) that split the ranges
}

// Ordered oldest→newest. Chosen by observation date.
const EXCISE: ExciseTier[] = [
  { from: '2000-01-01', spiritPL: { ordinary: 140, medium: 155, premium: 195 }, beerBL: 10, wineBL: 7, mrp180: { ordinary: 100, medium: 110 } },
  { from: '2017-10-13', spiritPL: { ordinary: 140, medium: 155, premium: 195 }, beerBL: 10, wineBL: 7, mrp180: { ordinary: 100, medium: 110 } },
  { from: '2020-05-28', spiritPL: { ordinary: 198, medium: 262, premium: 302 }, beerBL: 15, wineBL: 11, mrp180: { ordinary: 130, medium: 160 } },
  { from: '2024-01-25', spiritPL: { ordinary: 200, medium: 264, premium: 328 }, beerBL: 15, wineBL: 11, mrp180: { ordinary: 140, medium: 170 } },
];

/** Import special fee (₹/proof litre for spirits & wine, ₹/bulk litre for beer). */
const SPECIAL_FEE = [
  { from: '2014-08-20', spiritPL: 300, winePL: 383, beerBL: 25 },
  { from: '2023-07-18', spiritPL: 471, winePL: 607, beerBL: 38 },
];

function pickTier(dateISO: string): ExciseTier {
  let t = EXCISE[0];
  for (const e of EXCISE) if (dateISO >= e.from) t = e;
  return t;
}
function pickFee(dateISO: string) {
  let f = SPECIAL_FEE[0];
  for (const e of SPECIAL_FEE) if (dateISO >= e.from) f = e;
  return f;
}

/**
 * Classify a SKU for tax. Imported foreign liquor and the FL2/elite ranges
 * (liquor types prefixed IFL- or OTHER-) are taxed as `foreign` (14.5%); the
 * rest are ordinary domestic IMFS / beer / wine.
 */
export function taxClass(category: string | null, liquorType: string | null, isPremium: number | boolean): TaxClass {
  const lt = (liquorType ?? '').toUpperCase();
  if (lt.startsWith('IFL-') || lt.startsWith('OTHER-') || isPremium) return 'foreign';
  switch (category) {
    case 'BEER': return 'beer';
    case 'WINE': return 'wine';
    default: return 'spirit';
  }
}

export interface Breakdown {
  cls: TaxClass;
  mrp: number;
  vat: number;        // VAT + 2% additional tax (₹)
  excise: number;     // excise duty or import special fee (₹)
  base: number;       // manufacturer/import cost + TASMAC margin (₹, the residual)
  vatPct: number;
  excisePct: number;
  basePct: number;
  exciseLabel: string; // "Excise duty" | "Import special fee"
  assumedStrength: boolean; // true when the 42.8% assumption was used (spirits)
}

/**
 * Decompose one bottle's MRP as observed on `dateISO`.
 *
 * VAT is exact (MRP is VAT-inclusive at the second point). Excise/special-fee
 * is computed per bottle; the base+margin is whatever remains, floored at zero.
 */
export function breakdown(
  mrp: number, volumeMl: number | null, category: string | null,
  liquorType: string | null, isPremium: number | boolean, dateISO: string,
): Breakdown {
  const cls = taxClass(category, liquorType, isPremium);
  const litres = (volumeMl ?? 750) / 1000;

  const rate = VAT[cls] + ADDITIONAL;
  const vat = mrp * (rate / (1 + rate));

  let excise = 0;
  let exciseLabel = 'Excise duty';
  let assumedStrength = false;
  if (cls === 'foreign') {
    exciseLabel = 'Import special fee';
    const f = pickFee(dateISO);
    if (category === 'BEER') excise = f.beerBL * litres;
    else if (category === 'WINE') excise = f.winePL * litres * PL_PER_LITRE, (assumedStrength = true);
    else { excise = f.spiritPL * litres * PL_PER_LITRE; assumedStrength = true; }
  } else if (cls === 'beer') {
    excise = pickTier(dateISO).beerBL * litres;
  } else if (cls === 'wine') {
    excise = pickTier(dateISO).wineBL * litres;
  } else {
    const t = pickTier(dateISO);
    const mrp180 = mrp * (180 / (volumeMl ?? 750));
    const r = mrp180 <= t.mrp180.ordinary ? t.spiritPL.ordinary
            : mrp180 <= t.mrp180.medium ? t.spiritPL.medium
            : t.spiritPL.premium;
    excise = r * litres * PL_PER_LITRE;
    assumedStrength = true;
  }

  // Never let rounding push the pieces past the MRP.
  excise = Math.min(excise, Math.max(0, mrp - vat));
  const base = Math.max(0, mrp - vat - excise);
  return {
    cls, mrp,
    vat: Math.round(vat), excise: Math.round(excise), base: Math.round(base),
    vatPct: (vat / mrp) * 100,
    excisePct: (excise / mrp) * 100,
    basePct: (base / mrp) * 100,
    exciseLabel, assumedStrength,
  };
}
