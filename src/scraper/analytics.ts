/**
 * Sales analytics — the fact tables behind /db and the posters.
 *
 * Same inference as rollup.ts (a fall in stock is bottles sold, valued at MRP;
 * a rise is a delivery), with two corrections that matter once the numbers are
 * read as a series rather than one shop at a time:
 *
 *   • Days are trading days. A change observed before 11:00 belongs to the
 *     previous evening — shops shut at 22:00 and the feed reports the last hour
 *     after midnight. Without this every dry day shows lakhs of bottles sold.
 *   • Movements listed in sales_exclusion are dropped. These are stock pulled
 *     off the shelves, not sold — e.g. a supplier's whole range zeroed in one
 *     sweep when its products were withdrawn.
 *
 * First observations (prev_qty NULL) are a baseline, not a movement, and are
 * skipped exactly as in rollup.ts; that is also what keeps a withdrawn range
 * coming back from counting as a delivery.
 *
 *   npx tsx src/scraper/analytics.ts            # rebuild everything
 *   npx tsx src/scraper/analytics.ts --since=2026-10-01
 */
import { db } from '../lib/db';
import { log } from './util';

/** Trading day of an IST timestamp column, as SQL. */
const TRADING_DAY = (col: string) => `date(${col}, '-11 hours')`;

/**
 * Known artefacts. Kept in code as well as in the table so a fresh database
 * gets them too; INSERT OR IGNORE leaves any added by hand alone.
 */
const DECLARED: { snapshot_id: number; supplier_id: number | null; reason: string }[] = [
  {
    snapshot_id: 483,
    supplier_id: 162,
    reason:
      'ENRICA ENTERPRISES range withdrawn: 22,662 shop lines (53.7 lakh bottles) zeroed in the 2026-08-14 10:50 sweep ' +
      'and restored as fresh stock in the 2026-08-15 18:50 sweep (snapshot 579). Stock removed, not sold.',
  },
  {
    snapshot_id: 579,
    supplier_id: 162,
    reason:
      'ENRICA ENTERPRISES range restored after the withdrawal in snapshot 483: 21,610 lines came back as fresh ' +
      'baselines and 2.77 lakh bottles as rises on lines that had survived. A return of withdrawn stock, not a delivery.',
  },
];

/** The trading day a moment falls on (IST), e.g. 00:30 on the 5th is the 4th. */
export function tradingDay(at: Date = new Date()): string {
  return new Date(at.getTime() + (5.5 - 11) * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Rebuild from `sinceDay` to today, one trading day per transaction: a full
 * rebuild takes minutes, and holding the write lock that long would stall the
 * harvester sharing this database.
 */
export function rebuildAnalytics(sinceDay?: string): void {
  const d = db();
  const t0 = Date.now();
  const ins = d.prepare('INSERT OR IGNORE INTO sales_exclusion (snapshot_id, supplier_id, reason) VALUES (?, ?, ?)');
  for (const x of DECLARED) ins.run(x.snapshot_id, x.supplier_id, x.reason);

  const first =
    sinceDay ??
    ((d.prepare(`SELECT ${TRADING_DAY('MIN(observed_at)')} AS day FROM stock_event`).get() as { day: string | null }).day ??
      tradingDay());
  const last = tradingDay();
  log(`rebuilding analytics for trading days ${first} → ${last}`);

  // The event filter shared by every fact: one trading day's movements.
  const events = `
    FROM stock_event e
    JOIN sku s   ON s.sku_id = e.sku_id
    JOIN shop sh ON sh.shop_no = e.shop_no
   WHERE e.prev_qty IS NOT NULL
     AND e.observed_at >= @lo AND e.observed_at < @hi
     AND NOT EXISTS (SELECT 1 FROM sales_exclusion x
                      WHERE x.snapshot_id = e.snapshot_id
                        AND (x.supplier_id IS NULL OR x.supplier_id = s.supplier_id))`;
  const sold = 'CASE WHEN e.delta < 0 THEN -e.delta ELSE 0 END';
  const del = ['fact_sales', 'fact_shop_day', 'fact_hour'].map((t) => d.prepare(`DELETE FROM ${t} WHERE day = ?`));

  const sales = d.prepare(
    `INSERT INTO fact_sales (day, district_id, sku_id, units, revenue_paise, received, shops)
     SELECT @day, COALESCE(sh.district_id, 0), e.sku_id,
            SUM(${sold}),
            SUM(${sold}) * COALESCE(MAX(s.mrp), 0) * 100,
            SUM(CASE WHEN e.delta > 0 THEN e.delta ELSE 0 END),
            COUNT(DISTINCT CASE WHEN e.delta < 0 THEN e.shop_no END)
     ${events}
     GROUP BY 2, 3
     HAVING SUM(${sold}) > 0 OR SUM(CASE WHEN e.delta > 0 THEN e.delta ELSE 0 END) > 0`,
  );
  const shops = d.prepare(
    `INSERT INTO fact_shop_day (day, shop_no, units, revenue_paise, ml)
     SELECT @day, e.shop_no,
            SUM(${sold}),
            SUM(${sold} * COALESCE(s.mrp, 0) * 100),
            SUM(${sold} * COALESCE(s.volume_ml, 0))
     ${events}
     GROUP BY 2
     HAVING SUM(${sold}) > 0`,
  );
  const hours = d.prepare(
    `INSERT INTO fact_hour (day, district_id, hour, units, revenue_paise)
     SELECT @day, COALESCE(sh.district_id, 0),
            CAST(substr(COALESCE(e.reported_at, e.observed_at), 12, 2) AS INTEGER),
            SUM(${sold}),
            SUM(${sold} * COALESCE(s.mrp, 0) * 100)
     ${events}
     GROUP BY 2, 3
     HAVING SUM(${sold}) > 0`,
  );

  const one = d.transaction((day: string) => {
    const next = new Date(Date.parse(day + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
    const p = { day, lo: `${day} 11:00:00`, hi: `${next} 11:00:00` };
    for (const s of del) s.run(day);
    sales.run(p);
    shops.run(p);
    hours.run(p);
  });

  for (let day = first; day <= last; ) {
    one(day);
    day = new Date(Date.parse(day + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
  }
  d.prepare(`INSERT INTO meta(key, value) VALUES('analytics_built_at', datetime('now', '+5 hours', '+30 minutes'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();

  const n = d.prepare('SELECT COUNT(*) n, COUNT(DISTINCT day) days FROM fact_sales').get() as { n: number; days: number };
  log(`analytics: ${n.n} sales rows over ${n.days} trading days in ${Math.round((Date.now() - t0) / 1000)}s`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--since='));
  rebuildAnalytics(arg?.split('=')[1]);
}
