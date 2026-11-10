/** Data access for the bot. Read-mostly, plus the small amount of user state it keeps. */
import { db } from '../lib/db';
import { istStamp } from '../lib/normalise';

const d = () => db();

// ─────────────────────────── users & favourites ───────────────────────────

export function touchUser(chatId: number, first?: string, username?: string) {
  const now = istStamp();
  d()
    .prepare(
      `INSERT INTO bot_user (chat_id, first_name, username, first_seen, last_seen)
       VALUES (?,?,?,?,?)
       ON CONFLICT(chat_id) DO UPDATE SET
         first_name = COALESCE(excluded.first_name, bot_user.first_name),
         username   = COALESCE(excluded.username,   bot_user.username),
         last_seen  = excluded.last_seen`,
    )
    .run(chatId, first ?? null, username ?? null, now, now);
}

export function saveLocation(chatId: number, lat: number, lon: number) {
  d().prepare('UPDATE bot_user SET last_lat = ?, last_lon = ?, last_seen = ? WHERE chat_id = ?').run(lat, lon, istStamp(), chatId);
}

export function getUser(chatId: number) {
  return d().prepare('SELECT * FROM bot_user WHERE chat_id = ?').get(chatId) as
    | { chat_id: number; first_name: string | null; last_lat: number | null; last_lon: number | null }
    | undefined;
}

export function toggleFavShop(chatId: number, shopNo: number): boolean {
  const has = d().prepare('SELECT 1 FROM bot_fav_shop WHERE chat_id = ? AND shop_no = ?').get(chatId, shopNo);
  if (has) {
    d().prepare('DELETE FROM bot_fav_shop WHERE chat_id = ? AND shop_no = ?').run(chatId, shopNo);
    return false;
  }
  d().prepare('INSERT INTO bot_fav_shop (chat_id, shop_no, added_at) VALUES (?,?,?)').run(chatId, shopNo, istStamp());
  return true;
}

export function toggleFavSku(chatId: number, skuId: number): boolean {
  const has = d().prepare('SELECT 1 FROM bot_fav_sku WHERE chat_id = ? AND sku_id = ?').get(chatId, skuId);
  if (has) {
    d().prepare('DELETE FROM bot_fav_sku WHERE chat_id = ? AND sku_id = ?').run(chatId, skuId);
    return false;
  }
  d().prepare('INSERT INTO bot_fav_sku (chat_id, sku_id, added_at) VALUES (?,?,?)').run(chatId, skuId, istStamp());
  return true;
}

export const isFavShop = (chatId: number, shopNo: number) =>
  !!d().prepare('SELECT 1 FROM bot_fav_shop WHERE chat_id = ? AND shop_no = ?').get(chatId, shopNo);

export const isFavSku = (chatId: number, skuId: number) =>
  !!d().prepare('SELECT 1 FROM bot_fav_sku WHERE chat_id = ? AND sku_id = ?').get(chatId, skuId);

export function favShops(chatId: number) {
  return d()
    .prepare(
      `WITH latest AS (SELECT MAX(snapshot_id) AS id FROM snapshot WHERE status IN ('ok','partial'))
       SELECT v.shop_no, v.taluk, v.district, v.address, v.shop_class,
              r.units, r.value_paise, r.sku_count, r.reported_at
         FROM bot_fav_shop f
         JOIN v_shop_full v ON v.shop_no = f.shop_no
         LEFT JOIN shop_report r ON r.shop_no = v.shop_no AND r.snapshot_id = (SELECT id FROM latest)
        WHERE f.chat_id = ? ORDER BY f.added_at`,
    )
    .all(chatId) as FavShop[];
}

export interface FavShop {
  shop_no: number; taluk: string | null; district: string | null; address: string | null;
  shop_class: string | null; units: number | null; value_paise: number | null;
  sku_count: number | null; reported_at: string | null;
}

export function favSkus(chatId: number) {
  return d()
    .prepare(
      `SELECT s.sku_id, s.product_name, s.unit_name, s.mrp, lt.category
         FROM bot_fav_sku f
         JOIN sku s ON s.sku_id = f.sku_id
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE f.chat_id = ? ORDER BY f.added_at`,
    )
    .all(chatId) as { sku_id: number; product_name: string; unit_name: string | null; mrp: number | null; category: string | null }[];
}

// ─────────────────────────── geography ───────────────────────────

export interface NearShop {
  shop_no: number; lat: number; lon: number; taluk: string | null; district: string | null;
  address: string | null; shop_class: string | null; distance_m: number;
  units: number | null; sku_count: number | null; reported_at: string | null;
}

/**
 * Nearest trading shops. Bounded to a ~0.45° box first so this is an index range
 * scan rather than a haversine across all 4,850 shops, then ranked exactly.
 * Shops classed `other` are excluded — they have no stock to report.
 */
export function nearby(lat: number, lon: number, limit = 8): NearShop[] {
  return d()
    .prepare(
      `WITH latest AS (SELECT MAX(snapshot_id) AS id FROM snapshot WHERE status IN ('ok','partial'))
       SELECT v.shop_no, v.lat, v.lon, v.taluk, v.district, v.address, v.shop_class,
              CAST(6371000 * 2 * ASIN(SQRT(
                POWER(SIN(RADIANS(v.lat - @lat) / 2), 2) +
                COS(RADIANS(@lat)) * COS(RADIANS(v.lat)) *
                POWER(SIN(RADIANS(v.lon - @lon) / 2), 2))) AS INTEGER) AS distance_m,
              r.units, r.sku_count, r.reported_at
         FROM v_shop_full v
         LEFT JOIN shop_report r ON r.shop_no = v.shop_no AND r.snapshot_id = (SELECT id FROM latest)
        WHERE v.lat BETWEEN @lat - 0.45 AND @lat + 0.45
          AND v.lon BETWEEN @lon - 0.45 AND @lon + 0.45
          AND v.shop_class IN ('normal','elite')  -- never send someone to a closed shop
        ORDER BY distance_m
        LIMIT @limit`,
    )
    .all({ lat, lon, limit }) as NearShop[];
}

export function shopHeader(shopNo: number) {
  return d()
    .prepare(
      `WITH latest AS (SELECT MAX(snapshot_id) AS id FROM snapshot WHERE status IN ('ok','partial'))
       SELECT v.shop_no, v.taluk, v.district, v.address, v.shop_class, v.lat, v.lon,
              r.units, r.value_paise, r.sku_count, r.reported_at
         FROM v_shop_full v
         LEFT JOIN shop_report r ON r.shop_no = v.shop_no AND r.snapshot_id = (SELECT id FROM latest)
        WHERE v.shop_no = ?`,
    )
    .get(shopNo) as (FavShop & { lat: number | null; lon: number | null }) | undefined;
}

// ─────────────────────────── browsing stock ───────────────────────────

/** Broad categories a shop currently has, with line counts — the first narrowing step. */
export function shopCategories(shopNo: number) {
  return d()
    .prepare(
      `SELECT lt.category, COUNT(*) AS lines, SUM(sc.qty) AS units, MIN(s.mrp) AS min_mrp, MAX(s.mrp) AS max_mrp
         FROM stock_current sc
         JOIN sku s ON s.sku_id = sc.sku_id
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE sc.shop_no = ? AND sc.qty > 0 AND lt.category IS NOT NULL
        GROUP BY lt.category ORDER BY units DESC`,
    )
    .all(shopNo) as { category: string; lines: number; units: number; min_mrp: number; max_mrp: number }[];
}

/** Sizes available within a category at a shop — the second narrowing step. */
export function shopSizes(shopNo: number, category: string) {
  return d()
    .prepare(
      `SELECT s.unit_name, s.volume_ml, COUNT(*) AS lines, SUM(sc.qty) AS units
         FROM stock_current sc
         JOIN sku s ON s.sku_id = sc.sku_id
         JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE sc.shop_no = ? AND sc.qty > 0 AND lt.category = ?
        GROUP BY s.unit_name ORDER BY s.volume_ml`,
    )
    .all(shopNo, category) as { unit_name: string; volume_ml: number; lines: number; units: number }[];
}

/** The actual bottles: price and stock, cheapest first. */
export function shopItems(shopNo: number, category: string, unitName: string | null, offset = 0, limit = 8) {
  return d()
    .prepare(
      `SELECT s.sku_id, s.product_name, s.unit_name, s.mrp, sc.qty, sup.name AS supplier_name
         FROM stock_current sc
         JOIN sku s ON s.sku_id = sc.sku_id
         JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
         LEFT JOIN supplier sup ON sup.supplier_id = s.supplier_id
        WHERE sc.shop_no = ? AND sc.qty > 0 AND lt.category = ?
          AND (? IS NULL OR s.unit_name = ?)
        ORDER BY s.mrp, s.product_name
        LIMIT ? OFFSET ?`,
    )
    .all(shopNo, category, unitName, unitName, limit + 1, offset) as ShopItem[];
}

export interface ShopItem {
  sku_id: number; product_name: string; unit_name: string | null;
  mrp: number | null; qty: number; supplier_name: string | null;
}

export function countShopItems(shopNo: number, category: string, unitName: string | null): number {
  return (
    d()
      .prepare(
        `SELECT COUNT(*) AS n FROM stock_current sc
           JOIN sku s ON s.sku_id = sc.sku_id
           JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
          WHERE sc.shop_no = ? AND sc.qty > 0 AND lt.category = ? AND (? IS NULL OR s.unit_name = ?)`,
      )
      .get(shopNo, category, unitName, unitName) as { n: number }
  ).n;
}

/** Stock of one SKU at one shop — the fast-answer query. */
export function stockAt(shopNo: number, skuId: number) {
  return d()
    .prepare(
      `SELECT sc.qty, sc.reported_at, s.product_name, s.unit_name, s.mrp
         FROM sku s LEFT JOIN stock_current sc ON sc.sku_id = s.sku_id AND sc.shop_no = ?
        WHERE s.sku_id = ?`,
    )
    .get(shopNo, skuId) as
    | { qty: number | null; reported_at: string | null; product_name: string; unit_name: string | null; mrp: number | null }
    | undefined;
}

// ─────────────────────────── search ───────────────────────────

export interface SearchRow {
  sku_id: number; product_name: string; unit_name: string | null; mrp: number | null;
  category: string | null; shops_stocking: number; total_units: number;
}

/** Free-text SKU search, ranked by how widely stocked it is. */
export function searchSkus(term: string, limit = 8): SearchRow[] {
  return d()
    .prepare(
      `SELECT s.sku_id, s.product_name, s.unit_name, s.mrp, lt.category,
              COALESCE(a.shops, 0) AS shops_stocking, COALESCE(a.units, 0) AS total_units
         FROM sku s
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
         LEFT JOIN (SELECT sku_id, COUNT(*) AS shops, SUM(qty) AS units
                      FROM stock_current WHERE qty > 0 GROUP BY sku_id) a ON a.sku_id = s.sku_id
        WHERE s.product_name LIKE '%' || ? || '%'
        ORDER BY shops_stocking DESC, s.mrp
        LIMIT ?`,
    )
    .all(term, limit) as SearchRow[];
}

/** Where a SKU can actually be bought near a point — availability with price. */
export function nearestWithSku(lat: number, lon: number, skuId: number, limit = 6) {
  return d()
    .prepare(
      `SELECT v.shop_no, v.taluk, v.district, v.address, sc.qty, sc.reported_at,
              CAST(6371000 * 2 * ASIN(SQRT(
                POWER(SIN(RADIANS(v.lat - @lat) / 2), 2) +
                COS(RADIANS(@lat)) * COS(RADIANS(v.lat)) *
                POWER(SIN(RADIANS(v.lon - @lon) / 2), 2))) AS INTEGER) AS distance_m
         FROM stock_current sc
         JOIN v_shop_full v ON v.shop_no = sc.shop_no
        WHERE sc.sku_id = @skuId AND sc.qty > 0
          AND v.lat BETWEEN @lat - 0.6 AND @lat + 0.6
          AND v.lon BETWEEN @lon - 0.6 AND @lon + 0.6
        ORDER BY distance_m
        LIMIT @limit`,
    )
    .all({ lat, lon, skuId, limit }) as {
      shop_no: number; taluk: string | null; district: string | null; address: string | null;
      qty: number; reported_at: string | null; distance_m: number;
    }[];
}

export function skuInfo(skuId: number) {
  return d()
    .prepare(
      `SELECT s.sku_id, s.product_name, s.unit_name, s.mrp, s.pack_size, lt.category, sup.name AS supplier_name
         FROM sku s
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
         LEFT JOIN supplier sup ON sup.supplier_id = s.supplier_id
        WHERE s.sku_id = ?`,
    )
    .get(skuId) as
    | { sku_id: number; product_name: string; unit_name: string | null; mrp: number | null; pack_size: number | null; category: string | null; supplier_name: string | null }
    | undefined;
}

// ─────────────────────────── polling cursor ───────────────────────────

export function getOffset(): number {
  const r = d().prepare('SELECT offset FROM bot_offset WHERE id = 1').get() as { offset: number } | undefined;
  return r?.offset ?? 0;
}

export function setOffset(offset: number) {
  d().prepare('INSERT INTO bot_offset (id, offset) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET offset = excluded.offset').run(offset);
}
