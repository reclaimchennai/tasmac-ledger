/**
 * Indian-numbering helpers. Crore/lakh is how these magnitudes are actually read
 * here — and in Tamil they are read as கோடி and லட்சம், not as "cr" and "L", so
 * the magnitude words are language-dependent even though the digits are not.
 */

type Lang = 'en' | 'ta';

const MAGNITUDE: Record<Lang, { crore: string; lakh: string; thousand: string }> = {
  en: { crore: ' cr', lakh: ' L', thousand: 'k' },
  ta: { crore: ' கோடி', lakh: ' லட்சம்', thousand: ' ஆயிரம்' },
};

export function inr(paise: number, opts: { compact?: boolean; lang?: Lang } = {}): string {
  const rupees = paise / 100;
  if (!opts.compact) return '₹' + Math.round(rupees).toLocaleString('en-IN');
  return '₹' + compactRupees(rupees, opts.lang);
}

export function compactRupees(rupees: number, lang: Lang = 'en'): string {
  const abs = Math.abs(rupees);
  const m = MAGNITUDE[lang];
  if (abs >= 1e7) return trim(rupees / 1e7) + m.crore;
  if (abs >= 1e5) return trim(rupees / 1e5) + m.lakh;
  if (abs >= 1e3) return trim(rupees / 1e3) + m.thousand;
  return Math.round(rupees).toLocaleString('en-IN');
}

export function count(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

/**
 * Bottle size. The digits are digits in both languages; only the unit changes.
 *
 * Upstream writes these as "650ml" and "1000ml", and a Tamil page showing "650ml"
 * has an English word sitting in the middle of it for no reason — மி.லி is what
 * is printed on a Tamil label.
 */
export function size(unitName: string | null | undefined, lang: Lang = 'en'): string {
  if (!unitName) return '—';
  if (lang === 'en') return unitName;
  return unitName
    .replace(/(\d)\s*ml\b/gi, '$1 மி.லி')
    .replace(/(\d)\s*(?:ltr|litre|liter|l)\b/gi, '$1 லி');
}

/** A comma-separated list of sizes, as the brands ledger shows them. */
export function sizeList(sizes: string | null | undefined, lang: Lang = 'en'): string {
  if (!sizes) return '—';
  return sizes.split(',').map((s) => size(s.trim(), lang)).join(', ');
}

export function compactCount(n: number, lang: Lang = 'en'): string {
  const abs = Math.abs(n);
  const m = MAGNITUDE[lang];
  if (abs >= 1e7) return trim(n / 1e7) + m.crore;
  if (abs >= 1e5) return trim(n / 1e5) + m.lakh;
  if (abs >= 1e3) return trim(n / 1e3) + m.thousand;
  return String(Math.round(n));
}

function trim(n: number): string {
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function pct(n: number, digits = 1): string {
  return (n * 100).toFixed(digits) + '%';
}

/*
  Dates and clock times.

  These carry language, which is why they take it as an argument rather than
  reading it: the same formatter runs in server components, in the client-side
  shops explorer, and in the Telegram bot, and only the first of those has a
  request to read a cookie from. English is the default so the bot and any older
  call site keep working unchanged.
*/

type L = 'en' | 'ta';

const MONTHS: Record<L, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ta: ['ஜன', 'பிப்', 'மார்', 'ஏப்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆக', 'செப்', 'அக்', 'நவ', 'டிச'],
};

/** "மு.ப / பி.ப" are the standard Tamil abbreviations for a.m. / p.m. */
const MERIDIEM: Record<L, [string, string]> = {
  en: ['am', 'pm'],
  ta: ['மு.ப', 'பி.ப'],
};

/** "2026-08-05 19:05:00" → "5 Aug, 7:05 pm". Input is already IST. */
export function stamp(
  iso: string | null | undefined,
  opts: { withDate?: boolean; lang?: L } = {},
): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, hh, mi] = m;
  const lang = opts.lang ?? 'en';
  const h = Number(hh);
  const time = `${((h + 11) % 12) + 1}:${mi} ${MERIDIEM[lang][h < 12 ? 0 : 1]}`;
  const date = `${Number(d)} ${MONTHS[lang][Number(mo) - 1]}`;
  if (opts.withDate === false) return time;
  return `${date}, ${time}${Number(y) !== new Date().getFullYear() ? ` ${y}` : ''}`;
}

const WEEKDAYS: Record<L, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ta: ['ஞாயிற்றுக்கிழமை', 'திங்கட்கிழமை', 'செவ்வாய்க்கிழமை', 'புதன்கிழமை', 'வியாழக்கிழமை', 'வெள்ளிக்கிழமை', 'சனிக்கிழமை'],
};

const MONTHS_FULL: Record<L, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'],
  ta: ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்',
    'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்'],
};

/** 1st, 2nd, 3rd, 4th … including the 11th–13th exceptions. */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * "Thursday, 6th August, 2026".
 *
 * The stored string is already IST wall-clock, so the weekday is worked out from
 * its own fields through `Date.UTC` — parsing it as a local date would shift the
 * day for anyone not reading this in India, which is exactly the reader most
 * likely to get the wrong answer and least likely to notice.
 *
 * Tamil takes no ordinal suffix: the date is just the numeral.
 */
export function longDate(iso: string | null | undefined, lang: L = 'en'): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m.map(Number) as unknown as [string, number, number, number];
  const weekday = WEEKDAYS[lang][new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const month = MONTHS_FULL[lang][mo - 1];
  return lang === 'ta'
    ? `${weekday}, ${d} ${month} ${y}`
    : `${weekday}, ${ordinal(d)} ${month}, ${y}`;
}

export function dayLabel(day: string, lang: L = 'en'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[lang][Number(m[2]) - 1]}`;
}

/**
 * Relative time. Tamil puts the unit before the postposition and the whole
 * phrase before the verb, so the strings are written out per language rather
 * than assembled from a shared "{n} {unit} ago" template.
 */
export function ago(iso: string | null | undefined, nowIso: string, lang: L = 'en'): string {
  if (!iso) return '—';
  const t = Date.parse(iso.replace(' ', 'T') + 'Z');
  const n = Date.parse(nowIso.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t) || !Number.isFinite(n)) return '—';

  const mins = Math.round((n - t) / 60000);
  const hrs = Math.round(mins / 60);
  const days = Math.round(hrs / 24);

  if (lang === 'ta') {
    if (mins < 1) return 'இப்போதே';
    if (mins < 60) return `${mins} நிமிடங்களுக்கு முன்`;
    if (hrs < 24) return `${hrs} மணி நேரத்திற்கு முன்`;
    return `${days} நாட்களுக்கு முன்`;
  }
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (hrs < 24) return `${hrs} hr ago`;
  return `${days} d ago`;
}

export const CATEGORY_COLOR: Record<string, string> = {
  BRANDY: 'var(--cat-brandy)',
  RUM: 'var(--cat-rum)',
  VODKA: 'var(--cat-vodka)',
  BEER: 'var(--cat-beer)',
  WINE: 'var(--cat-wine)',
  GIN: 'var(--cat-gin)',
  WHISKY: 'var(--cat-whisky)',
  OTHER: 'var(--cat-other)',
};

export const categoryColor = (c: string | null | undefined) => CATEGORY_COLOR[(c ?? 'OTHER').toUpperCase()] ?? 'var(--ink-3)';
