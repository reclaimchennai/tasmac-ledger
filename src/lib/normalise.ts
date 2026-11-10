/**
 * Upstream data hygiene.
 *
 * The important one is `parseReportedAt`. The per-district stock endpoint returns
 * `last_updated_time` as "05/08/2026 06:35" — dd/MM/yyyy plus a TWELVE-hour clock
 * with no AM/PM marker. The 64-shop sample endpoint returns the same instant as
 * "2026-08-05 18:35:00" in 24-hour form, which is how we know 06:35 meant 18:35.
 *
 * Since the feed is live and refreshed every ~30 min, we resolve the ambiguity by
 * picking whichever of the two readings is the most recent instant not in the
 * future relative to fetch time. That is exact whenever the data is under 12 h old,
 * and degrades to "12 h too early" only for a genuinely stale shop — which we flag
 * rather than silently trust.
 */

export const IST_OFFSET_MIN = 330; // UTC+05:30

/** Current wall-clock time in IST, as a Date whose UTC fields hold IST values. */
export function istNow(at: Date = new Date()): Date {
  return new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
}

/** ISO-like "YYYY-MM-DD HH:MM:SS" in IST. */
export function istStamp(at: Date = new Date()): string {
  return istNow(at).toISOString().replace('T', ' ').slice(0, 19);
}

export function istDay(at: Date = new Date()): string {
  return istNow(at).toISOString().slice(0, 10);
}

export interface ParsedReport {
  /** normalised "YYYY-MM-DD HH:MM:SS" in IST, or null if unparseable */
  iso: string | null;
  /** true when we had to guess AM vs PM */
  ambiguous: boolean;
  /** true when even the best reading is more than 12 h behind fetch time */
  stale: boolean;
}

const DDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const ISOISH = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/;

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (y: number, mo: number, d: number, h: number, mi: number, s: number) =>
  `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;

export function parseReportedAt(raw: string | null | undefined, fetchedAtIso: string): ParsedReport {
  if (!raw) return { iso: null, ambiguous: false, stale: false };
  const s = raw.trim();

  // Already 24-hour and unambiguous (the sample endpoint).
  const iso = ISOISH.exec(s);
  if (iso) {
    const [, y, mo, d, h, mi, sec] = iso;
    return { iso: fmt(+y, +mo, +d, +h, +mi, +(sec ?? 0)), ambiguous: false, stale: false };
  }

  const m = DDMMYYYY.exec(s);
  if (!m) return { iso: null, ambiguous: false, stale: false };

  const [, dd, mm, yyyy, hh, mi, sec] = m;
  const hour12 = +hh;
  const minute = +mi;
  const second = +(sec ?? 0);

  // A literal hour > 12 is already 24-hour — nothing to resolve.
  if (hour12 > 12) {
    return { iso: fmt(+yyyy, +mm, +dd, hour12, minute, second), ambiguous: false, stale: false };
  }

  // Two candidate readings of a 12-hour clock: 12 → 00, and h → h+12.
  const amHour = hour12 % 12; // 12:xx AM => 00:xx
  const pmHour = amHour + 12;
  const fetched = Date.parse(fetchedAtIso.replace(' ', 'T') + 'Z');

  const candidates = [pmHour, amHour]
    .map((h) => ({ h, iso: fmt(+yyyy, +mm, +dd, h, minute, second) }))
    .map((c) => ({ ...c, t: Date.parse(c.iso.replace(' ', 'T') + 'Z') }))
    .filter((c) => c.t <= fetched + 5 * 60_000) // small clock-skew allowance
    .sort((a, b) => b.t - a.t);

  if (candidates.length === 0) {
    // Both readings are in the future — the report is dated ahead of us; take AM.
    return { iso: fmt(+yyyy, +mm, +dd, amHour, minute, second), ambiguous: true, stale: false };
  }

  const best = candidates[0];
  return { iso: best.iso, ambiguous: true, stale: fetched - best.t > 12 * 3600_000 };
}

/** "180ml" → 180, "1000ml" → 1000, "650 ML" → 650. */
export function parseVolumeMl(unitName: string | null | undefined): number | null {
  if (!unitName) return null;
  const m = /(\d+(?:\.\d+)?)\s*(ml|l|ltr|litre|liter)?/i.exec(unitName.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] ?? 'ml').toLowerCase();
  return Math.round(unit === 'ml' ? n : n * 1000);
}

/** Product names arrive in mixed case and with inconsistent whitespace/punctuation. */
export function nameKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/M\/S\.?\s*/g, '')
    .replace(/[.,'"()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nicely-cased display form for SHOUTED source strings; leaves mixed case alone. */
export function displayName(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return name.trim().replace(/\s+/g, ' ');
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Xo|Vsop|Ml|Snj|Imfs|Iml|Uk|Usa|No)\b/g, (w) => w.toUpperCase());
}

const CATEGORIES = ['BEER', 'BRANDY', 'WHISKY', 'RUM', 'GIN', 'VODKA', 'WINE'] as const;

/** "OTHER-WHISKY" → { category: 'WHISKY', premium: true }; "BRANDY" → { BRANDY, false }. */
export function classifyLiquorType(name: string): { category: string; isPremium: boolean } {
  const up = name.toUpperCase();
  const isPremium = up.startsWith('OTHER');
  const bare = up.replace(/^OTHER[\s-]*/, '');
  const category = CATEGORIES.find((c) => bare.includes(c)) ?? 'OTHER';
  return { category, isPremium };
}
