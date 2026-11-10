import type { Database } from 'better-sqlite3';
import { nameKey, parseVolumeMl, classifyLiquorType } from '../lib/normalise';

/**
 * Shared upserts. Both harvesters discover catalogue entities: the MRP list is
 * authoritative for price and supplier type, while the stock feed is the only
 * place the FL2/imported ("OTHER-*") range shows up. Either may create a SKU,
 * so these are written to be idempotent and non-destructive — a later caller
 * never nulls out a field an earlier one filled in.
 */

export interface Ctx {
  db: Database;
  now: string;
}

export function upsertSupplier(
  ctx: Ctx,
  s: {
    supplier_id: number;
    name: string;
    production_type?: string | null;
    address?: string | null;
    address_line2?: string | null;
    address_line3?: string | null;
    city?: string | null;
    supplier_code?: string | null;
  },
) {
  ctx.db
    .prepare(
      `INSERT INTO supplier (supplier_id, name, production_type, address, address_line2,
                             address_line3, city, supplier_code, first_seen, last_seen)
       VALUES (@supplier_id, @name, @production_type, @address, @address_line2,
               @address_line3, @city, @supplier_code, @now, @now)
       ON CONFLICT(supplier_id) DO UPDATE SET
         name            = excluded.name,
         production_type = COALESCE(excluded.production_type, supplier.production_type),
         address         = COALESCE(excluded.address,         supplier.address),
         address_line2   = COALESCE(excluded.address_line2,   supplier.address_line2),
         address_line3   = COALESCE(excluded.address_line3,   supplier.address_line3),
         city            = COALESCE(excluded.city,            supplier.city),
         supplier_code   = COALESCE(excluded.supplier_code,   supplier.supplier_code),
         last_seen       = @now`,
    )
    .run({
      production_type: null,
      address: null,
      address_line2: null,
      address_line3: null,
      city: null,
      supplier_code: null,
      ...s,
      now: ctx.now,
    });
}

export function upsertLiquorType(ctx: Ctx, id: number, name: string) {
  const { category, isPremium } = classifyLiquorType(name);
  ctx.db
    .prepare(
      `INSERT INTO liquor_type (liquor_type_id, name, category, is_premium)
       VALUES (?,?,?,?)
       ON CONFLICT(liquor_type_id) DO UPDATE SET
         name = excluded.name, category = excluded.category, is_premium = excluded.is_premium`,
    )
    .run(id, name, category, isPremium ? 1 : 0);
}

/**
 * Product lines are keyed on (normalised name, supplier). The same commercial name
 * from two different suppliers is genuinely two lines; the same name in two letter
 * cases is one.
 */
export function getProductLineId(ctx: Ctx, name: string, supplierId: number | null): number {
  const key = nameKey(name);
  const sel = ctx.db.prepare(
    `SELECT product_line_id FROM product_line
      WHERE name_key = ? AND supplier_id IS ?`,
  );
  const found = sel.get(key, supplierId) as { product_line_id: number } | undefined;
  if (found) return found.product_line_id;

  ctx.db
    .prepare('INSERT INTO product_line (name, name_key, supplier_id) VALUES (?,?,?)')
    .run(name.trim().replace(/\s+/g, ' '), key, supplierId);
  return (sel.get(key, supplierId) as { product_line_id: number }).product_line_id;
}

export interface SkuInput {
  sku_id: number;
  product_name: string;
  liquor_type_id?: number | null;
  supplier_id?: number | null;
  unit_name?: string | null;
  pack_size?: number | null;
  supplier_type?: string | null;
  mrp?: number | null;
  buyback_amt?: number | null;
}

export function upsertSku(ctx: Ctx, s: SkuInput): void {
  const productLineId = getProductLineId(ctx, s.product_name, s.supplier_id ?? null);
  const volumeMl = parseVolumeMl(s.unit_name);

  ctx.db
    .prepare(
      `INSERT INTO sku (sku_id, product_line_id, liquor_type_id, supplier_id, product_name,
                        unit_name, volume_ml, pack_size, supplier_type, mrp, buyback_amt,
                        first_seen, last_seen)
       VALUES (@sku_id, @product_line_id, @liquor_type_id, @supplier_id, @product_name,
               @unit_name, @volume_ml, @pack_size, @supplier_type, @mrp, @buyback_amt,
               @now, @now)
       ON CONFLICT(sku_id) DO UPDATE SET
         product_line_id = excluded.product_line_id,
         liquor_type_id  = COALESCE(excluded.liquor_type_id, sku.liquor_type_id),
         supplier_id     = COALESCE(excluded.supplier_id,    sku.supplier_id),
         unit_name       = COALESCE(excluded.unit_name,      sku.unit_name),
         volume_ml       = COALESCE(excluded.volume_ml,      sku.volume_ml),
         pack_size       = COALESCE(excluded.pack_size,      sku.pack_size),
         supplier_type   = COALESCE(excluded.supplier_type,  sku.supplier_type),
         mrp             = COALESCE(excluded.mrp,            sku.mrp),
         buyback_amt     = COALESCE(excluded.buyback_amt,    sku.buyback_amt),
         last_seen       = @now`,
    )
    .run({
      liquor_type_id: null,
      supplier_id: null,
      unit_name: null,
      pack_size: null,
      supplier_type: null,
      mrp: null,
      buyback_amt: null,
      ...s,
      product_line_id: productLineId,
      volume_ml: volumeMl,
      now: ctx.now,
    });

  if (s.mrp != null) recordMrp(ctx, s.sku_id, s.mrp, s.buyback_amt ?? null);
}

/** Close the open price interval and open a new one only when the price actually moves. */
export function recordMrp(ctx: Ctx, skuId: number, mrp: number, buyback: number | null): boolean {
  const open = ctx.db
    .prepare(
      `SELECT mrp_history_id, mrp, buyback_amt FROM mrp_history
        WHERE sku_id = ? AND observed_to IS NULL
        ORDER BY observed_from DESC LIMIT 1`,
    )
    .get(skuId) as { mrp_history_id: number; mrp: number; buyback_amt: number | null } | undefined;

  if (open && open.mrp === mrp && (open.buyback_amt ?? null) === buyback) return false;

  if (open) {
    ctx.db.prepare('UPDATE mrp_history SET observed_to = ? WHERE mrp_history_id = ?').run(ctx.now, open.mrp_history_id);
  }
  ctx.db
    .prepare('INSERT INTO mrp_history (sku_id, mrp, buyback_amt, observed_from) VALUES (?,?,?,?)')
    .run(skuId, mrp, buyback, ctx.now);
  // Keep the denormalised current price in step.
  ctx.db.prepare('UPDATE sku SET mrp = ?, buyback_amt = COALESCE(?, buyback_amt) WHERE sku_id = ?').run(mrp, buyback, skuId);
  return true;
}

/** Liquor types seen only in the stock feed (the OTHER-* premium families). */
export function ensureLiquorTypeByName(ctx: Ctx, id: number, name: string) {
  const exists = ctx.db.prepare('SELECT 1 FROM liquor_type WHERE liquor_type_id = ?').get(id);
  if (!exists) upsertLiquorType(ctx, id, name);
}
