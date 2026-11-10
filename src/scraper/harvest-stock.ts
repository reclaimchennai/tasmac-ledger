/**
 * Stock harvest — the temporal half of the mirror.
 *
 * Strategy: sweep every (district, taluk) pair via `get-stockDetailsBy-DistrictId-talukId`.
 *
 * This used to sweep by district alone — one call per district, ~5 MB / ~25 s,
 * a few minutes statewide. As of some point before 2026-08-09, that endpoint got
 * silently capped to 10 shops per response regardless of district size (a probe
 * across 5 districts of 53–379 registered shops each came back with exactly 10
 * every time), which was quietly starving every snapshot down to 380 shops out
 * of ~4,871 registered. The by-district-and-taluk endpoint, reverse-engineered
 * from the same "Live Stock Monitoring" widget upstream added to main.js, is not
 * capped — 316 smaller calls instead of 38 large ones, similar total time.
 *
 * Storage is a change log, not a snapshot dump. A naive snapshot table would add
 * ~250 k rows per run; instead `stock_event` gets a row only where the level
 * actually moved, and `stock_current` holds the live level. That keeps an exact
 * step-function history per shop×SKU at a tiny fraction of the size.
 *
 * Two subtleties the feed forces on us:
 *
 *  1. The feed omits zero-stock lines entirely. A SKU vanishing from a shop's
 *     list therefore *means* it hit zero, and we synthesise that event — but
 *     only for shops that actually appeared in this run, so a failed taluk call
 *     can never be mistaken for a sell-out across the shops it would have covered.
 *
 *  2. `last_updated_time` is a 12-hour clock with no AM/PM (see normalise.ts).
 *     We resolve it against fetch time and record whether a shop's clock moved,
 *     because stock can only have genuinely changed when it did.
 */
import { api, type RawShopStock } from '../lib/api';
import { db } from '../lib/db';
import { istStamp, parseReportedAt } from '../lib/normalise';
import { ensureLiquorTypeByName, upsertSku, upsertSupplier, type Ctx } from './upsert';
import { log, mapLimit } from './util';

interface TalukOutcome {
  districtId: number;
  talukId: number;
  ok: boolean;
  shops: number;
  rows: number;
  events: number;
  error?: string;
}

export async function harvestStock(opts: { concurrency?: number; districts?: number[] } = {}): Promise<number> {
  const d = db();
  const startedAt = istStamp();
  const concurrency = opts.concurrency ?? 8;

  const snapshotId = Number(
    d.prepare('INSERT INTO snapshot (started_at) VALUES (?)').run(startedAt).lastInsertRowid,
  );

  let pairs = (
    d.prepare('SELECT taluk_id, district_id FROM taluk ORDER BY district_id, taluk_id').all() as {
      taluk_id: number;
      district_id: number;
    }[]
  ).map((r) => ({ talukId: r.taluk_id, districtId: r.district_id }));
  if (opts.districts) pairs = pairs.filter((p) => opts.districts!.includes(p.districtId));

  log(`snapshot ${snapshotId}: sweeping ${pairs.length} district×taluk pairs (concurrency ${concurrency})`);

  const outcomes = await mapLimit(pairs, concurrency, async ({ districtId, talukId }) => {
    try {
      const payload = await api.stockByDistrictAndTaluk(districtId, talukId);
      const fetchedAt = istStamp();
      const res = applyDistrict(d, snapshotId, districtId, talukId, payload, fetchedAt);
      log(
        `  district ${String(districtId).padStart(2)} / taluk ${String(talukId).padStart(3)}: ` +
          `${String(res.shops).padStart(3)} shops, ${String(res.rows).padStart(5)} lines, ${String(res.events).padStart(5)} changes`,
      );
      return { districtId, talukId, ok: true, ...res } satisfies TalukOutcome;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  district ${districtId} / taluk ${talukId}: FAILED — ${msg}`);
      return { districtId, talukId, ok: false, shops: 0, rows: 0, events: 0, error: msg } satisfies TalukOutcome;
    }
  });

  const okCount = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.filter((o) => !o.ok);
  const totals = outcomes.reduce(
    (a, o) => ({ shops: a.shops + o.shops, rows: a.rows + o.rows, events: a.events + o.events }),
    { shops: 0, rows: 0, events: 0 },
  );

  d.prepare(
    // districts_ok/districts_failed predate the taluk-level sweep; they now
    // count district×taluk pairs rather than districts, not worth a migration for.
    `UPDATE snapshot SET finished_at = ?, status = ?, shops_seen = ?, rows_seen = ?,
                         events_written = ?, districts_ok = ?, districts_failed = ?, note = ?
      WHERE snapshot_id = ?`,
  ).run(
    istStamp(),
    failed.length === 0 ? 'ok' : okCount === 0 ? 'failed' : 'partial',
    totals.shops,
    totals.rows,
    totals.events,
    okCount,
    failed.length,
    failed.length
      ? `failed pairs: ${failed.map((f) => `${f.districtId}/${f.talukId} (${f.error})`).join('; ')}`
      : null,
    snapshotId,
  );

  // Keep the operational flag current: any shop that reported stock in this
  // snapshot is operational from now on (monotonic — never unset). Cheap — it
  // only scans this snapshot's reporters. Drives the reporting-rate denominator,
  // which counts operational shops only (not closed, not never-reported).
  d.prepare(
    `UPDATE shop SET ever_reported = 1
      WHERE ever_reported = 0
        AND shop_no IN (SELECT shop_no FROM shop_report
                         WHERE snapshot_id = ? AND sku_count > 0)`,
  ).run(snapshotId);

  log(
    `snapshot ${snapshotId} done — ${totals.shops} shops, ${totals.rows} lines, ` +
      `${totals.events} stock changes, ${okCount}/${pairs.length} pairs ok`,
  );
  return snapshotId;
}

function applyDistrict(
  d: ReturnType<typeof db>,
  snapshotId: number,
  districtId: number,
  talukId: number,
  payload: RawShopStock[],
  fetchedAt: string,
): { shops: number; rows: number; events: number } {
  const ctx: Ctx = { db: d, now: fetchedAt };

  const selCurrent = d.prepare('SELECT sku_id, qty FROM stock_current WHERE shop_no = ?');
  const insEvent = d.prepare(
    `INSERT INTO stock_event (shop_no, sku_id, qty, prev_qty, delta, reported_at, observed_at, snapshot_id)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const upsertCurrent = d.prepare(
    `INSERT INTO stock_current (shop_no, sku_id, qty, reported_at, snapshot_id)
     VALUES (?,?,?,?,?)
     ON CONFLICT(shop_no, sku_id) DO UPDATE SET
       qty = excluded.qty, reported_at = excluded.reported_at, snapshot_id = excluded.snapshot_id`,
  );
  const delCurrent = d.prepare('DELETE FROM stock_current WHERE shop_no = ? AND sku_id = ?');
  const insReport = d.prepare(
    `INSERT INTO shop_report (snapshot_id, shop_no, reported_at, sku_count, units, value_paise)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(snapshot_id, shop_no) DO UPDATE SET
       reported_at = excluded.reported_at, sku_count = excluded.sku_count,
       units = excluded.units, value_paise = excluded.value_paise`,
  );
  const ensureShop = d.prepare(
    `INSERT INTO shop (shop_no, district_id, taluk_id, first_seen, last_seen) VALUES (?,?,?,?,?)
     ON CONFLICT(shop_no) DO UPDATE SET last_seen = excluded.last_seen`,
  );
  const mrpOf = d.prepare('SELECT mrp FROM sku WHERE sku_id = ?');

  let shops = 0;
  let rows = 0;
  let events = 0;
  const mrpCache = new Map<number, number>();

  const run = d.transaction(() => {
    for (const entry of payload) {
      const shopNo = Number(entry.shopNumber);
      if (!Number.isFinite(shopNo)) continue;

      const { iso: reportedAt } = parseReportedAt(entry.last_updated_time, fetchedAt);
      ensureShop.run(shopNo, entry.districtId ?? districtId, entry.talukaId ?? talukId, fetchedAt, fetchedAt);

      const previous = new Map<number, number>();
      for (const r of selCurrent.all(shopNo) as { sku_id: number; qty: number }[]) previous.set(r.sku_id, r.qty);

      const seen = new Set<number>();
      let units = 0;
      let valuePaise = 0;

      for (const line of entry.Stock_details ?? []) {
        const skuId = line.productId;
        const qty = Number(line.currentStock) || 0;
        seen.add(skuId);
        rows++;
        units += qty;

        // The district feed can surface a SKU or supplier the catalogue sweep
        // missed; register it rather than dropping the row on a FK failure.
        if (!mrpCache.has(skuId)) {
          const known = mrpOf.get(skuId) as { mrp: number | null } | undefined;
          if (!known) {
            upsertSupplier(ctx, { supplier_id: line.supplierId, name: line.supplierName?.trim() ?? 'Unknown' });
            ensureLiquorTypeByName(ctx, Number(line.brandId), line.brandName);
            upsertSku(ctx, {
              sku_id: skuId,
              product_name: line.productName,
              liquor_type_id: Number(line.brandId),
              supplier_id: line.supplierId,
              unit_name: line.unitName,
              pack_size: line.packSize,
              mrp: line.mrpPerBottle ?? null,
            });
          }
          mrpCache.set(skuId, (known?.mrp ?? line.mrpPerBottle ?? 0) as number);
        }
        valuePaise += qty * (mrpCache.get(skuId) ?? 0) * 100;

        const prev = previous.get(skuId);
        if (prev === undefined) {
          insEvent.run(shopNo, skuId, qty, null, null, reportedAt, fetchedAt, snapshotId);
          events++;
        } else if (prev !== qty) {
          insEvent.run(shopNo, skuId, qty, prev, qty - prev, reportedAt, fetchedAt, snapshotId);
          events++;
        }
        upsertCurrent.run(shopNo, skuId, qty, reportedAt, snapshotId);
      }

      // Anything the shop stocked last time but no longer lists has gone to zero.
      for (const [skuId, prevQty] of previous) {
        if (seen.has(skuId)) continue;
        if (prevQty !== 0) {
          insEvent.run(shopNo, skuId, 0, prevQty, -prevQty, reportedAt, fetchedAt, snapshotId);
          events++;
        }
        delCurrent.run(shopNo, skuId);
      }

      insReport.run(snapshotId, shopNo, reportedAt, seen.size, units, Math.round(valuePaise));
      shops++;
    }
  });
  run();

  return { shops, rows, events };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--districts='));
  const districts = arg ? arg.split('=')[1].split(',').map(Number) : undefined;
  harvestStock({ districts })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
