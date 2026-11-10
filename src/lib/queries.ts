import 'server-only';
import { readDb } from './db';

const q = <T>(sql: string, ...params: unknown[]): T[] => readDb().prepare(sql).all(...params) as T[];
const q1 = <T>(sql: string, ...params: unknown[]): T | undefined => readDb().prepare(sql).get(...params) as T | undefined;

/**
 * Corrected-spelling joins.
 *
 * `name_alias` holds only the rows a spelling rule actually changed — 295 of
 * 3,838 — so these are LEFT JOINs against a small table and COALESCE back to the
 * upstream text for everything else. See src/lib/name-rules.ts.
 */
const ALIAS_SKU = `LEFT JOIN name_alias nask ON nask.entity = 'sku' AND nask.entity_id = s.sku_id`;
const ALIAS_LINE = `LEFT JOIN name_alias napl ON napl.entity = 'product_line' AND napl.entity_id = pl.product_line_id`;
const ALIAS_SUP = `LEFT JOIN name_alias nasu ON nasu.entity = 'supplier' AND nasu.entity_id = sup.supplier_id`;

/**
 * Sorting.
 *
 * Every ledger column is sortable, so each list query carries a whitelist of
 * column key → SQL expression. The key comes off the query string, so it is
 * matched against the map rather than interpolated: an unknown key falls back to
 * the query's own default instead of reaching the SQL text.
 */
export type Dir = 'asc' | 'desc';

function orderBy(
  map: Record<string, string>,
  key: string | undefined,
  dir: Dir | undefined,
  fallback: string,
): string {
  const col = key && map[key];
  if (!col) return fallback;
  const d = dir === 'asc' ? 'ASC' : 'DESC';
  // NULLS LAST in both directions: an unreported shop is absent data, not a
  // zero, and should never occupy the top of a ranking either way round.
  return `${col} ${d} NULLS LAST`;
}

// ─────────────────────────── overview ───────────────────────────

export interface Totals {
  shops_reporting: number;
  shops_registered: number;
  units: number;
  value_paise: number;
  skus_live: number;
  districts: number;
  reported_at: string | null;
  snapshot_at: string | null;
}

/**
 * District scope.
 *
 * The overview queries below all take an optional `districtId`. Passing one
 * narrows every figure to that district's shops; omitting it leaves them
 * statewide, which is the shape they had before the homepage grew a district
 * picker. The scope is applied as a real JOIN rather than a
 * `(? IS NULL OR district_id = ?)` predicate, because the latter defeats the
 * index and makes the unscoped (overwhelmingly common) case pay for the
 * feature.
 *
 * Note for Chennai specifically: the consumer API's "Chennai" revenue district
 * is the sixteen taluks of the Greater Chennai Corporation area — Alandur and
 * Sholinganallur through Tondiarpet and Thiruvottiyur — so scoping to it gives
 * the corporation, not the older and much smaller Chennai district.
 */
const inDistrict = (on: string, scoped: boolean) =>
  scoped ? `JOIN shop ${on}d ON ${on}d.shop_no = ${on}.shop_no AND ${on}d.district_id = ?` : '';

export function totals(districtId?: number): Totals {
  const scoped = districtId != null;
  const snap = q1<{ snapshot_id: number; started_at: string }>(
    `SELECT snapshot_id, started_at FROM snapshot WHERE status IN ('ok','partial') ORDER BY snapshot_id DESC LIMIT 1`,
  );
  const base = q1<Omit<Totals, 'shops_registered' | 'districts' | 'snapshot_at'>>(
    // Parameter order follows the SQL text, so the subquery's binding comes
    // before the outer join's.
    `SELECT COUNT(*) AS shops_reporting,
            COALESCE(SUM(r.units),0) AS units,
            COALESCE(SUM(r.value_paise),0) AS value_paise,
            (SELECT COUNT(DISTINCT sc.sku_id) FROM stock_current sc
                    ${inDistrict('sc', scoped)}
              WHERE sc.qty > 0) AS skus_live,
            MAX(r.reported_at) AS reported_at
       FROM shop_report r
       ${inDistrict('r', scoped)}
      WHERE r.snapshot_id = ?`,
    ...(scoped ? [districtId, districtId] : []),
    snap?.snapshot_id ?? -1,
  )!;
  const extra = q1<{ shops_registered: number; districts: number }>(
    // The denominator is *operational* shops only: closed (announced) shops and
    // dormant shops (never reported since the mirror began) both come out, since
    // neither was ever going to report today. What remains is shops genuinely
    // expected to report — so the rate reflects real stoppages. Closed/dormant
    // shops stay in `shop`; this only changes what "registered" counts here.
    `SELECT (SELECT COUNT(*) FROM shop
              WHERE ever_reported = 1
                    AND shop_no NOT IN (SELECT shop_no FROM shop_closure)
                    ${scoped ? 'AND district_id = ?' : ''}) AS shops_registered,
            (SELECT COUNT(*) FROM district) AS districts`,
    ...(scoped ? [districtId] : []),
  )!;
  return { ...base, ...extra, snapshot_at: snap?.started_at ?? null };
}

export interface CategorySlice {
  category: string;
  units: number;
  value_paise: number;
  skus: number;
}

export function byCategory(districtId?: number): CategorySlice[] {
  const scoped = districtId != null;
  return q<CategorySlice>(
    `SELECT lt.category,
            SUM(sc.qty) AS units,
            SUM(sc.qty * COALESCE(s.mrp,0)) * 100 AS value_paise,
            COUNT(DISTINCT sc.sku_id) AS skus
       FROM stock_current sc
       ${inDistrict('sc', scoped)}
       JOIN sku s ON s.sku_id = sc.sku_id
       LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
      WHERE sc.qty > 0
      GROUP BY lt.category
      ORDER BY value_paise DESC`,
    ...(scoped ? [districtId] : []),
  );
}

export interface DistrictRow {
  district_id: number;
  district: string;
  shops_reporting: number;
  shops_registered: number;
  units: number;
  value_paise: number;
  per_shop_paise: number | null;
  reported_at: string | null;
}

/** Column keys the districts ledger can be sorted on, matching its headings. */
export const DISTRICT_SORTS: Record<string, string> = {
  district: 'd.name',
  share: 'value_paise',
  reporting: 'shops_reporting',
  bottles: 'units',
  value: 'value_paise',
  per_shop: 'per_shop_paise',
  counted: 'reported_at',
};

export function districts(sort?: string, dir?: Dir): DistrictRow[] {
  return q<DistrictRow>(
    `WITH latest AS (SELECT MAX(snapshot_id) AS id FROM snapshot WHERE status IN ('ok','partial'))
     SELECT d.district_id, d.name AS district,
            COUNT(r.shop_no) AS shops_reporting,
            (SELECT COUNT(*) FROM shop WHERE district_id = d.district_id
               AND ever_reported = 1
               AND shop_no NOT IN (SELECT shop_no FROM shop_closure)) AS shops_registered,
            COALESCE(SUM(r.units),0) AS units,
            COALESCE(SUM(r.value_paise),0) AS value_paise,
            CASE WHEN COUNT(r.shop_no) > 0
                 THEN COALESCE(SUM(r.value_paise),0) * 1.0 / COUNT(r.shop_no) END AS per_shop_paise,
            MAX(r.reported_at) AS reported_at
       FROM district d
       LEFT JOIN shop sh ON sh.district_id = d.district_id
       LEFT JOIN shop_report r ON r.shop_no = sh.shop_no AND r.snapshot_id = (SELECT id FROM latest)
      GROUP BY d.district_id
      ORDER BY ${orderBy(DISTRICT_SORTS, sort, dir, 'value_paise DESC')}`,
  );
}

// ─────────────────────────── movement ───────────────────────────

export interface MoverRow {
  sku_id: number;
  product_name: string;
  unit_name: string | null;
  category: string | null;
  supplier_name: string | null;
  mrp: number | null;
  units_sold: number;
  revenue_paise: number;
  closing_units: number;
  shops_stocking: number;
}

export function topMovers(limit = 25, day?: string, districtId?: number): MoverRow[] {
  if (districtId != null) return topMoversIn(districtId, limit, day);
  return q<MoverRow>(
    `SELECT s.sku_id, COALESCE(nask.display_name, s.product_name) AS product_name,
            s.unit_name, lt.category, COALESCE(nasu.display_name, sup.name) AS supplier_name, s.mrp,
            COALESCE(SUM(sd.units_sold),0) AS units_sold,
            COALESCE(SUM(sd.revenue_paise),0) AS revenue_paise,
            COALESCE((SELECT SUM(qty) FROM stock_current WHERE sku_id = s.sku_id),0) AS closing_units,
            COALESCE((SELECT COUNT(*) FROM stock_current WHERE sku_id = s.sku_id AND qty > 0),0) AS shops_stocking
       FROM sku_daily sd
       JOIN sku s ON s.sku_id = sd.sku_id
       LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
       LEFT JOIN supplier sup ON sup.supplier_id = s.supplier_id
       ${ALIAS_SKU}
       ${ALIAS_SUP}
      WHERE (? IS NULL OR sd.day = ?)
      GROUP BY s.sku_id
      HAVING units_sold > 0
      ORDER BY revenue_paise DESC
      LIMIT ?`,
    day ?? null,
    day ?? null,
    limit,
  );
}

/**
 * The same ranking, for one district.
 *
 * `sku_daily` is a statewide rollup with no geography in it, so a district's
 * movement has to be re-derived from the change log: every negative delta
 * recorded against a shop in that district is stock that left its shelves.
 * That is the same definition `rollup.ts` applies statewide, so the two agree,
 * with one caveat — revenue here values the depletion at the SKU's *current*
 * MRP, where the rollup banked it at the MRP of the day. Over a price change
 * the district figure re-values history that the statewide one does not.
 */
function topMoversIn(districtId: number, limit: number, day?: string): MoverRow[] {
  return q<MoverRow>(
    `WITH cur AS (
        SELECT sc.sku_id,
               SUM(sc.qty) AS closing_units,
               SUM(CASE WHEN sc.qty > 0 THEN 1 ELSE 0 END) AS shops_stocking
          FROM stock_current sc
          JOIN shop shc ON shc.shop_no = sc.shop_no AND shc.district_id = ?
         GROUP BY sc.sku_id
      ),
      sold AS (
        SELECT e.sku_id, SUM(-e.delta) AS units_sold
          FROM stock_event e
          JOIN shop she ON she.shop_no = e.shop_no AND she.district_id = ?
         WHERE e.delta < 0 AND (? IS NULL OR date(e.observed_at) = ?)
         GROUP BY e.sku_id
      )
      SELECT s.sku_id, COALESCE(nask.display_name, s.product_name) AS product_name,
             s.unit_name, lt.category, COALESCE(nasu.display_name, sup.name) AS supplier_name, s.mrp,
             sold.units_sold AS units_sold,
             sold.units_sold * COALESCE(s.mrp,0) * 100 AS revenue_paise,
             COALESCE(cur.closing_units,0) AS closing_units,
             COALESCE(cur.shops_stocking,0) AS shops_stocking
        FROM sold
        JOIN sku s ON s.sku_id = sold.sku_id
        LEFT JOIN cur ON cur.sku_id = sold.sku_id
        LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        LEFT JOIN supplier sup ON sup.supplier_id = s.supplier_id
        ${ALIAS_SKU}
        ${ALIAS_SUP}
       WHERE sold.units_sold > 0
       ORDER BY revenue_paise DESC
       LIMIT ?`,
    districtId,
    districtId,
    day ?? null,
    day ?? null,
    limit,
  );
}

/** Widest-stocked SKUs — the state's real bestsellers by shelf presence. */
export function topByPresence(limit = 25, districtId?: number): MoverRow[] {
  const scoped = districtId != null;
  return q<MoverRow>(
    `SELECT s.sku_id, COALESCE(nask.display_name, s.product_name) AS product_name,
            s.unit_name, lt.category, COALESCE(nasu.display_name, sup.name) AS supplier_name, s.mrp,
            0 AS units_sold, 0 AS revenue_paise,
            SUM(sc.qty) AS closing_units,
            COUNT(*) AS shops_stocking
       FROM stock_current sc
       ${inDistrict('sc', scoped)}
       JOIN sku s ON s.sku_id = sc.sku_id
       LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
       LEFT JOIN supplier sup ON sup.supplier_id = s.supplier_id
       ${ALIAS_SKU}
       ${ALIAS_SUP}
      WHERE sc.qty > 0
      GROUP BY s.sku_id
      ORDER BY shops_stocking DESC, closing_units DESC
      LIMIT ?`,
    ...(scoped ? [districtId] : []),
    limit,
  );
}

export interface SnapshotRow {
  snapshot_id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  shops_seen: number;
  rows_seen: number;
  events_written: number;
  districts_ok: number;
  districts_failed: number;
}

export function snapshots(limit = 24): SnapshotRow[] {
  return q<SnapshotRow>('SELECT * FROM snapshot ORDER BY snapshot_id DESC LIMIT ?', limit);
}

/**
 * Statewide inventory value over time, one point per snapshot.
 *
 * Restricted to sweeps that actually covered the whole state — a partial run
 * (a single district, or one that lost half its districts to timeouts) would
 * otherwise show up as a cliff in statewide holding that never happened.
 */
export interface ValuePoint { snapshot_id: number; at: string; value_paise: number; units: number; shops: number }

export function valueSeries(limit = 120, districtId?: number): ValuePoint[] {
  const scoped = districtId != null;
  return q<ValuePoint>(
    `SELECT sn.snapshot_id, sn.started_at AS at,
            COALESCE(SUM(r.value_paise),0) AS value_paise,
            COALESCE(SUM(r.units),0) AS units,
            COUNT(r.shop_no) AS shops
       FROM snapshot sn LEFT JOIN shop_report r ON r.snapshot_id = sn.snapshot_id
       ${scoped ? 'LEFT JOIN shop rd ON rd.shop_no = r.shop_no' : ''}
      WHERE sn.status IN ('ok','partial')
        AND sn.districts_ok >= (SELECT COUNT(*) * 0.9 FROM district)
        ${scoped ? 'AND rd.district_id = ?' : ''}
      GROUP BY sn.snapshot_id
      ORDER BY sn.snapshot_id DESC
      LIMIT ?`,
    ...(scoped ? [districtId] : []),
    limit,
  ).reverse();
}

export interface TalukRow {
  taluk_id: number;
  taluk: string;
  shops_reporting: number;
  shops_registered: number;
  units: number;
  value_paise: number;
  reported_at: string | null;
}

/**
 * One district's taluks, shaped like `districts()` so the homepage's district
 * ledger can drill into a district without a second table.
 */
export function taluks(districtId: number): TalukRow[] {
  return q<TalukRow>(
    `WITH latest AS (SELECT MAX(snapshot_id) AS id FROM snapshot WHERE status IN ('ok','partial'))
     SELECT tk.taluk_id, tk.name AS taluk,
            COUNT(r.shop_no) AS shops_reporting,
            (SELECT COUNT(*) FROM shop
              WHERE taluk_id = tk.taluk_id
                AND ever_reported = 1
                AND shop_no NOT IN (SELECT shop_no FROM shop_closure)) AS shops_registered,
            COALESCE(SUM(r.units),0) AS units,
            COALESCE(SUM(r.value_paise),0) AS value_paise,
            MAX(r.reported_at) AS reported_at
       FROM taluk tk
       LEFT JOIN shop sh ON sh.taluk_id = tk.taluk_id
       LEFT JOIN shop_report r ON r.shop_no = sh.shop_no AND r.snapshot_id = (SELECT id FROM latest)
      WHERE tk.district_id = ?
      GROUP BY tk.taluk_id
      ORDER BY value_paise DESC`,
    districtId,
  );
}

// ─────────────────────────── shops ───────────────────────────

export interface ShopRow {
  shop_no: number;
  district: string | null;
  district_id: number | null;
  taluk: string | null;
  taluk_id: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_mall_shop: number;
  dm_office: string | null;
  units: number | null;
  value_paise: number | null;
  sku_count: number | null;
  reported_at: string | null;
}

export interface ShopListOpts {
  districtId?: number;
  regionId?: number;
  search?: string;
  shopClass?: string;
  /** Map viewport: [south, west, north, east]. */
  bbox?: [number, number, number, number];
  sort?: string;
  dir?: Dir;
  limit?: number;
  offset?: number;
}

/** Column keys the shops ledger can be sorted on, matching its headings. */
export const SHOP_SORTS: Record<string, string> = {
  shop: 'v.shop_no',
  class: 'v.shop_class',
  where: 'v.taluk',
  address: 'v.address',
  skus: 'r.sku_count',
  bottles: 'r.units',
  value: 'r.value_paise',
  counted: 'r.reported_at',
  // Older intent-named links.
  number: 'v.shop_no',
  units: 'r.units',
};

/**
 * Sorting defaults to shop number, not stock value. Value-sorting is a
 * legitimate view but a misleading default: elite/mall outlets carry roughly
 * three times the stock of an ordinary shop, so ranking by value fills the whole
 * first page with them and reads as though every shop were a mall shop.
 */
export function shopList(opts: ShopListOpts = {}) {
  const { districtId, regionId, search, shopClass, bbox, sort, dir, limit = 100, offset = 0 } = opts;

  const where = `
    WHERE (? IS NULL OR v.district_id = ?)
      AND (? IS NULL OR v.region_id = ?)
      AND (? IS NULL OR v.shop_class = ?)
      AND (? IS NULL OR v.shop_no = CAST(? AS INTEGER) OR v.address LIKE '%' || ? || '%'
           OR v.taluk LIKE '%' || ? || '%' OR v.district LIKE '%' || ? || '%')
      AND (? IS NULL OR (v.lat BETWEEN ? AND ? AND v.lon BETWEEN ? AND ?))`;

  const params = [
    districtId ?? null, districtId ?? null,
    regionId ?? null, regionId ?? null,
    shopClass ?? null, shopClass ?? null,
    search ?? null, search ?? null, search ?? null, search ?? null, search ?? null,
    bbox ? 1 : null, bbox?.[0] ?? null, bbox?.[2] ?? null, bbox?.[1] ?? null, bbox?.[3] ?? null,
  ];

  const order = orderBy(
    SHOP_SORTS,
    sort,
    dir ?? (sort === 'number' || sort === 'shop' ? 'asc' : undefined),
    'v.shop_no ASC',
  );

  const rows = q<ShopRow>(
    `WITH latest AS (SELECT MAX(snapshot_id) AS id FROM snapshot WHERE status IN ('ok','partial'))
     SELECT v.*, r.units, r.value_paise, r.sku_count, r.reported_at
       FROM v_shop_full v
       LEFT JOIN shop_report r ON r.shop_no = v.shop_no AND r.snapshot_id = (SELECT id FROM latest)
       ${where}
      ORDER BY ${order}
      LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  const total = q1<{ n: number }>(`SELECT COUNT(*) AS n FROM v_shop_full v ${where}`, ...params)!.n;
  return { rows, total };
}

/** Lightweight point set for the map — no stock join, so it stays fast at 4,800 rows. */
export function shopPoints(opts: ShopListOpts = {}) {
  const { districtId, regionId, shopClass, search } = opts;
  return q<{ shop_no: number; lat: number; lon: number; shop_class: string | null; taluk: string | null; district: string | null }>(
    `SELECT v.shop_no, v.lat, v.lon, v.shop_class, v.taluk, v.district
       FROM v_shop_full v
      WHERE v.lat IS NOT NULL AND v.lon IS NOT NULL
        AND (? IS NULL OR v.district_id = ?)
        AND (? IS NULL OR v.region_id = ?)
        AND (? IS NULL OR v.shop_class = ?)
        AND (? IS NULL OR v.shop_no = CAST(? AS INTEGER) OR v.address LIKE '%' || ? || '%'
             OR v.taluk LIKE '%' || ? || '%' OR v.district LIKE '%' || ? || '%')`,
    districtId ?? null, districtId ?? null,
    regionId ?? null, regionId ?? null,
    shopClass ?? null, shopClass ?? null,
    search ?? null, search ?? null, search ?? null, search ?? null, search ?? null,
  );
}

export function regionNames(): { region_id: number; name: string }[] {
  return q('SELECT region_id, name FROM tasmac_region ORDER BY name');
}

/** Nearest shops to a point, with straight-line distance in metres. */
export function nearbyShops(lat: number, lon: number, limit = 8) {
  // Bound the scan to a ~0.5° box first (roughly 55 km) so this stays an index
  // range scan rather than a haversine over every shop in the state.
  return q<{
    shop_no: number; lat: number; lon: number; taluk: string | null; district: string | null;
    address: string | null; shop_class: string | null; distance_m: number;
    units: number | null; value_paise: number | null; sku_count: number | null; reported_at: string | null;
  }>(
    `WITH latest AS (SELECT MAX(snapshot_id) AS id FROM snapshot WHERE status IN ('ok','partial')),
     near AS (
       SELECT v.*,
              6371000 * 2 * ASIN(SQRT(
                POWER(SIN(RADIANS(v.lat - ?) / 2), 2) +
                COS(RADIANS(?)) * COS(RADIANS(v.lat)) *
                POWER(SIN(RADIANS(v.lon - ?) / 2), 2)
              )) AS distance_m
         FROM v_shop_full v
        WHERE v.lat BETWEEN ? - 0.5 AND ? + 0.5
          AND v.lon BETWEEN ? - 0.5 AND ? + 0.5
     )
     SELECT n.shop_no, n.lat, n.lon, n.taluk, n.district, n.address, n.shop_class,
            CAST(n.distance_m AS INTEGER) AS distance_m,
            r.units, r.value_paise, r.sku_count, r.reported_at
       FROM near n
       LEFT JOIN shop_report r ON r.shop_no = n.shop_no AND r.snapshot_id = (SELECT id FROM latest)
      ORDER BY n.distance_m
      LIMIT ?`,
    lat, lat, lon, lat, lat, lon, lon, limit,
  );
}

export function shop(shopNo: number): ShopRow | undefined {
  return q1<ShopRow>(
    `WITH latest AS (SELECT MAX(snapshot_id) AS id FROM snapshot WHERE status IN ('ok','partial'))
     SELECT v.*, r.units, r.value_paise, r.sku_count, r.reported_at
       FROM v_shop_full v
       LEFT JOIN shop_report r ON r.shop_no = v.shop_no AND r.snapshot_id = (SELECT id FROM latest)
      WHERE v.shop_no = ?`,
    shopNo,
  );
}

export interface ShopStockRow {
  sku_id: number;
  product_name: string;
  unit_name: string | null;
  pack_size: number | null;
  category: string | null;
  liquor_type: string | null;
  supplier_name: string | null;
  mrp: number | null;
  qty: number;
  value_paise: number;
  is_premium: number;
}

/** Column keys a single shop's stock ledger can be sorted on. */
export const SHOP_STOCK_SORTS: Record<string, string> = {
  product: 'product_name',
  size: 's.volume_ml',
  category: 'lt.category',
  supplier: 'supplier_name',
  mrp: 's.mrp',
  bottles: 'sc.qty',
  value: 'value_paise',
};

export function shopStock(shopNo: number, sort?: string, dir?: Dir): ShopStockRow[] {
  return q<ShopStockRow>(
    `SELECT sc.sku_id, COALESCE(nask.display_name, s.product_name) AS product_name,
            s.unit_name, s.pack_size, lt.category, lt.name AS liquor_type,
            lt.is_premium, COALESCE(nasu.display_name, sup.name) AS supplier_name, s.mrp, sc.qty,
            sc.qty * COALESCE(s.mrp,0) * 100 AS value_paise
       FROM stock_current sc
       JOIN sku s ON s.sku_id = sc.sku_id
       LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
       LEFT JOIN supplier sup ON sup.supplier_id = s.supplier_id
       ${ALIAS_SKU}
       ${ALIAS_SUP}
      WHERE sc.shop_no = ? AND sc.qty > 0
      ORDER BY ${orderBy(SHOP_STOCK_SORTS, sort, dir, 'value_paise DESC')}`,
    shopNo,
  );
}

/**
 * What a shop actually sells, by liquor category.
 *
 * Built from the change log rather than the rollups: `shop_daily` totals a
 * shop's trade but does not keep it split by category, and the split is the
 * whole point here. Every fall in stock is a sale, valued at that SKU's MRP —
 * the same inference the daily figures use, and subject to the same floor
 * (anything sold and restocked between two readings is invisible).
 */
export function shopSalesByCategory(shopNo: number, days = 30) {
  return q<{ category: string | null; units: number; revenue_paise: number; skus: number }>(
    `SELECT lt.category,
            SUM(-e.delta) AS units,
            SUM(-e.delta * COALESCE(s.mrp, 0)) * 100 AS revenue_paise,
            COUNT(DISTINCT e.sku_id) AS skus
       FROM stock_event e
       JOIN sku s ON s.sku_id = e.sku_id
       LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
      WHERE e.shop_no = ?
        AND e.delta < 0
        AND e.observed_at >= DATE('now', '-' || ? || ' days')
      GROUP BY lt.category
      HAVING units > 0
      ORDER BY revenue_paise DESC`,
    shopNo, days,
  );
}

export function shopDaily(shopNo: number, limit = 30) {
  return q<{
    day: string; opening_units: number; closing_units: number; opening_paise: number;
    closing_paise: number; units_sold: number; units_received: number;
    revenue_paise: number; restock_paise: number; stockouts: number; sku_count: number;
  }>('SELECT * FROM shop_daily WHERE shop_no = ? ORDER BY day DESC LIMIT ?', shopNo, limit).reverse();
}

export function shopActivity(shopNo: number, limit = 60) {
  return q<{
    observed_at: string; reported_at: string | null; sku_id: number;
    product_name: string; unit_name: string | null; qty: number; prev_qty: number | null;
    delta: number | null; mrp: number | null;
  }>(
    `SELECT e.observed_at, e.reported_at, e.sku_id,
            COALESCE(nask.display_name, s.product_name) AS product_name, s.unit_name,
            e.qty, e.prev_qty, e.delta, s.mrp
       FROM stock_event e JOIN sku s ON s.sku_id = e.sku_id
       ${ALIAS_SKU}
      WHERE e.shop_no = ? AND e.prev_qty IS NOT NULL
      ORDER BY e.event_id DESC LIMIT ?`,
    shopNo, limit,
  );
}

/** Snapshot-by-snapshot inventory trace for one shop. */
export function shopSeries(shopNo: number, limit = 96) {
  return q<{ at: string; reported_at: string | null; units: number; value_paise: number; sku_count: number }>(
    `SELECT sn.started_at AS at, r.reported_at, r.units, r.value_paise, r.sku_count
       FROM shop_report r JOIN snapshot sn ON sn.snapshot_id = r.snapshot_id
      WHERE r.shop_no = ? ORDER BY sn.snapshot_id DESC LIMIT ?`,
    shopNo, limit,
  ).reverse();
}

// ─────────────────────────── catalogue ───────────────────────────

export interface SkuRow {
  sku_id: number;
  product_name: string;
  raw_product_name: string;
  product_line: string;
  raw_product_line: string;
  raw_supplier_name: string | null;
  product_line_id: number;
  unit_name: string | null;
  volume_ml: number | null;
  pack_size: number | null;
  category: string | null;
  liquor_type: string | null;
  is_premium: number;
  delisted: number;
  registered: number;
  supplier_id: number | null;
  supplier_name: string | null;
  production_type: string | null;
  supplier_city: string | null;
  supplier_type: string | null;
  mrp: number | null;
  shops_stocking: number;
  units: number;
  value_paise: number;
}

const SKU_SELECT = `
  SELECT f.*,
         COALESCE(a.shops, 0) AS shops_stocking,
         COALESCE(a.units, 0) AS units,
         COALESCE(a.units,0) * COALESCE(f.mrp,0) * 100 AS value_paise
    FROM v_sku_full f
    LEFT JOIN (SELECT sku_id, COUNT(*) AS shops, SUM(qty) AS units
                 FROM stock_current WHERE qty > 0 GROUP BY sku_id) a ON a.sku_id = f.sku_id`;

/** Column keys the catalogue ledger can be sorted on, matching its headings. */
export const SKU_SORTS: Record<string, string> = {
  product: 'f.product_name',
  size: 'f.volume_ml',
  category: 'f.category',
  supplier: 'f.supplier_name',
  mrp: 'f.mrp',
  shops: 'shops_stocking',
  bottles: 'units',
  value: 'value_paise',
  // Kept for the older ?sort= links, which named an intent rather than a column.
  reach: 'shops_stocking',
  price: 'f.mrp',
  name: 'f.product_name',
};

export function skuList(opts: {
  search?: string; category?: string; supplierId?: number; productLineId?: number;
  inStockOnly?: boolean; sort?: string; dir?: Dir; limit?: number; offset?: number;
} = {}) {
  const { search, category, supplierId, productLineId, inStockOnly, sort, dir, limit = 100, offset = 0 } = opts;
  // `name` and `price` came from the old intent-named chips and carry their own
  // direction; everything else defaults to descending, which is what a reader
  // wants from a column of money.
  const defaultDir: Dir | undefined = dir ?? (sort === 'name' || sort === 'product' ? 'asc' : undefined);
  const order = orderBy(SKU_SORTS, sort, defaultDir, 'value_paise DESC');

  const where = `
    WHERE (? IS NULL OR f.product_name LIKE '%' || ? || '%' OR f.raw_product_name LIKE '%' || ? || '%'
           OR f.supplier_name LIKE '%' || ? || '%')
      AND (? IS NULL OR f.category = ?)
      AND (? IS NULL OR f.supplier_id = ?)
      AND (? IS NULL OR f.product_line_id = ?)
      AND (? = 0 OR COALESCE(a.units,0) > 0)`;
  const params = [
    search ?? null, search ?? null, search ?? null, search ?? null,
    category ?? null, category ?? null,
    supplierId ?? null, supplierId ?? null,
    productLineId ?? null, productLineId ?? null,
    inStockOnly ? 1 : 0,
  ];

  const rows = q<SkuRow>(`${SKU_SELECT} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, limit, offset);
  const total = q1<{ n: number }>(
    `SELECT COUNT(*) AS n FROM v_sku_full f
       LEFT JOIN (SELECT sku_id, SUM(qty) AS units FROM stock_current WHERE qty > 0 GROUP BY sku_id) a
              ON a.sku_id = f.sku_id ${where}`,
    ...params,
  )!.n;
  return { rows, total };
}

export function sku(skuId: number): SkuRow | undefined {
  return q1<SkuRow>(`${SKU_SELECT} WHERE f.sku_id = ?`, skuId);
}

/** Sibling bottlings of the same product line. */
export function skuSiblings(productLineId: number) {
  return q<SkuRow>(`${SKU_SELECT} WHERE f.product_line_id = ? ORDER BY f.volume_ml`, productLineId);
}

/** Per-SKU current stock, with the fields the cost breakdown needs. */
export function costBreakdownRows() {
  return q<{ units: number; mrp: number; volume_ml: number | null; category: string | null; liquor_type: string | null; is_premium: number }>(
    `SELECT SUM(sc.qty) AS units, f.mrp, f.volume_ml, f.category, f.liquor_type, f.is_premium
       FROM stock_current sc JOIN v_sku_full f ON f.sku_id = sc.sku_id
      WHERE sc.qty > 0 AND f.mrp > 0
      GROUP BY sc.sku_id`,
  );
}

export function skuPriceHistory(skuId: number) {
  return q<{ mrp: number; buyback_amt: number | null; observed_from: string; observed_to: string | null; source: string | null }>(
    'SELECT mrp, buyback_amt, observed_from, observed_to, source FROM mrp_history WHERE sku_id = ? ORDER BY observed_from',
    skuId,
  );
}

export function skuDaily(skuId: number, limit = 30) {
  return q<{
    day: string; units_sold: number; units_received: number; revenue_paise: number;
    closing_units: number; shops_stocking: number; shops_stocked_out: number;
  }>('SELECT * FROM sku_daily WHERE sku_id = ? ORDER BY day DESC LIMIT ?', skuId, limit).reverse();
}

export function skuByDistrict(skuId: number) {
  return q<{ district_id: number; district: string; shops: number; units: number }>(
    `SELECT d.district_id, d.name AS district, COUNT(*) AS shops, SUM(sc.qty) AS units
       FROM stock_current sc JOIN shop sh ON sh.shop_no = sc.shop_no
       JOIN district d ON d.district_id = sh.district_id
      WHERE sc.sku_id = ? AND sc.qty > 0
      GROUP BY d.district_id ORDER BY units DESC`,
    skuId,
  );
}

export function skuTopShops(skuId: number, limit = 12) {
  return q<{ shop_no: number; district: string | null; taluk: string | null; qty: number }>(
    `SELECT sc.shop_no, v.district, v.taluk, sc.qty
       FROM stock_current sc JOIN v_shop_full v ON v.shop_no = sc.shop_no
      WHERE sc.sku_id = ? AND sc.qty > 0 ORDER BY sc.qty DESC LIMIT ?`,
    skuId, limit,
  );
}

/** Statewide stock trace for one SKU. */
export function skuSeries(skuId: number, limit = 96) {
  // Forced onto (sku_id, observed_at) and bounded to the last ~600 snapshots (~8 days): the unbounded
  // join scanned every event of the SKU (700k rows, 40 s). Same rows as before for any SKU with
  // `limit` snapshots of activity in that window.
  return q<{ at: string; units: number; shops: number }>(
    `SELECT sn.started_at AS at, SUM(e.qty) AS units, COUNT(*) AS shops
       FROM stock_event e INDEXED BY idx_event_sku_time
       JOIN snapshot sn ON sn.snapshot_id = e.snapshot_id
      WHERE e.sku_id = ?
        AND e.observed_at >= (SELECT started_at FROM snapshot WHERE snapshot_id = (SELECT MAX(snapshot_id) - 600 FROM snapshot))
      GROUP BY e.snapshot_id ORDER BY e.snapshot_id DESC LIMIT ?`,
    skuId, limit,
  ).reverse();
}

// ─────────────────────────── brands & suppliers ───────────────────────────

export interface BrandRow {
  product_line_id: number;
  /** Corrected spelling. */
  name: string;
  /** Exactly as upstream published it — differs only where a rule fired. */
  raw_name: string;
  supplier_id: number | null;
  supplier_name: string | null;
  production_type: string | null;
  variants: number;
  categories: string | null;
  sizes: string | null;
  min_mrp: number | null;
  max_mrp: number | null;
  units: number;
  value_paise: number;
  shops_stocking: number;
}

/** Column keys the brands ledger can be sorted on, matching its headings. */
export const BRAND_SORTS: Record<string, string> = {
  brand: 'name',
  types: 'categories',
  sizes: 'variants',
  made_by: 'supplier_name',
  price: 'max_mrp',
  shops: 'shops_stocking',
  value: 'value_paise',
};

export function brandList(
  opts: { search?: string; category?: string; sort?: string; dir?: Dir; limit?: number; offset?: number } = {},
) {
  const { search, category, sort, dir, limit = 60, offset = 0 } = opts;
  // Searched against the corrected spelling as well as the raw one, so "kingfisher"
  // finds the lines upstream filed under "KING FISHER".
  const where = `
    WHERE (? IS NULL OR pl.name LIKE '%' || ? || '%' OR napl.display_name LIKE '%' || ? || '%')
      AND (? IS NULL OR EXISTS (SELECT 1 FROM sku s2 JOIN liquor_type l2 ON l2.liquor_type_id = s2.liquor_type_id
                                 WHERE s2.product_line_id = pl.product_line_id AND l2.category = ?))`;
  const params = [search ?? null, search ?? null, search ?? null, category ?? null, category ?? null];

  const rows = q<BrandRow>(
    `SELECT pl.product_line_id,
            COALESCE(napl.display_name, pl.name) AS name,
            pl.name AS raw_name,
            pl.supplier_id,
            COALESCE(nasu.display_name, sup.name) AS supplier_name,
            sup.production_type,
            COUNT(DISTINCT s.sku_id) AS variants,
            (SELECT GROUP_CONCAT(DISTINCT lt2.category) FROM sku s3
               JOIN liquor_type lt2 ON lt2.liquor_type_id = s3.liquor_type_id
              WHERE s3.product_line_id = pl.product_line_id) AS categories,
            (SELECT GROUP_CONCAT(x.unit_name) FROM
               (SELECT DISTINCT s4.unit_name, s4.volume_ml FROM sku s4
                 WHERE s4.product_line_id = pl.product_line_id ORDER BY s4.volume_ml) x) AS sizes,
            MIN(s.mrp) AS min_mrp, MAX(s.mrp) AS max_mrp,
            COALESCE(SUM(a.units),0) AS units,
            COALESCE(SUM(a.units * COALESCE(s.mrp,0)),0) * 100 AS value_paise,
            COALESCE(MAX(a.shops),0) AS shops_stocking
       FROM product_line pl
       JOIN sku s ON s.product_line_id = pl.product_line_id
       LEFT JOIN supplier sup ON sup.supplier_id = pl.supplier_id
       ${ALIAS_LINE}
       ${ALIAS_SUP}
       LEFT JOIN (SELECT sku_id, COUNT(*) AS shops, SUM(qty) AS units
                    FROM stock_current WHERE qty > 0 GROUP BY sku_id) a ON a.sku_id = s.sku_id
       ${where}
      GROUP BY pl.product_line_id
      ORDER BY ${orderBy(BRAND_SORTS, sort, dir, 'value_paise DESC, variants DESC')}
      LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  const total = q1<{ n: number }>(
    `SELECT COUNT(*) AS n FROM product_line pl ${ALIAS_LINE} ${where}`,
    ...params,
  )!.n;
  return { rows, total };
}

export function brand(productLineId: number): BrandRow | undefined {
  return q1<BrandRow>(
    `SELECT pl.product_line_id,
            COALESCE(napl.display_name, pl.name) AS name,
            pl.name AS raw_name,
            pl.supplier_id,
            COALESCE(nasu.display_name, sup.name) AS supplier_name,
            sup.production_type,
            COUNT(DISTINCT s.sku_id) AS variants,
            (SELECT GROUP_CONCAT(DISTINCT lt2.category) FROM sku s3
               JOIN liquor_type lt2 ON lt2.liquor_type_id = s3.liquor_type_id
              WHERE s3.product_line_id = pl.product_line_id) AS categories,
            (SELECT GROUP_CONCAT(x.unit_name) FROM
               (SELECT DISTINCT s4.unit_name, s4.volume_ml FROM sku s4
                 WHERE s4.product_line_id = pl.product_line_id ORDER BY s4.volume_ml) x) AS sizes,
            MIN(s.mrp) AS min_mrp, MAX(s.mrp) AS max_mrp,
            COALESCE(SUM(a.units),0) AS units,
            COALESCE(SUM(a.units * COALESCE(s.mrp,0)),0) * 100 AS value_paise,
            COALESCE(MAX(a.shops),0) AS shops_stocking
       FROM product_line pl
       JOIN sku s ON s.product_line_id = pl.product_line_id
       LEFT JOIN supplier sup ON sup.supplier_id = pl.supplier_id
       ${ALIAS_LINE}
       ${ALIAS_SUP}
       LEFT JOIN (SELECT sku_id, COUNT(*) AS shops, SUM(qty) AS units
                    FROM stock_current WHERE qty > 0 GROUP BY sku_id) a ON a.sku_id = s.sku_id
      WHERE pl.product_line_id = ? GROUP BY pl.product_line_id`,
    productLineId,
  );
}

export interface SupplierRow {
  supplier_id: number;
  name: string;
  raw_name: string;
  production_type: string | null;
  address: string | null;
  city: string | null;
  supplier_code: string | null;
  product_lines: number;
  skus: number;
  units: number;
  value_paise: number;
  shops_stocking: number;
  categories: string | null;
}

/** Column keys the suppliers ledger can be sorted on, matching its headings. */
export const SUPPLIER_SORTS: Record<string, string> = {
  supplier: 'name',
  type: 'sup.production_type',
  city: 'sup.city',
  brands: 'product_lines',
  skus: 'skus',
  bottles: 'units',
  value: 'value_paise',
};

export function supplierList(opts: { search?: string; type?: string; sort?: string; dir?: Dir } = {}) {
  return q<SupplierRow>(
    `SELECT sup.supplier_id,
            COALESCE(nasu.display_name, sup.name) AS name,
            sup.name AS raw_name,
            sup.production_type, sup.address, sup.city, sup.supplier_code,
            COUNT(DISTINCT s.product_line_id) AS product_lines,
            COUNT(DISTINCT s.sku_id) AS skus,
            COALESCE(SUM(a.units),0) AS units,
            COALESCE(SUM(a.units * COALESCE(s.mrp,0)),0) * 100 AS value_paise,
            COALESCE(MAX(a.shops),0) AS shops_stocking,
            (SELECT GROUP_CONCAT(DISTINCT lt.category) FROM sku s2
               JOIN liquor_type lt ON lt.liquor_type_id = s2.liquor_type_id
              WHERE s2.supplier_id = sup.supplier_id) AS categories
       FROM supplier sup
       ${ALIAS_SUP}
       LEFT JOIN sku s ON s.supplier_id = sup.supplier_id
       LEFT JOIN (SELECT sku_id, COUNT(*) AS shops, SUM(qty) AS units
                    FROM stock_current WHERE qty > 0 GROUP BY sku_id) a ON a.sku_id = s.sku_id
      WHERE (? IS NULL OR sup.name LIKE '%' || ? || '%' OR sup.city LIKE '%' || ? || '%')
        AND (? IS NULL OR sup.production_type = ?)
      GROUP BY sup.supplier_id
      ORDER BY ${orderBy(SUPPLIER_SORTS, opts.sort, opts.dir, 'value_paise DESC, skus DESC')}`,
    opts.search ?? null, opts.search ?? null, opts.search ?? null,
    opts.type ?? null, opts.type ?? null,
  );
}

export function supplier(supplierId: number): SupplierRow | undefined {
  return supplierList().find((s) => s.supplier_id === supplierId);
}

// ─────────────────────────── one liquor category ───────────────────────────

/*
 * `category` is the normalised family — BEER, BRANDY, WHISKY … — which several
 * `liquor_type` rows can map onto (the OTHER-* premium families fold into their
 * parent). Everything below therefore joins through `liquor_type` rather than
 * filtering on a type id, and takes the category string, which is what the URL
 * carries.
 */

export interface CategoryOverview {
  category: string;
  units: number;
  value_paise: number;
  skus: number;
  lines: number;
  shops_stocking: number;
}

export function categoryOverview(category: string): CategoryOverview | undefined {
  const row = q1<CategoryOverview>(
    `SELECT ? AS category,
            COALESCE(SUM(sc.qty),0) AS units,
            COALESCE(SUM(sc.qty * COALESCE(s.mrp,0)),0) * 100 AS value_paise,
            COUNT(DISTINCT sc.sku_id) AS skus,
            COUNT(DISTINCT s.product_line_id) AS lines,
            COUNT(DISTINCT sc.shop_no) AS shops_stocking
       FROM stock_current sc
       JOIN sku s ON s.sku_id = sc.sku_id
       JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
      WHERE sc.qty > 0 AND lt.category = ?`,
    category, category,
  );
  return row && row.skus > 0 ? row : undefined;
}

/** Sales to date for the family, from the statewide daily rollup. */
export function categorySales(category: string): { units_sold: number; revenue_paise: number } {
  return (
    q1<{ units_sold: number; revenue_paise: number }>(
      `SELECT COALESCE(SUM(sd.units_sold),0) AS units_sold,
              COALESCE(SUM(sd.revenue_paise),0) AS revenue_paise
         FROM sku_daily sd
         JOIN sku s ON s.sku_id = sd.sku_id
         JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE lt.category = ?`,
      category,
    ) ?? { units_sold: 0, revenue_paise: 0 }
  );
}

export interface CategoryBrandRow {
  product_line_id: number;
  name: string;
  supplier_name: string | null;
  skus: number;
  units: number;
  value_paise: number;
  units_sold: number;
  revenue_paise: number;
  shops_stocking: number;
}

/**
 * The family's brands, ranked by what has actually left the shelves.
 *
 * Shelf state and sales come from two different tables at two different grains,
 * so they are aggregated separately and joined on the product line — a brand
 * with stock but no recorded depletion still appears, at zero.
 */
export function categoryTopBrands(category: string, limit = 12): CategoryBrandRow[] {
  return q<CategoryBrandRow>(
    `WITH fam AS (
        SELECT s.sku_id, s.product_line_id, s.mrp
          FROM sku s JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
         WHERE lt.category = ?
      ),
      cur AS (
        SELECT f.product_line_id,
               COUNT(DISTINCT f.sku_id) AS skus,
               SUM(sc.qty) AS units,
               SUM(sc.qty * COALESCE(f.mrp,0)) * 100 AS value_paise,
               COUNT(DISTINCT sc.shop_no) AS shops_stocking
          FROM stock_current sc JOIN fam f ON f.sku_id = sc.sku_id
         WHERE sc.qty > 0
         GROUP BY f.product_line_id
      ),
      sold AS (
        SELECT f.product_line_id,
               SUM(sd.units_sold) AS units_sold,
               SUM(sd.revenue_paise) AS revenue_paise
          FROM sku_daily sd JOIN fam f ON f.sku_id = sd.sku_id
         GROUP BY f.product_line_id
      )
      SELECT pl.product_line_id,
             COALESCE(napl.display_name, pl.name) AS name,
             COALESCE(nasu.display_name, sup.name) AS supplier_name,
             COALESCE(cur.skus,0) AS skus,
             COALESCE(cur.units,0) AS units,
             COALESCE(cur.value_paise,0) AS value_paise,
             COALESCE(sold.units_sold,0) AS units_sold,
             COALESCE(sold.revenue_paise,0) AS revenue_paise,
             COALESCE(cur.shops_stocking,0) AS shops_stocking
        FROM product_line pl
        LEFT JOIN cur ON cur.product_line_id = pl.product_line_id
        LEFT JOIN sold ON sold.product_line_id = pl.product_line_id
        LEFT JOIN supplier sup ON sup.supplier_id = pl.supplier_id
        ${ALIAS_LINE}
        ${ALIAS_SUP}
       WHERE cur.product_line_id IS NOT NULL OR sold.product_line_id IS NOT NULL
       ORDER BY revenue_paise DESC, value_paise DESC
       LIMIT ?`,
    category, limit,
  );
}

/** Day by day for the family: what sold, what came in, what was left standing. */
export function categoryDaily(category: string, limit = 30) {
  return q<{
    day: string; units_sold: number; units_received: number;
    revenue_paise: number; closing_units: number;
  }>(
    `SELECT sd.day,
            SUM(sd.units_sold) AS units_sold,
            SUM(sd.units_received) AS units_received,
            SUM(sd.revenue_paise) AS revenue_paise,
            SUM(sd.closing_units) AS closing_units
       FROM sku_daily sd
       JOIN sku s ON s.sku_id = sd.sku_id
       JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
      WHERE lt.category = ?
      GROUP BY sd.day
      ORDER BY sd.day DESC
      LIMIT ?`,
    category, limit,
  ).reverse();
}

/** One supplier's sales split by liquor category (revenue = units sold × MRP). */
export function supplierByCategory(supplierId: number) {
  return q<{ category: string | null; revenue_paise: number; units: number }>(
    `SELECT lt.category,
            COALESCE(SUM(sd.revenue_paise), 0) AS revenue_paise,
            COALESCE(SUM(sd.units_sold), 0) AS units
       FROM sku_daily sd
       JOIN sku s ON s.sku_id = sd.sku_id
       LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
      WHERE s.supplier_id = ?
      GROUP BY lt.category
     HAVING revenue_paise > 0
      ORDER BY revenue_paise DESC`,
    supplierId,
  );
}

/** One supplier's total daily sales in rupees. */
export function supplierDaily(supplierId: number, limit = 90) {
  return q<{ day: string; revenue_paise: number; units_sold: number }>(
    `SELECT sd.day,
            SUM(sd.revenue_paise) AS revenue_paise,
            SUM(sd.units_sold) AS units_sold
       FROM sku_daily sd
       JOIN sku s ON s.sku_id = sd.sku_id
      WHERE s.supplier_id = ?
      GROUP BY sd.day
      ORDER BY sd.day DESC
      LIMIT ?`,
    supplierId, limit,
  ).reverse();
}

/** Where the family sits, by district. */
export function categoryByDistrict(category: string) {
  return q<{ district_id: number; district: string; shops: number; units: number; value_paise: number }>(
    `SELECT d.district_id, d.name AS district,
            COUNT(DISTINCT sc.shop_no) AS shops,
            SUM(sc.qty) AS units,
            SUM(sc.qty * COALESCE(s.mrp,0)) * 100 AS value_paise
       FROM stock_current sc
       JOIN sku s ON s.sku_id = sc.sku_id
       JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
       JOIN shop sh ON sh.shop_no = sc.shop_no
       JOIN district d ON d.district_id = sh.district_id
      WHERE sc.qty > 0 AND lt.category = ?
      GROUP BY d.district_id
      ORDER BY units DESC`,
    category,
  );
}

/** The shops carrying the most of it. */
export function categoryDeepestShops(category: string, limit = 12) {
  return q<{
    shop_no: number; district: string | null; district_id: number | null;
    taluk: string | null; taluk_id: number | null; units: number; value_paise: number; skus: number;
  }>(
    `SELECT sc.shop_no, v.district, v.district_id, v.taluk, v.taluk_id,
            SUM(sc.qty) AS units,
            SUM(sc.qty * COALESCE(s.mrp,0)) * 100 AS value_paise,
            COUNT(*) AS skus
       FROM stock_current sc
       JOIN sku s ON s.sku_id = sc.sku_id
       JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
       JOIN v_shop_full v ON v.shop_no = sc.shop_no
      WHERE sc.qty > 0 AND lt.category = ?
      GROUP BY sc.shop_no
      ORDER BY units DESC
      LIMIT ?`,
    category, limit,
  );
}

export function categories(): string[] {
  return q<{ category: string }>(
    'SELECT DISTINCT category FROM liquor_type WHERE category IS NOT NULL ORDER BY category',
  ).map((r) => r.category);
}

export function districtNames(): { district_id: number; name: string }[] {
  return q('SELECT district_id, name FROM district ORDER BY name');
}

// ─────────────────────────── search ───────────────────────────

export type SearchHit =
  | { kind: 'shop'; id: number; title: string; subtitle: string }
  | { kind: 'sku'; id: number; title: string; subtitle: string }
  | { kind: 'brand'; id: number; title: string; subtitle: string }
  | { kind: 'supplier'; id: number; title: string; subtitle: string };

export function search(term: string, perKind = 6): SearchHit[] {
  if (!term.trim()) return [];
  const t = term.trim();
  const hits: SearchHit[] = [];

  if (/^\d+$/.test(t)) {
    const s = q1<ShopRow>('SELECT * FROM v_shop_full WHERE shop_no = ?', Number(t));
    if (s) hits.push({ kind: 'shop', id: s.shop_no, title: `Shop #${s.shop_no}`, subtitle: `${s.taluk ?? ''}, ${s.district ?? ''}` });
  }
  for (const r of q<{ shop_no: number; district: string; taluk: string; address: string }>(
    `SELECT shop_no, district, taluk, address FROM v_shop_full
      WHERE address LIKE '%' || ? || '%' OR taluk LIKE '%' || ? || '%' LIMIT ?`, t, t, perKind)) {
    hits.push({ kind: 'shop', id: r.shop_no, title: `Shop #${r.shop_no}`, subtitle: [r.taluk, r.district].filter(Boolean).join(', ') });
  }
  // Matched on the corrected spelling as well as the upstream one, so a reader
  // searching "kingfisher" reaches the lines filed as "KING FISHER" too.
  for (const r of q<{ product_line_id: number; name: string; supplier_name: string | null }>(
    `SELECT pl.product_line_id, COALESCE(napl.display_name, pl.name) AS name,
            COALESCE(nasu.display_name, sup.name) AS supplier_name
       FROM product_line pl
       LEFT JOIN supplier sup ON sup.supplier_id = pl.supplier_id
       ${ALIAS_LINE}
       ${ALIAS_SUP}
      WHERE pl.name_key LIKE '%' || UPPER(?) || '%'
         OR napl.display_name LIKE '%' || ? || '%' LIMIT ?`, t, t, perKind)) {
    hits.push({ kind: 'brand', id: r.product_line_id, title: r.name, subtitle: r.supplier_name ?? 'Brand' });
  }
  for (const r of q<{ sku_id: number; product_name: string; unit_name: string; mrp: number }>(
    `SELECT s.sku_id, COALESCE(nask.display_name, s.product_name) AS product_name, s.unit_name, s.mrp
       FROM sku s ${ALIAS_SKU}
      WHERE s.product_name LIKE '%' || ? || '%' OR nask.display_name LIKE '%' || ? || '%'
      ORDER BY s.mrp DESC LIMIT ?`, t, t, perKind)) {
    hits.push({ kind: 'sku', id: r.sku_id, title: `${r.product_name} · ${r.unit_name}`, subtitle: r.mrp ? `₹${r.mrp}` : 'SKU' });
  }
  for (const r of q<{ supplier_id: number; name: string; production_type: string | null }>(
    `SELECT sup.supplier_id, COALESCE(nasu.display_name, sup.name) AS name, sup.production_type
       FROM supplier sup ${ALIAS_SUP}
      WHERE sup.name LIKE '%' || ? || '%' LIMIT ?`, t, perKind)) {
    hits.push({ kind: 'supplier', id: r.supplier_id, title: r.name, subtitle: r.production_type ?? 'Supplier' });
  }
  return hits;
}
