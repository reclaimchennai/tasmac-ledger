import type Database from 'better-sqlite3';

/**
 * stock_event is append-only and ~45M rows (10 GB db), so COUNT(*) takes 20 s and
 * COUNT(prev_qty IS NOT NULL) 50+ s — the /method page timed out on them.
 *
 *  - events    = MAX(event_id): rows are never deleted, so it equals COUNT(*) exactly.
 *  - movements = events − first observations (prev_qty IS NULL). The first-observation
 *    count is kept as a running total in meta('event_firsts') = "<last_event_id>:<count>",
 *    rolled forward by the watcher each cycle (rollEventFirsts) and read here with a
 *    primary-key-range tail count, which stays small.
 */
export function firstObservations(d: Database.Database): { events: number; firsts: number } {
  const events = (d.prepare('SELECT COALESCE(MAX(event_id), 0) AS n FROM stock_event').get() as { n: number }).n;
  const m = d.prepare("SELECT value FROM meta WHERE key = 'event_firsts'").get() as { value: string } | undefined;
  const [id, n] = (m?.value ?? '0:0').split(':').map(Number);
  const tail = (d.prepare('SELECT COUNT(*) AS n FROM stock_event WHERE event_id > ? AND prev_qty IS NULL').get(id) as { n: number }).n;
  return { events, firsts: n + tail };
}

/** Writer side: fold the tail into the cached total. Call with the read-write handle. */
export function rollEventFirsts(d: Database.Database) {
  const upTo = (d.prepare('SELECT COALESCE(MAX(event_id), 0) AS n FROM stock_event').get() as { n: number }).n;
  const { firsts } = firstObservations(d);
  d.prepare("INSERT INTO meta(key,value) VALUES('event_firsts',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(`${upTo}:${firsts}`);
}
