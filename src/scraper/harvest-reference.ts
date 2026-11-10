/**
 * Reference-data harvest: geography, shops (with coordinates), suppliers,
 * liquor types and the full MRP catalogue.
 *
 * Cheap enough to run daily. Everything here is upsert-only, so re-running is safe
 * and price changes land in mrp_history rather than overwriting anything.
 */
import { api, SUPPLIER_PRODUCTION_TYPES, type RawStockLine } from '../lib/api';
import { db } from '../lib/db';
import { istStamp } from '../lib/normalise';
import { ensureLiquorTypeByName, upsertLiquorType, upsertSku, upsertSupplier, type Ctx } from './upsert';
import { mapLimit, log } from './util';

export async function harvestReference(): Promise<void> {
  const d = db();
  const ctx: Ctx = { db: d, now: istStamp() };

  // ── geography ───────────────────────────────────────────────────
  const [districts, taluks, shopRefs, liquorTypes] = await Promise.all([
    api.districts(),
    api.taluks(),
    api.shops(),
    api.liquorTypes(),
  ]);

  d.transaction(() => {
    const ins = d.prepare(
      `INSERT INTO district (district_id, name) VALUES (?,?)
       ON CONFLICT(district_id) DO UPDATE SET name = excluded.name`,
    );
    for (const x of districts) ins.run(x.revenue_district_id, x.revenue_district_name);

    const insT = d.prepare(
      `INSERT INTO taluk (taluk_id, name, district_id) VALUES (?,?,?)
       ON CONFLICT(taluk_id) DO UPDATE SET name = excluded.name, district_id = excluded.district_id`,
    );
    for (const x of taluks) insT.run(x.taluk_code, x.taluk, x.district_code);

    for (const x of liquorTypes) upsertLiquorType(ctx, x.brandId, x.brandName);

    // Shell rows so stock rows always have a shop to hang off, even if the
    // geocoded lookup below misses a taluk.
    const insS = d.prepare(
      `INSERT INTO shop (shop_no, district_id, taluk_id, first_seen, last_seen)
       VALUES (?,?,?,?,?)
       ON CONFLICT(shop_no) DO UPDATE SET
         district_id = excluded.district_id,
         taluk_id    = excluded.taluk_id,
         last_seen   = excluded.last_seen`,
    );
    for (const x of shopRefs) insS.run(x.RVShopsNo, x.revenue_district_id, x.talukaId, ctx.now, ctx.now);
  })();
  log(`geography: ${districts.length} districts, ${taluks.length} taluks, ${shopRefs.length} shops, ${liquorTypes.length} liquor types`);

  // ── shop coordinates & addresses, taluk by taluk ────────────────
  // (there is no working "all shop locations" endpoint; the by-district one
  //  rejects every parameter spelling, so we fan out over ~400 taluks instead)
  const talukIds = taluks.map((t) => t.taluk_code);
  let located = 0;
  const upd = d.prepare(
    `UPDATE shop SET address = COALESCE(?, address),
                     latitude = COALESCE(?, latitude),
                     longitude = COALESCE(?, longitude),
                     is_mall_shop = ?,
                     dm_office = COALESCE(?, dm_office),
                     taluk_id = COALESCE(?, taluk_id),
                     district_id = COALESCE(?, district_id),
                     last_seen = ?
     WHERE shop_no = ?`,
  );

  await mapLimit(talukIds, 6, async (talukId) => {
    const rows = await api.shopsByTaluk(talukId).catch((e) => {
      log(`  taluk ${talukId} failed: ${e.message}`);
      return [];
    });
    if (!rows.length) return;
    d.transaction(() => {
      for (const r of rows) {
        const lat = r.latitude ? Number(r.latitude) : null;
        const lon = r.longitude ? Number(r.longitude) : null;
        upd.run(
          r.Address?.trim() || null,
          Number.isFinite(lat) ? lat : null,
          Number.isFinite(lon) ? lon : null,
          r.isMallShop ? 1 : 0,
          r.DMOffice?.trim() || null,
          r.talukaId || null,
          r.districtId || r.district_code || null,
          ctx.now,
          r.RVShopsNo,
        );
        located++;
      }
    })();
  });
  log(`shop locations: ${located} rows applied`);

  // ── suppliers ───────────────────────────────────────────────────
  let supplierCount = 0;
  for (const type of SUPPLIER_PRODUCTION_TYPES) {
    const rows = await api.suppliersByType(type);
    d.transaction(() => {
      for (const s of rows) {
        upsertSupplier(ctx, {
          supplier_id: s.supplierId,
          name: s.supplierName.trim(),
          production_type: type,
          address: s.supplierAddress,
          address_line2: s.supplierAddressLine2,
          address_line3: s.supplierAddressLine3,
          city: s.supplierCity,
          supplier_code: s.supplierCode,
        });
      }
    })();
    supplierCount += rows.length;
    log(`suppliers (${type}): ${rows.length}`);
  }
  log(`suppliers: ${supplierCount} with a production type`);

  // ── catalogue ───────────────────────────────────────────────────
  // The by-shop stock endpoint returns the ENTIRE price list (2158 SKUs, zero-stock
  // lines included) identically for every live shop, and unlike the MRP list it
  // carries supplierId and BuyBackamt. So it, not the MRP list, is our catalogue
  // spine — and everything joins on productId with no name matching anywhere.
  const catalogue = await fetchCatalogue(shopRefs.map((s) => s.RVShopsNo));
  d.transaction(() => {
    for (const row of catalogue) {
      upsertSupplier(ctx, { supplier_id: row.supplierId, name: row.supplierName.trim() });
      ensureLiquorTypeByName(ctx, Number(row.brandId), row.brandName);
      upsertSku(ctx, {
        sku_id: row.productId,
        product_name: row.productName,
        liquor_type_id: Number(row.brandId),
        supplier_id: row.supplierId,
        unit_name: row.unitName,
        pack_size: row.packSize,
        mrp: row.mrpPerBottle ?? null,
        buyback_amt: row.BuyBackamt ?? null,
      });
    }
  })();
  log(`catalogue: ${catalogue.length} SKUs, ${new Set(catalogue.map((r) => r.supplierId)).size} suppliers`);

  // The MRP list adds one field the catalogue lacks — supplierType (IMFS / IML /
  // …) — and pkProductId is the same id space, so this is a straight join.
  const mrp = await api.mrpList();
  let typed = 0;
  d.transaction(() => {
    const upd = d.prepare('UPDATE sku SET supplier_type = ?, last_seen = ? WHERE sku_id = ?');
    for (const sup of mrp) {
      for (const line of sup.Product_Name) {
        for (const det of line.productDetails) {
          if (!det.supplierType) continue;
          typed += upd.run(det.supplierType, ctx.now, det.pkProductId).changes;
        }
      }
    }
  })();
  log(`MRP list: supplier type set on ${typed} SKUs`);

  const counts = d
    .prepare(
      `SELECT (SELECT COUNT(*) FROM shop) shops,
              (SELECT COUNT(*) FROM shop WHERE latitude IS NOT NULL) geocoded,
              (SELECT COUNT(*) FROM supplier) suppliers,
              (SELECT COUNT(*) FROM product_line) lines,
              (SELECT COUNT(*) FROM sku) skus,
              (SELECT COUNT(*) FROM sku WHERE mrp IS NOT NULL) priced`,
    )
    .get();
  log(`reference totals: ${JSON.stringify(counts)}`);
}

/**
 * Any single live shop yields the full catalogue, but a fair number of shop
 * numbers return nothing (closed, or never allotted), so walk until one answers.
 * Sampling a handful and taking the union guards against a shop that is itself
 * mid-refresh and briefly short of rows.
 */
async function fetchCatalogue(shopNos: readonly number[]): Promise<RawStockLine[]> {
  const byId = new Map<number, RawStockLine>();
  let probed = 0;
  for (const shopNo of shopNos) {
    if (probed >= 4) break;
    const res = await api.stockByShop(shopNo).catch(() => []);
    const lines = res.flatMap((s) => s.Stock_details ?? []);
    if (!lines.length) continue;
    probed++;
    for (const l of lines) if (!byId.has(l.productId)) byId.set(l.productId, l);
  }
  if (!byId.size) throw new Error('no shop returned a catalogue');
  log(`catalogue assembled from ${probed} shop(s)`);
  return [...byId.values()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  harvestReference()
    .then(() => log('reference harvest complete'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
