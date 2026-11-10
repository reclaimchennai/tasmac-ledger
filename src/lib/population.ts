import 'server-only';
import { readDb } from './db';
import { ANALYSIS_FROM } from './dashboard';
import POP from '@/data/tn-population.json';
import NFHS from '@/data/nfhs-alcohol.json';

/**
 * Consumption per person — the same sales, divided by who is there to drink them.
 *
 * Two outside datasets meet the feed here:
 *
 *   • Population. The 2026 projection from the National Commission on Population's
 *     "Population Projections for India and States 2011-2036", district tables.
 *     The report projects the 32 districts of the 2011 census, so each parent is
 *     split across its present-day successors; src/data/tn-population.json carries
 *     the method and the two places it needed judgement (the 2018 Chennai boundary,
 *     and Theni's corrupt age tables in the source).
 *   • Drinking. NFHS-6 (2023-24) district fact sheets: the share of men and of women
 *     aged 15+ who consume alcohol. Multiplied by the projected adult population,
 *     that gives a drinker count per district.
 *
 * Four denominators, because none of them is the honest one on its own. Per head
 * is comparable with the figures states publish and with WHO's, but most of that
 * head count is children. Per adult removes them. Per adult man gets close to who
 * actually buys. Per drinker is the only one that answers "how much does someone
 * who drinks actually buy" — and it is the one that leans hardest on a survey.
 *
 * Two things this is not, and both are said on the card rather than buried here:
 * sales are recorded where the bottle was *bought*, not where the buyer lives, so
 * a district of highway and border shops will overstate and its neighbours will
 * understate; and a survey where people are asked whether they drink will always
 * find fewer drinkers than the shelves imply, which inflates every per-drinker
 * figure by the same unknown factor.
 */

/** ABV is an assumption, not a reading — the feed carries no strength. Matches dashboard.ts. */
const ABV_SQL = `CASE
  WHEN lt.category = 'BEER' THEN CASE WHEN UPPER(s.product_name) LIKE '%STRONG%' THEN 0.08 ELSE 0.05 END
  WHEN lt.category = 'WINE' THEN 0.12
  ELSE 0.428 END`;

export const DENOMINATORS = ['head', 'adult', 'man', 'drinker'] as const;
export type Denominator = (typeof DENOMINATORS)[number];

export interface PerCapitaRow {
  district_id: number;
  name: string;
  /** Projected 2026 population, and the three narrower counts beneath it. */
  pop: number;
  adults: number;
  adult_men: number;
  drinkers: number;
  /** NFHS-6 share of men / women 15+ who drink, per cent. */
  m6: number;
  w6: number;
  /** Observed over the window, before annualising. */
  rev: number;
  units: number;
  litres: number;
  /** Litres of pure alcohol. */
  alc: number;
  shops: number;
}

export interface PerCapitaData {
  from: string;
  to: string;
  /** Calendar days in the window — dry days included, since they are real days of nil sale. */
  days: number;
  rows: PerCapitaRow[];
  state: {
    pop: number; adults: number; adult_men: number; drinkers: number;
    rev: number; units: number; litres: number; alc: number;
  };
  popSource: string;
  popMethod: string[];
  nfhsSource: string;
}

const g = globalThis as unknown as { __tasmacPerCapita?: Map<string, PerCapitaData> };
const cache = (g.__tasmacPerCapita ??= new Map());

const addDays = (iso: string, n: number) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/** Whole days between two ISO dates, inclusive of both ends. */
const spanDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export function perCapita(): PerCapitaData {
  const d = readDb();
  const last = (d.prepare('SELECT MAX(day) AS day FROM fact_sales').get() as { day: string | null }).day ?? ANALYSIS_FROM;
  const hit = cache.get(last);
  if (hit) return hit;

  const from = ANALYSIS_FROM;
  const to = addDays(last, -1);

  const sales = d
    .prepare(
      `SELECT f.district_id AS id,
              SUM(f.units) AS units,
              SUM(f.revenue_paise) AS rev,
              SUM(f.units * COALESCE(s.volume_ml, 0)) AS ml,
              SUM(f.units * COALESCE(s.volume_ml, 0) * ${ABV_SQL}) AS alcMl
         FROM fact_sales f
         JOIN sku s ON s.sku_id = f.sku_id
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE f.day BETWEEN ? AND ?
        GROUP BY f.district_id`,
    )
    .all(from, to) as { id: number; units: number; rev: number; ml: number; alcMl: number }[];

  // Shops are the operational ones — the same denominator the district ledger uses.
  const shops = d
    .prepare(
      `SELECT district_id AS id, COUNT(*) AS n FROM shop
        WHERE ever_reported = 1 AND shop_no NOT IN (SELECT shop_no FROM shop_closure)
          AND district_id IS NOT NULL
        GROUP BY district_id`,
    )
    .all() as { id: number; n: number }[];

  const byId = new Map(sales.map((r) => [r.id, r]));
  const shopById = new Map(shops.map((r) => [r.id, r.n]));
  const nfhs = new Map(NFHS.rows.map((r) => [r.district_id, r]));

  const rows: PerCapitaRow[] = POP.districts.map((p) => {
    const s = byId.get(p.district_id);
    const n = nfhs.get(p.district_id);
    const m6 = n?.m6 ?? 0;
    const w6 = n?.w6 ?? 0;
    return {
      district_id: p.district_id,
      name: p.name,
      pop: p.pop,
      adults: p.adults,
      adult_men: p.adult_men,
      // Women's prevalence is under 2% everywhere, but leaving them out would
      // quietly make every per-drinker figure about 1% too high.
      drinkers: Math.round((p.adult_men * m6 + p.adult_women * w6) / 100),
      m6,
      w6,
      rev: s?.rev ?? 0,
      units: s?.units ?? 0,
      litres: (s?.ml ?? 0) / 1000,
      alc: (s?.alcMl ?? 0) / 1000,
      shops: shopById.get(p.district_id) ?? 0,
    };
  });

  const sum = (f: (r: PerCapitaRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const data: PerCapitaData = {
    from,
    to,
    days: spanDays(from, to),
    rows,
    state: {
      pop: sum((r) => r.pop), adults: sum((r) => r.adults), adult_men: sum((r) => r.adult_men),
      drinkers: sum((r) => r.drinkers), rev: sum((r) => r.rev), units: sum((r) => r.units),
      litres: sum((r) => r.litres), alc: sum((r) => r.alc),
    },
    popSource: POP.source,
    popMethod: POP.method,
    nfhsSource: NFHS.source,
  };

  cache.clear();
  cache.set(last, data);
  return data;
}

/** The count a denominator divides by. */
export const headCount = (r: PerCapitaRow, by: Denominator): number =>
  by === 'head' ? r.pop : by === 'adult' ? r.adults : by === 'man' ? r.adult_men : r.drinkers;
