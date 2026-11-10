import 'server-only';
import { readDb } from './db';
import { ABV_SQL, ANALYSIS_FROM, CATEGORIES, DRY_DAYS } from './dashboard';
import FEST from '@/data/festivals.json';

/**
 * The festival tracker on /db: a festival's days set against ordinary days.
 *
 * "Ordinary" is the whole question, so it is defined once and used for every
 * cut: the same weekday, in the eight weeks before the festival's window opens,
 * leaving out dry days, the eve of a dry day, every other festival's window and
 * any day the scope sold under 60% of that weekday's median (a feed outage or a
 * washed-out Sunday is not a normal day). The baseline for a festival day is the
 * mean of those days — for the day's total, its categories, its districts and
 * its hours alike, so the cuts add up.
 *
 * Unlike the rest of the dashboard this reads the trading day in progress too:
 * a festival is watched as it happens. A partial day is flagged, compared hour
 * for hour against the same point of an ordinary day, and left out of the
 * whole-day comparisons (categories, districts, regions) until it closes.
 *
 * Official figures from earlier years (src/data/festivals.json) are TASMAC's own,
 * as reported in the press. They are full sales; ours are floors — a bottle sold
 * and restocked between two readings is never seen — so they sit side by side,
 * never subtracted.
 */

export interface FestivalDef {
  id: string;
  name: { en: string; ta: string };
  day: string;
  from: number;
  to: number;
  counted?: number[];
}

export interface HistoryReport {
  dates: string[];
  total: number;
  perDay?: Record<string, number>;
  regions?: Record<string, number>;
  source: string;
  headline?: string;
  published?: string;
  url?: string;
  note?: string;
  alt?: { total: number; dates?: string[]; source: string; note?: string }[];
}
export interface HistoryYear { year: number; day: string; perDay?: Record<string, number>; reports: HistoryReport[] }

type Cats = Record<string, number>;
export interface FestDay {
  day: string;
  offset: number;
  /** Not yet traded, or trading and not yet closed (the closing report lands after midnight). */
  future: boolean;
  partial: boolean;
  /** Revenue paise, bottles, millilitres, pure-alcohol millilitres. */
  rev: number; units: number; ml: number; alc: number;
  base: { rev: number; units: number; ml: number; alc: number };
  /** Revenue paise by category, and the same for an ordinary day. */
  cats: Cats; baseCats: Cats;
}

export interface FestivalData {
  def: FestivalDef;
  status: 'upcoming' | 'live' | 'done';
  /** Trading day in progress, and the last report hour seen in it. */
  today: string;
  days: FestDay[];
  /** Ordinary days used, per weekday (0 = Sunday). */
  baseCount: number[];
  /** Report hours in trading order (12 … 21, then the after-midnight closing report). */
  hourCols: number[];
  /** Per window day: revenue paise by hour column; and an ordinary same-weekday day's. */
  hours: Record<string, { values: number[]; base: number[]; lastCol: number }>;
  /** Over the closed window days. Statewide only. */
  districts: { id: number; name: string; rev: number; base: number }[];
  regions: { name: string; rev: number; base: number }[];
  /** Closed window days that fed the cuts above. */
  closedDays: string[];
}

export interface FestivalSummary {
  id: string; name: { en: string; ta: string }; day: string; from: number; to: number;
  rev: number; base: number; peakDay: string; peakRev: number; peakBase: number;
}

export interface FestivalDTO {
  featured: FestivalData | null;
  /** Lead the dashboard with it: live, closed in the last three weeks, or opening within a fortnight. */
  prominent: boolean;
  past: FestivalSummary[];
  history: Record<string, HistoryYear[]>;
}

const DEFS = FEST.festivals as FestivalDef[];
const HISTORY = FEST.history as unknown as Record<string, HistoryYear[]>;

const DAY = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const dow = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay();
const span = (f: FestivalDef) => {
  const out: string[] = [];
  for (let o = f.from; o <= f.to; o++) out.push(addDays(f.day, o));
  return out;
};
const ALL_FEST_DAYS = new Set(DEFS.flatMap(span));
/** Trading order: the day's hours from 06:00, then the small hours. */
const tradingOrder = (h: number) => (h + 18) % 24;

/**
 * The festival to lead with: the one in progress, else the latest whose window
 * closed in the last three weeks, else the next to come (shown with history
 * only) — within a fortnight of opening; otherwise the latest past one.
 */
function pickFeatured(today: string): { def: FestivalDef; status: FestivalData['status']; prominent: boolean } | null {
  const sorted = [...DEFS].sort((a, b) => a.day.localeCompare(b.day));
  const live = sorted.find((f) => addDays(f.day, f.from) <= today && today <= addDays(f.day, f.to));
  if (live) return { def: live, status: 'live', prominent: true };
  const done = sorted.filter((f) => addDays(f.day, f.to) < today && addDays(f.day, f.from) >= ANALYSIS_FROM);
  const recent = done[done.length - 1];
  const next = sorted.find((f) => addDays(f.day, f.from) > today);
  if (recent && addDays(recent.day, recent.to + 21) >= today) return { def: recent, status: 'done', prominent: true };
  if (next && addDays(next.day, next.from - 14) <= today) return { def: next, status: 'upcoming', prominent: true };
  return recent ? { def: recent, status: 'done', prominent: false } : next ? { def: next, status: 'upcoming', prominent: false } : null;
}
const g = globalThis as unknown as { __tasmacFestival?: Map<string, FestivalDTO> };
const cache = (g.__tasmacFestival ??= new Map());

export function festival(districtId: number | null): FestivalDTO {
  const d = readDb();
  const built = (d.prepare(`SELECT value FROM meta WHERE key = 'analytics_built_at'`).get() as { value: string } | undefined)?.value ?? '';
  const today = (d.prepare('SELECT MAX(day) AS day FROM fact_sales').get() as { day: string | null }).day ?? ANALYSIS_FROM;
  const key = `${districtId ?? 'all'}|${built}|${today}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 80) cache.clear();

  const scope = districtId == null ? '' : 'AND f.district_id = @district';

  // ── every day's total in scope, for the ordinary-day test ──────────
  const dayTotals = new Map(
    (d.prepare(`SELECT f.day, SUM(f.revenue_paise) AS rev FROM fact_sales f WHERE f.day >= @from ${scope} GROUP BY 1`)
      .all({ from: ANALYSIS_FROM, district: districtId }) as { day: string; rev: number }[]).map((r) => [r.day, r.rev]),
  );
  const allRev = [...dayTotals.values()].sort((a, b) => a - b);
  const median = allRev[Math.floor(allRev.length / 2)] ?? 0;
  const isDry = (day: string) => !!DRY_DAYS[day] || (dayTotals.get(day) ?? 0) < median * 0.1;

  /** Ordinary days before `start`, by weekday. */
  const ordinaryBefore = (start: string): string[][] => {
    const byW: string[][] = Array.from({ length: 7 }, () => []);
    for (let day = addDays(start, -56); day < start; day = addDays(day, 1)) {
      if (day < ANALYSIS_FROM || !dayTotals.has(day)) continue;
      if (isDry(day) || isDry(addDays(day, 1)) || ALL_FEST_DAYS.has(day)) continue;
      byW[dow(day)].push(day);
    }
    return byW.map((days) => {
      const v = days.map((x) => dayTotals.get(x) ?? 0).sort((a, b) => a - b);
      const med = v[Math.floor(v.length / 2)] ?? 0;
      return days.filter((x) => (dayTotals.get(x) ?? 0) >= med * 0.6);
    });
  };

  // ── past festivals, one line each ─────────────────────────────────
  const past: FestivalSummary[] = [];
  for (const f of [...DEFS].sort((a, b) => a.day.localeCompare(b.day))) {
    const days = span(f);
    if (days[0] < ANALYSIS_FROM || days[days.length - 1] >= today) continue;
    const ord = ordinaryBefore(days[0]);
    let rev = 0, base = 0, peak = { day: days[0], rev: -1, base: 0 };
    for (const day of days) {
      const set = ord[dow(day)];
      const b = set.length ? set.reduce((a, x) => a + (dayTotals.get(x) ?? 0), 0) / set.length : 0;
      const r = dayTotals.get(day) ?? 0;
      rev += r; base += b;
      if (b && (peak.rev < 0 || r / b > peak.rev / (peak.base || 1))) peak = { day, rev: r, base: b };
    }
    past.push({ id: f.id, name: f.name, day: f.day, from: f.from, to: f.to, rev, base, peakDay: peak.day, peakRev: Math.max(0, peak.rev), peakBase: peak.base });
  }

  const pick = pickFeatured(today);
  const featured = pick ? build(pick.def, pick.status) : null;
  const dto: FestivalDTO = { featured, prominent: pick?.prominent ?? false, past, history: HISTORY };
  cache.set(key, dto);
  return dto;

  function build(def: FestivalDef, status: FestivalData['status']): FestivalData {
    const days = span(def);
    const ord = ordinaryBefore(days[0]);
    const baseDays = [...new Set(ord.flat())];
    const want = [...days, ...baseDays].filter((x) => x <= today);
    const p = { district: districtId };
    const inList = want.map((x) => `'${x}'`).join(',') || "''";

    // Day × district × category, for the window and its ordinary days at once.
    const rows = d.prepare(
      `SELECT f.day, f.district_id AS district, COALESCE(lt.category, 'OTHER') AS cat,
              SUM(f.revenue_paise) AS rev, SUM(f.units) AS units,
              SUM(f.units * COALESCE(s.volume_ml, 0)) AS ml,
              SUM(f.units * COALESCE(s.volume_ml, 0) * ${ABV_SQL}) AS alc
         FROM fact_sales f JOIN sku s ON s.sku_id = f.sku_id
         LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
        WHERE f.day IN (${inList}) ${scope}
        GROUP BY 1, 2, 3`,
    ).all(p) as { day: string; district: number; cat: string; rev: number; units: number; ml: number; alc: number }[];

    type Acc = { rev: number; units: number; ml: number; alc: number; cats: Cats; dist: Map<number, number> };
    const acc = new Map<string, Acc>();
    for (const r of rows) {
      const a: Acc = acc.get(r.day) ?? { rev: 0, units: 0, ml: 0, alc: 0, cats: {}, dist: new Map() };
      a.rev += r.rev; a.units += r.units; a.ml += r.ml; a.alc += r.alc;
      a.cats[r.cat] = (a.cats[r.cat] ?? 0) + r.rev;
      a.dist.set(r.district, (a.dist.get(r.district) ?? 0) + r.rev);
      acc.set(r.day, a);
    }
    const mean = (set: string[], f: (a: Acc) => number) => (set.length ? set.reduce((s, x) => s + (acc.has(x) ? f(acc.get(x) as Acc) : 0), 0) / set.length : 0);

    // A day is closed once its after-midnight closing report has had time to land.
    const closedThrough = addDays(new Date(Date.now() + 5.5 * 3_600_000 - 1.5 * 3_600_000).toISOString().slice(0, 10), -1);
    const out: FestDay[] = days.map((day, i) => {
      const a = acc.get(day);
      const set = ord[dow(day)];
      const baseCats: Cats = {};
      for (const c of CATEGORIES) {
        const v = mean(set, (x) => x.cats[c] ?? 0);
        if (v) baseCats[c] = v;
      }
      return {
        day, offset: def.from + i, future: day > today, partial: day <= today && day > closedThrough,
        rev: a?.rev ?? 0, units: a?.units ?? 0, ml: a?.ml ?? 0, alc: a?.alc ?? 0,
        base: { rev: mean(set, (x) => x.rev), units: mean(set, (x) => x.units), ml: mean(set, (x) => x.ml), alc: mean(set, (x) => x.alc) },
        cats: a?.cats ?? {}, baseCats,
      };
    });
    const closed = out.filter((x) => !x.partial && !x.future && acc.has(x.day)).map((x) => x.day);

    // ── hours ─────────────────────────────────────────────────────────
    const hourRows = d.prepare(
      `SELECT f.day, f.hour, SUM(f.revenue_paise) AS rev FROM fact_hour f WHERE f.day IN (${inList}) ${scope} GROUP BY 1, 2`,
    ).all(p) as { day: string; hour: number; rev: number }[];
    const byDayHour = new Map<string, number[]>();
    const colTot = new Array(24).fill(0);
    for (const r of hourRows) {
      const v = byDayHour.get(r.day) ?? new Array(24).fill(0);
      v[r.hour] += r.rev;
      byDayHour.set(r.day, v);
      colTot[r.hour] += r.rev;
    }
    const peak = Math.max(1, ...colTot);
    const hourCols = colTot.map((v, h) => [v, h]).filter(([v]) => v >= peak * 0.03).map(([, h]) => h)
      .sort((a, b) => tradingOrder(a) - tradingOrder(b));
    // Stray reports outside the columns (an early correction) fold into the nearest kept hour,
    // so a day's hours still add up to its total.
    const fold = (v: number[]) => {
      const outv = hourCols.map((h) => v[h]);
      v.forEach((x, h) => {
        if (hourCols.includes(h) || !x) return;
        let j = 0, best = 99;
        hourCols.forEach((c, k) => { const dd = Math.abs(tradingOrder(c) - tradingOrder(h)); if (dd < best) { best = dd; j = k; } });
        outv[j] += x;
      });
      return outv;
    };
    const hours: FestivalData['hours'] = {};
    for (const x of out) {
      const v = byDayHour.get(x.day);
      const set = ord[dow(x.day)];
      const base = hourCols.map(() => 0);
      for (const b of set) {
        const bv = fold(byDayHour.get(b) ?? new Array(24).fill(0));
        bv.forEach((y, k) => { base[k] += y / set.length; });
      }
      const values = v ? fold(v) : hourCols.map(() => 0);
      let lastCol = -1;
      if (v) values.forEach((y, k) => { if (y > 0) lastCol = k; });
      hours[x.day] = { values, base, lastCol: x.partial ? lastCol : hourCols.length - 1 };
    }

    // ── districts and regions, over the closed days ────────────────────
    let districts: FestivalData['districts'] = [];
    let regions: FestivalData['regions'] = [];
    if (districtId == null && closed.length) {
      const names = new Map((d.prepare('SELECT district_id AS id, name FROM district').all() as { id: number; name: string }[]).map((r) => [r.id, r.name]));
      const dist = new Map<number, { rev: number; base: number }>();
      for (const day of closed) {
        const set = ord[dow(day)];
        for (const [id, v] of acc.get(day)?.dist ?? []) {
          const e = dist.get(id) ?? { rev: 0, base: 0 };
          e.rev += v; dist.set(id, e);
        }
        for (const b of set) for (const [id, v] of acc.get(b)?.dist ?? []) {
          const e = dist.get(id) ?? { rev: 0, base: 0 };
          e.base += v / set.length; dist.set(id, e);
        }
      }
      districts = [...dist.entries()].map(([id, e]) => ({ id, name: names.get(id) ?? String(id), ...e })).filter((x) => x.base > 0);

      // TASMAC's five regions. A shop the GIS layer never placed takes the region
      // most of its district's shops are in.
      const want2 = [...new Set([...closed, ...closed.flatMap((x) => ord[dow(x)])])];
      const reg = d.prepare(
        `WITH dr AS (SELECT district_id, tasmac_region_id AS r, COUNT(*) AS n FROM shop WHERE tasmac_region_id IS NOT NULL GROUP BY 1, 2),
              best AS (SELECT district_id, r FROM dr d1 WHERE n = (SELECT MAX(n) FROM dr d2 WHERE d2.district_id = d1.district_id) GROUP BY district_id)
         SELECT fs.day, tr.name AS region, SUM(fs.revenue_paise) AS rev
           FROM fact_shop_day fs JOIN shop s ON s.shop_no = fs.shop_no
           LEFT JOIN best ON best.district_id = s.district_id
           JOIN tasmac_region tr ON tr.region_id = COALESCE(s.tasmac_region_id, best.r)
          WHERE fs.day IN (${want2.map((x) => `'${x}'`).join(',')})
          GROUP BY 1, 2`,
      ).all() as { day: string; region: string; rev: number }[];
      const rv = new Map<string, Map<string, number>>();
      for (const r of reg) {
        const m = rv.get(r.day) ?? new Map();
        m.set(r.region, r.rev);
        rv.set(r.day, m);
      }
      const rr = new Map<string, { rev: number; base: number }>();
      for (const day of closed) {
        const set = ord[dow(day)];
        for (const [name, v] of rv.get(day) ?? []) { const e = rr.get(name) ?? { rev: 0, base: 0 }; e.rev += v; rr.set(name, e); }
        for (const b of set) for (const [name, v] of rv.get(b) ?? []) { const e = rr.get(name) ?? { rev: 0, base: 0 }; e.base += v / set.length; rr.set(name, e); }
      }
      regions = [...rr.entries()].map(([name, e]) => ({ name, ...e })).sort((a, b) => b.rev - a.rev);
    }

    return {
      def, status, today, days: out, baseCount: ord.map((x) => x.length), hourCols, hours,
      districts, regions, closedDays: closed,
    };
  }
}
