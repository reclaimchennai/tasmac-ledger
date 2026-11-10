/**
 * Daily rollups.
 *
 * What the feed gives us is a step function of stock level per shop×SKU. Sales are
 * inferred from it: every downward step is bottles that left the shop, every upward
 * step is a delivery. Multiplying depletion by MRP gives estimated retail revenue.
 *
 * This is an *estimate*, and worth being honest about its limits:
 *   • Restocking inside a gap between two observations hides some sales. If a shop
 *     sells 40 and receives 100 between two reads, we see +60 and record zero sales.
 *     Denser polling shrinks the error; it never fully removes it.
 *   • Stock counts are what the shop reports, not an audit.
 *   • MRP is the shelf price, so revenue is gross retail, not TASMAC's margin.
 * Under-counting is the systematic direction, so treat these as a floor.
 */
import { db } from '../lib/db';
import { istDay } from '../lib/normalise';
import { log } from './util';

export function rebuildRollups(sinceDay?: string): void {
  const d = db();
  const from = sinceDay ?? '0000-00-00';

  log(`rebuilding rollups from ${from}`);

  d.exec('BEGIN');
  try {
    d.prepare('DELETE FROM shop_daily WHERE day >= ?').run(from);
    d.prepare('DELETE FROM sku_daily WHERE day >= ?').run(from);

    // Flow: depletion vs delivery, valued at the SKU's MRP.
    // `prev_qty IS NOT NULL` drops first-ever observations, which are a baseline,
    // not a movement — counting them as deliveries would invent phantom restocks.
    d.prepare(
      `INSERT INTO shop_daily (shop_no, day, units_sold, units_received, revenue_paise, restock_paise, stockouts)
       SELECT e.shop_no,
              substr(e.observed_at, 1, 10) AS day,
              SUM(CASE WHEN e.delta < 0 THEN -e.delta ELSE 0 END),
              SUM(CASE WHEN e.delta > 0 THEN  e.delta ELSE 0 END),
              SUM(CASE WHEN e.delta < 0 THEN -e.delta * COALESCE(s.mrp,0) * 100 ELSE 0 END),
              SUM(CASE WHEN e.delta > 0 THEN  e.delta * COALESCE(s.mrp,0) * 100 ELSE 0 END),
              SUM(CASE WHEN e.qty = 0 AND COALESCE(e.prev_qty,0) > 0 THEN 1 ELSE 0 END)
         FROM stock_event e
         JOIN sku s ON s.sku_id = e.sku_id
        WHERE e.prev_qty IS NOT NULL AND substr(e.observed_at,1,10) >= ?
        GROUP BY e.shop_no, day
       ON CONFLICT(shop_no, day) DO UPDATE SET
         units_sold = excluded.units_sold, units_received = excluded.units_received,
         revenue_paise = excluded.revenue_paise, restock_paise = excluded.restock_paise,
         stockouts = excluded.stockouts`,
    ).run(from);

    // Levels: opening = first reading of the day, closing = last. Taken from
    // shop_report (which covers every shop seen in a snapshot, including ones
    // whose stock did not move) rather than from events.
    d.prepare(
      `WITH ranked AS (
         SELECT r.shop_no, substr(sn.started_at,1,10) AS day, r.units, r.value_paise, r.sku_count,
                ROW_NUMBER() OVER (PARTITION BY r.shop_no, substr(sn.started_at,1,10) ORDER BY sn.started_at ASC)  AS rn_first,
                ROW_NUMBER() OVER (PARTITION BY r.shop_no, substr(sn.started_at,1,10) ORDER BY sn.started_at DESC) AS rn_last
           FROM shop_report r JOIN snapshot sn ON sn.snapshot_id = r.snapshot_id
          WHERE substr(sn.started_at,1,10) >= ?
       ),
       lvl AS (
         SELECT shop_no, day,
                MAX(CASE WHEN rn_first = 1 THEN units       END) AS open_u,
                MAX(CASE WHEN rn_first = 1 THEN value_paise END) AS open_p,
                MAX(CASE WHEN rn_last  = 1 THEN units       END) AS close_u,
                MAX(CASE WHEN rn_last  = 1 THEN value_paise END) AS close_p,
                MAX(CASE WHEN rn_last  = 1 THEN sku_count   END) AS skus
           FROM ranked GROUP BY shop_no, day
       )
       INSERT INTO shop_daily (shop_no, day, opening_units, closing_units, opening_paise, closing_paise, sku_count)
       -- WHERE true is required here: without it SQLite cannot tell the upsert
       -- clause apart from a table alias on the preceding FROM.
       SELECT shop_no, day, open_u, close_u, open_p, close_p, skus FROM lvl WHERE true
       ON CONFLICT(shop_no, day) DO UPDATE SET
         opening_units = excluded.opening_units, closing_units = excluded.closing_units,
         opening_paise = excluded.opening_paise, closing_paise = excluded.closing_paise,
         sku_count     = excluded.sku_count`,
    ).run(from);

    // Statewide per-SKU flow.
    d.prepare(
      `INSERT INTO sku_daily (sku_id, day, units_sold, units_received, revenue_paise, shops_stocked_out)
       SELECT e.sku_id, substr(e.observed_at,1,10) AS day,
              SUM(CASE WHEN e.delta < 0 THEN -e.delta ELSE 0 END),
              SUM(CASE WHEN e.delta > 0 THEN  e.delta ELSE 0 END),
              SUM(CASE WHEN e.delta < 0 THEN -e.delta * COALESCE(s.mrp,0) * 100 ELSE 0 END),
              SUM(CASE WHEN e.qty = 0 AND COALESCE(e.prev_qty,0) > 0 THEN 1 ELSE 0 END)
         FROM stock_event e JOIN sku s ON s.sku_id = e.sku_id
        WHERE e.prev_qty IS NOT NULL AND substr(e.observed_at,1,10) >= ?
        GROUP BY e.sku_id, day
       ON CONFLICT(sku_id, day) DO UPDATE SET
         units_sold = excluded.units_sold, units_received = excluded.units_received,
         revenue_paise = excluded.revenue_paise, shops_stocked_out = excluded.shops_stocked_out`,
    ).run(from);

    // Closing position per SKU — only for today, where stock_current is the truth.
    const today = istDay();
    if (today >= from) {
      d.prepare(
        `INSERT INTO sku_daily (sku_id, day, closing_units, shops_stocking)
         SELECT sku_id, ?, SUM(qty), COUNT(*) FROM stock_current WHERE qty > 0 GROUP BY sku_id
         HAVING true
         ON CONFLICT(sku_id, day) DO UPDATE SET
           closing_units = excluded.closing_units, shops_stocking = excluded.shops_stocking`,
      ).run(today);
    }

    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }

  const s = d
    .prepare(
      `SELECT (SELECT COUNT(*) FROM shop_daily) shop_days,
              (SELECT COUNT(*) FROM sku_daily) sku_days,
              (SELECT COALESCE(SUM(revenue_paise),0)/100 FROM shop_daily) est_revenue_rupees`,
    )
    .get();
  log(`rollups: ${JSON.stringify(s)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--since='));
  rebuildRollups(arg?.split('=')[1]);
}
