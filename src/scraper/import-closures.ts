/**
 * Import an announced closure list.
 *
 * Closure is a declared fact, not something the stock feed can tell us. A trading
 * shop can go quiet for a night without being closed, and a closed shop can keep
 * showing stale stock for a while afterwards — so closures are stored in their
 * own table, kept sticky, and given priority when shops are classified.
 *
 *   npx tsx src/scraper/import-closures.ts [file.json] [--closed-on=YYYY-MM-DD]
 */
import { readFileSync } from 'node:fs';
import { db } from '../lib/db';
import { istDay, istStamp } from '../lib/normalise';
import { log } from './util';

interface ClosureFile {
  source: string;
  attribution?: string;
  declared_total?: number;
  closed_on?: string;
  regions: Record<string, { declared_total?: number; districts: Record<string, number[]> }>;
}

export function importClosures(path: string, closedOn?: string): void {
  const file = JSON.parse(readFileSync(path, 'utf8')) as ClosureFile;
  const d = db();
  const now = istStamp();
  const date = closedOn ?? file.closed_on ?? istDay();

  // Verify the transcription against the totals printed on the list before
  // writing anything. A list like this is only useful if it reconciles.
  const rows: { shopNo: number; region: string; district: string }[] = [];
  for (const [region, r] of Object.entries(file.regions)) {
    let regionCount = 0;
    for (const [district, shopNos] of Object.entries(r.districts)) {
      for (const shopNo of shopNos) rows.push({ shopNo, region, district });
      regionCount += shopNos.length;
    }
    if (r.declared_total != null && r.declared_total !== regionCount) {
      throw new Error(`${region}: transcribed ${regionCount} but the list declares ${r.declared_total}`);
    }
  }
  if (file.declared_total != null && file.declared_total !== rows.length) {
    throw new Error(`total: transcribed ${rows.length} but the list declares ${file.declared_total}`);
  }

  const seen = new Set<number>();
  const dupes = rows.filter((r) => (seen.has(r.shopNo) ? true : (seen.add(r.shopNo), false)));
  if (dupes.length) log(`warning: ${dupes.length} duplicate shop numbers in the list — ${dupes.slice(0, 8).map((x) => x.shopNo).join(', ')}`);

  const known = d.prepare('SELECT 1 FROM shop WHERE shop_no = ?');
  let matched = 0;

  d.transaction(() => {
    const ins = d.prepare(
      `INSERT INTO shop_closure (shop_no, closed_on, region, district, source, note, recorded_at, in_register)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(shop_no) DO UPDATE SET
         closed_on = excluded.closed_on, region = excluded.region, district = excluded.district,
         source = excluded.source, note = excluded.note, recorded_at = excluded.recorded_at,
         in_register = excluded.in_register`,
    );
    const mark = d.prepare('UPDATE shop SET is_closed = 1, closed_on = ? WHERE shop_no = ?');

    for (const r of rows) {
      const inRegister = known.get(r.shopNo) ? 1 : 0;
      matched += inRegister;
      ins.run(r.shopNo, date, r.region, r.district, file.source, file.attribution ?? null, now, inRegister);
      if (inRegister) mark.run(date, r.shopNo);
    }
  })();

  log(`closures: ${rows.length} listed, ${matched} matched a shop in the register, ${rows.length - matched} unmatched`);
  reclassify();
}

/**
 * Recompute `shop_class`. Closure wins over everything else: a shop shut by order
 * is closed even if it is still reporting stock, and stays closed after it stops.
 */
export function reclassify(): void {
  const d = db();
  d.exec(`
    UPDATE shop SET shop_class = CASE
      WHEN is_closed = 1 THEN 'closed'
      WHEN is_mall_shop = 1 THEN 'elite'
      WHEN EXISTS (SELECT 1 FROM stock_current sc WHERE sc.shop_no = shop.shop_no) THEN 'normal'
      ELSE 'other'
    END
  `);
  const summary = d.prepare('SELECT shop_class, COUNT(*) AS n FROM shop GROUP BY 1 ORDER BY n DESC').all();
  log(`classification: ${JSON.stringify(summary)}`);

  // How many of the closed shops were still reporting stock at the last reading
  // is itself worth knowing — it is the gap between the order and the shelves.
  const stillStocked = d
    .prepare(
      `SELECT COUNT(DISTINCT sc.shop_no) AS shops, COALESCE(SUM(sc.qty * COALESCE(s.mrp,0)),0) * 100 AS value_paise
         FROM stock_current sc JOIN sku s ON s.sku_id = sc.sku_id
         JOIN shop sh ON sh.shop_no = sc.shop_no
        WHERE sh.is_closed = 1 AND sc.qty > 0`,
    )
    .get() as { shops: number; value_paise: number };
  log(`closed shops still reporting stock: ${stillStocked.shops} holding ₹${Math.round(stillStocked.value_paise / 100).toLocaleString('en-IN')} at MRP`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith('--')) ?? 'data/closed-shops-2026.json';
  const closedOn = args.find((a) => a.startsWith('--closed-on='))?.split('=')[1];
  importClosures(path, closedOn);
}
