import 'server-only';
import { readDb } from './db';

/**
 * Everything the /db dashboard draws, for the whole state or one district.
 *
 * Read from the analytics facts (fact_sales, fact_shop_day, fact_hour — see
 * src/scraper/analytics.ts), never from stock_event directly: those are built
 * on trading days with declared feed artefacts removed, which is what makes a
 * daily series here comparable day to day.
 *
 * One query set per scope, cached until the window moves. The window ends on
 * the last complete trading day, and that only changes when a new trading day
 * starts (11:00) — by which time the previous one's after-midnight reports are
 * in — so the harvester's rebuilds in between never touch what is shown.
 */

/** First full trading day. 5–9 Aug was scraper warm-up: outages, catch-up sweeps. */
export const ANALYSIS_FROM = '2026-08-10';

/** Stack order — also the order the category palette was validated in (globals.css). */
export const CATEGORIES = ['BRANDY', 'RUM', 'VODKA', 'BEER', 'WINE', 'GIN', 'WHISKY', 'OTHER'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Dry days the state declares, by name. Others are found from the data. */
export const DRY_DAYS: Record<string, string> = {
  '2026-08-15': 'independence',
  '2026-08-26': 'milad',
  '2026-10-02': 'gandhi',
};

/**
 * Alcohol by volume, for the pure-alcohol estimate only. The feed carries no
 * strength, so these are assumptions, stated wherever the figure is shown:
 * spirits at 42.8% v/v (the strength TASMAC's IMFL is sold at), strong beer
 * 8%, lager 5%, wine 12%.
 */
export const ABV_SQL = `CASE
  WHEN lt.category = 'BEER' THEN CASE WHEN UPPER(s.product_name) LIKE '%STRONG%' THEN 0.08 ELSE 0.05 END
  WHEN lt.category = 'WINE' THEN 0.12
  ELSE 0.428 END`;

export interface Totals { rev: number; units: number; ml: number; alc: number }

export interface DashboardData {
  from: string;
  to: string;
  builtAt: string | null;
  districtId: number | null;
  /** One row per trading day in the window, zero-filled. Per category: [rev paise, units, ml]. */
  daily: { day: string; cats: Record<string, [number, number, number]>; received: number; dry: string | null }[];
  /** Mean revenue (paise) by weekday (0 = Sunday) × report hour, over ordinary trading days. */
  hourly: number[][];
  totals: Totals & { shopsSelling: number; shopDays: number; shopsOperational: number };
  byCategory: (Totals & { category: string })[];
  brands: { id: number; name: string; category: string; supplierId: number | null; supplier: string | null; rev: number; units: number; ml: number }[];
  brandCount: number;
  /** Per category: [rev paise, units, ml]. */
  suppliers: { id: number; name: string; type: string | null; rev: number; units: number; ml: number; cats: Record<string, [number, number, number]> }[];
  districts: { id: number; name: string; rev: number; units: number; ml: number; shops: number; shopDays: number; operational: number }[];
  taluks: { id: number; name: string; rev: number; units: number; shops: number }[];
  sizes: { ml: number; category: string; units: number; rev: number }[];
  prices: { band: number; units: number; rev: number }[];
  /** Shops ranked by revenue, as a Lorenz curve: [share of shops, share of revenue] at 101 points. */
  lorenz: [number, number][];
  topShops: { shopNo: number; address: string | null; talukId: number | null; taluk: string | null; districtId: number | null; district: string | null; rev: number; units: number; days: number }[];
  /** Shop points for the district map: [shop_no, lat, lon, revenue paise]. */
  points: [number, number, number, number][];
}

/** Bottle price bands, upper bounds in rupees; the last is open-ended. */
export const PRICE_BANDS = [150, 200, 250, 300, 400, 600, 1000, 2000, Infinity];

// On globalThis, not module scope: Next bundles the instrumentation hook that
// warms this separately from the routes that read it, and a module-level Map
// would give each its own empty copy.
const g = globalThis as unknown as { __tasmacDashboard?: Map<string, { data: DashboardData }> };
const cache = (g.__tasmacDashboard ??= new Map());

function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
}

export function dashboard(districtId: number | null): DashboardData {
  const d = readDb();
  const builtAt =
    (d.prepare(`SELECT value FROM meta WHERE key = 'analytics_built_at'`).get() as { value: string } | undefined)?.value ?? null;
  // The window ends on the last complete trading day: the one in progress is
  // only ever a partial count.
  const last = (d.prepare('SELECT MAX(day) AS day FROM fact_sales').get() as { day: string | null }).day ?? ANALYSIS_FROM;
  const key = `${districtId ?? 'all'}|${last}`;
  const hit = cache.get(key);
  if (hit) return hit.data;
  const to = addDays(last, -1);
  const from = ANALYSIS_FROM;

  const scope = districtId == null ? '' : 'AND f.district_id = @district';
  const p = { from, to, district: districtId };

  // ── daily by category ───────────────────────────────────────
  const dailyRows = d
    .prepare(
      `SELECT f.day, COALESCE(lt.category, 'OTHER') AS category,
              SUM(f.revenue_paise) AS rev, SUM(f.units) AS units,
              SUM(f.units * COALESCE(s.volume_ml, 0)) AS ml,
              SUM(f.units * COALESCE(s.volume_ml, 0) * ${ABV_SQL}) AS alc,
              SUM(f.received) AS received
         FROM fact_sales f
         JOIN sku s ON s.sku_id = f.sku_id
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE f.day BETWEEN @from AND @to ${scope}
        GROUP BY 1, 2`,
    )
    .all(p) as { day: string; category: string; rev: number; units: number; ml: number; alc: number; received: number }[];

  const byDay = new Map<string, DashboardData['daily'][number]>();
  for (let day = from; day <= to; day = addDays(day, 1)) byDay.set(day, { day, cats: {}, received: 0, dry: null });
  const catTot = new Map<string, Totals>();
  for (const r of dailyRows) {
    const row = byDay.get(r.day);
    if (!row) continue;
    row.cats[r.category] = [r.rev, r.units, r.ml];
    row.received += r.received;
    const c = catTot.get(r.category) ?? { rev: 0, units: 0, ml: 0, alc: 0 };
    c.rev += r.rev; c.units += r.units; c.ml += r.ml; c.alc += r.alc;
    catTot.set(r.category, c);
  }
  const daily = [...byDay.values()];

  // Dry days: the declared ones by name, and any other day the whole scope sold
  // almost nothing (a local holiday, an election) marked unnamed.
  const dayRev = daily.map((r) => Object.values(r.cats).reduce((a, c) => a + c[0], 0));
  const median = [...dayRev].sort((a, b) => a - b)[Math.floor(dayRev.length / 2)] ?? 0;
  daily.forEach((r, i) => {
    if (DRY_DAYS[r.day]) r.dry = DRY_DAYS[r.day];
    else if (dayRev[i] < median * 0.1) r.dry = 'closed';
  });

  const byCategory = CATEGORIES.filter((c) => catTot.has(c)).map((c) => ({ category: c, ...(catTot.get(c) as Totals) }));
  const sum = (k: keyof Totals) => byCategory.reduce((a, c) => a + c[k], 0);

  // ── hour of day × weekday ───────────────────────────────────
  // Ordinary days only: a dry day is a zero and the day before one is a rush,
  // and either would bend the weekday they fall on.
  const skip = new Set<string>();
  for (const r of daily) if (r.dry) { skip.add(r.day); skip.add(addDays(r.day, -1)); }
  const hourRows = d
    .prepare(
      `SELECT f.day, f.hour, SUM(f.revenue_paise) AS rev FROM fact_hour f
        WHERE f.day BETWEEN @from AND @to ${scope} GROUP BY 1, 2`,
    )
    .all(p) as { day: string; hour: number; rev: number }[];
  const hSum = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const nDays = new Array(7).fill(0);
  for (const r of daily) if (!skip.has(r.day)) nDays[new Date(r.day + 'T00:00:00Z').getUTCDay()]++;
  for (const r of hourRows) {
    if (skip.has(r.day)) continue;
    hSum[new Date(r.day + 'T00:00:00Z').getUTCDay()][r.hour] += r.rev;
  }
  const hourly = hSum.map((row, w) => row.map((v) => (nDays[w] ? Math.round(v / nDays[w]) : 0)));

  // ── brands (product lines) ──────────────────────────────────
  const brandRows = d
    .prepare(
      `SELECT pl.product_line_id AS id, pl.name, COALESCE(MAX(lt.category), 'OTHER') AS category,
              pl.supplier_id AS supplierId, sp.name AS supplier,
              SUM(f.revenue_paise) AS rev, SUM(f.units) AS units, SUM(f.units * COALESCE(s.volume_ml, 0)) AS ml
         FROM fact_sales f
         JOIN sku s ON s.sku_id = f.sku_id
         JOIN product_line pl ON pl.product_line_id = s.product_line_id
         LEFT JOIN supplier sp ON sp.supplier_id = pl.supplier_id
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE f.day BETWEEN @from AND @to ${scope}
        GROUP BY pl.product_line_id
       HAVING SUM(f.units) > 0`,
    )
    .all(p) as DashboardData['brands'];
  // Ranked two ways on the page, so keep whatever makes either top 40.
  const topRev = [...brandRows].sort((a, b) => b.rev - a.rev).slice(0, 40);
  const topUnits = [...brandRows].sort((a, b) => b.units - a.units).slice(0, 40);
  const brands = [...new Map([...topRev, ...topUnits].map((b) => [b.id, b])).values()];

  // ── suppliers ───────────────────────────────────────────────
  const supRows = d
    .prepare(
      `SELECT sp.supplier_id AS id, sp.name, sp.production_type AS type, COALESCE(lt.category, 'OTHER') AS category,
              SUM(f.revenue_paise) AS rev, SUM(f.units) AS units, SUM(f.units * COALESCE(s.volume_ml, 0)) AS ml
         FROM fact_sales f
         JOIN sku s ON s.sku_id = f.sku_id
         JOIN supplier sp ON sp.supplier_id = s.supplier_id
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE f.day BETWEEN @from AND @to ${scope}
        GROUP BY 1, 4`,
    )
    .all(p) as { id: number; name: string; type: string | null; category: string; rev: number; units: number; ml: number }[];
  const supMap = new Map<number, DashboardData['suppliers'][number]>();
  for (const r of supRows) {
    const s = supMap.get(r.id) ?? { id: r.id, name: r.name, type: r.type, rev: 0, units: 0, ml: 0, cats: {} };
    s.rev += r.rev; s.units += r.units; s.ml += r.ml;
    const c = s.cats[r.category] ?? [0, 0, 0];
    c[0] += r.rev; c[1] += r.units; c[2] += r.ml;
    s.cats[r.category] = c;
    supMap.set(r.id, s);
  }
  const suppliers = [...supMap.values()].filter((s) => s.units > 0).sort((a, b) => b.rev - a.rev);

  // ── districts (always statewide — the map and ranking compare them) ──
  const districts = d
    .prepare(
      `WITH sales AS (
         SELECT district_id, SUM(f.revenue_paise) AS rev, SUM(f.units) AS units,
                SUM(f.units * COALESCE(s.volume_ml, 0)) AS ml
           FROM fact_sales f JOIN sku s ON s.sku_id = f.sku_id
          WHERE f.day BETWEEN @from AND @to GROUP BY district_id),
       shops AS (
         SELECT sh.district_id, COUNT(DISTINCT fs.shop_no) AS shops, COUNT(*) AS shopDays
           FROM fact_shop_day fs JOIN shop sh ON sh.shop_no = fs.shop_no
          WHERE fs.day BETWEEN @from AND @to GROUP BY sh.district_id)
       SELECT di.district_id AS id, di.name, COALESCE(sa.rev, 0) AS rev, COALESCE(sa.units, 0) AS units,
              COALESCE(sa.ml, 0) AS ml, COALESCE(sh.shops, 0) AS shops, COALESCE(sh.shopDays, 0) AS shopDays,
              (SELECT COUNT(*) FROM shop o WHERE o.district_id = di.district_id AND o.ever_reported = 1
                  AND o.shop_no NOT IN (SELECT shop_no FROM shop_closure)) AS operational
         FROM district di
         LEFT JOIN sales sa ON sa.district_id = di.district_id
         LEFT JOIN shops sh ON sh.district_id = di.district_id
        ORDER BY rev DESC`,
    )
    .all({ from, to }) as DashboardData['districts'];

  // ── shops: concentration, the leaders, map points, taluks ───
  const shopRows = d
    .prepare(
      `SELECT fs.shop_no AS shopNo, SUM(fs.revenue_paise) AS rev, SUM(fs.units) AS units, COUNT(*) AS days,
              sh.latitude AS lat, sh.longitude AS lon, sh.address, sh.taluk_id AS talukId, t.name AS taluk,
              sh.district_id AS districtId, di.name AS district
         FROM fact_shop_day fs
         JOIN shop sh ON sh.shop_no = fs.shop_no
         LEFT JOIN taluk t ON t.taluk_id = sh.taluk_id
         LEFT JOIN district di ON di.district_id = sh.district_id
        WHERE fs.day BETWEEN @from AND @to ${districtId == null ? '' : 'AND sh.district_id = @district'}
        GROUP BY fs.shop_no
        ORDER BY rev DESC`,
    )
    .all(p) as {
      shopNo: number; rev: number; units: number; days: number; lat: number | null; lon: number | null;
      address: string | null; talukId: number | null; taluk: string | null; districtId: number | null; district: string | null;
    }[];

  const shopTotal = shopRows.reduce((a, s) => a + s.rev, 0);
  const lorenz: [number, number][] = [[0, 0]];
  if (shopRows.length) {
    let cum = 0;
    let next = 1;
    shopRows.forEach((s, i) => {
      cum += s.rev;
      while (next <= 100 && (i + 1) / shopRows.length >= next / 100) {
        lorenz.push([next / 100, shopTotal ? cum / shopTotal : 0]);
        next++;
      }
    });
  }
  const topShops = shopRows.slice(0, 15).map(({ shopNo, address, talukId, taluk, districtId, district, rev, units, days }) => ({
    shopNo, address, talukId, taluk, districtId, district, rev, units, days,
  }));
  const points: DashboardData['points'] =
    districtId == null
      ? []
      : shopRows.filter((s) => s.lat != null && s.lon != null).map((s) => [s.shopNo, s.lat as number, s.lon as number, s.rev]);

  const talukMap = new Map<number, DashboardData['taluks'][number]>();
  if (districtId != null) {
    for (const s of shopRows) {
      if (s.talukId == null) continue;
      const t = talukMap.get(s.talukId) ?? { id: s.talukId, name: s.taluk ?? '—', rev: 0, units: 0, shops: 0 };
      t.rev += s.rev; t.units += s.units; t.shops++;
      talukMap.set(s.talukId, t);
    }
  }
  const taluks = [...talukMap.values()].sort((a, b) => b.rev - a.rev);

  // ── bottle sizes, price bands ───────────────────────────────
  const sizes = d
    .prepare(
      `SELECT COALESCE(s.volume_ml, 0) AS ml, COALESCE(lt.category, 'OTHER') AS category,
              SUM(f.units) AS units, SUM(f.revenue_paise) AS rev
         FROM fact_sales f JOIN sku s ON s.sku_id = f.sku_id
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE f.day BETWEEN @from AND @to ${scope}
        GROUP BY 1, 2 HAVING SUM(f.units) > 0`,
    )
    .all(p) as DashboardData['sizes'];

  const bandCase = PRICE_BANDS.slice(0, -1)
    .map((b, i) => `WHEN s.mrp <= ${b} THEN ${i}`)
    .join(' ');
  const prices = d
    .prepare(
      `SELECT CASE ${bandCase} ELSE ${PRICE_BANDS.length - 1} END AS band,
              SUM(f.units) AS units, SUM(f.revenue_paise) AS rev
         FROM fact_sales f JOIN sku s ON s.sku_id = f.sku_id
        WHERE f.day BETWEEN @from AND @to AND s.mrp IS NOT NULL ${scope}
        GROUP BY 1 ORDER BY 1`,
    )
    .all(p) as DashboardData['prices'];

  const operational =
    districtId == null
      ? districts.reduce((a, x) => a + x.operational, 0)
      : districts.find((x) => x.id === districtId)?.operational ?? 0;

  const data: DashboardData = {
    from, to, builtAt, districtId,
    daily, hourly,
    totals: {
      rev: sum('rev'), units: sum('units'), ml: sum('ml'), alc: sum('alc'),
      shopsSelling: shopRows.length,
      shopDays: shopRows.reduce((a, s) => a + s.days, 0),
      shopsOperational: operational,
    },
    byCategory,
    brands, brandCount: brandRows.length,
    suppliers,
    districts, taluks,
    sizes, prices,
    lorenz, topShops, points,
  };
  // Drop entries for windows that have moved on.
  for (const k of cache.keys()) if (!k.endsWith(`|${last}`)) cache.delete(k);
  cache.set(key, { data });
  return data;
}
