import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { dashboard, PRICE_BANDS } from '@/lib/dashboard';
import { readDb, DB_PATH } from '@/lib/db';
import { page as i18n } from '@/lib/i18n';
import { DB_STRINGS } from '@/lib/strings-db';
import { perCapita } from '@/lib/population';
import { PC_STRINGS } from '@/lib/strings-percapita';
import { festival } from '@/lib/festival';
import { FEST_STRINGS } from '@/lib/strings-festival';
import { Dashboard, type Poster } from '@/components/db/dashboard';
import type { Geo } from '@/components/db/charts';
import geoJson from '@/data/tn-districts.json';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sales dashboard — TASMAC Ledger',
  description: 'Daily TASMAC sales across Tamil Nadu and every district: by category, brand, distillery, bottle size, price, hour and shop, inferred from the public stock feed.',
};

/**
 * /db — the sales dashboard. Statewide by default, one district with ?d=.
 *
 * All the aggregation happens in src/lib/dashboard.ts against the analytics
 * facts; this page only resolves names into the reader's language, finds the
 * posters on disk, and hands the lot to the client component that draws it.
 */
export default async function DbPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const { lang, t, L } = await i18n();
  const S = DB_STRINGS[lang];

  const all = readDb().prepare('SELECT district_id AS id, name FROM district ORDER BY name').all() as { id: number; name: string }[];
  const want = Number(sp.d);
  const districtId = all.some((x) => x.id === want) ? want : null;

  const raw = dashboard(districtId);
  const data = {
    ...raw,
    brands: raw.brands.map((b) => ({ ...b, name: L('product_line', b.id, b.name), supplier: b.supplierId ? L('supplier', b.supplierId, b.supplier) : b.supplier })),
    suppliers: raw.suppliers.map((s) => ({ ...s, name: L('supplier', s.id, s.name) })),
    taluks: raw.taluks.map((x) => ({ ...x, name: L('taluk', x.id, x.name) })),
    topShops: raw.topShops.map((x) => ({ ...x, taluk: L('taluk', x.talukId, x.taluk), district: L('district', x.districtId, x.district) })),
  };
  const districtOptions = all
    .map((x) => ({ id: x.id, name: L('district', x.id, x.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));

  const catLabels = Object.fromEntries(
    ['BRANDY', 'RUM', 'VODKA', 'BEER', 'WINE', 'GIN', 'WHISKY', 'OTHER'].map((c) => [c, t(`category.${c}` as 'category.BEER')]),
  );
  // Short labels — nine of them share a phone's width; the rupee sign is in the subtitle.
  const k = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));
  const priceBands = PRICE_BANDS.map((hi, i) => {
    const lo = i === 0 ? 0 : PRICE_BANDS[i - 1];
    if (i === 0) return `≤${k(hi)}`;
    if (!Number.isFinite(hi)) return `>${k(lo)}`;
    return `${k(lo + 1 > 1000 ? lo : lo + 1)}–${k(hi)}`;
  });

  // Per capita compares all 38 districts whatever the scope, so it is not scoped.
  const pcRaw = perCapita();
  const pc = { ...pcRaw, rows: pcRaw.rows.map((r) => ({ ...r, name: L('district', r.district_id, r.name) })) };

  // The festival tracker follows the scope; its district and region cuts are statewide-only.
  const fRaw = festival(districtId);
  const fest = fRaw.featured
    ? { ...fRaw, featured: { ...fRaw.featured, districts: fRaw.featured.districts.map((x) => ({ ...x, name: L('district', x.id, x.name) })) } }
    : fRaw;

  return (
    <Dashboard
      data={data}
      S={S}
      lang={lang}
      geo={geoJson as unknown as Geo}
      catLabels={catLabels}
      districtOptions={districtOptions}
      priceBands={priceBands}
      pc={pc}
      PC={PC_STRINGS[lang]}
      fest={fest}
      F={FEST_STRINGS[lang]}
      posters={posters(lang).map((p) => ({ ...p, title: S.posterTitles[p.kind] ?? p.title }))}
    />
  );
}

/**
 * Posters are rendered outside the app (posters/, on a timer) into
 * data/posters as <kind>_<lang>.png / .pdf / _preview.jpg, and served by
 * ./posters/[file]. Whatever is there is listed; nothing there, no section.
 */
function posters(lang: 'en' | 'ta'): Poster[] {
  let files: string[] = [];
  try {
    files = readdirSync(join(DB_PATH, '..', 'posters'));
  } catch {
    return [];
  }
  const by = new Map<string, Map<string, Poster['files'][number]>>();
  for (const f of files) {
    const m = f.match(/^(.+)_(en|ta)(_preview)?\.(png|pdf|jpg)$/);
    if (!m) continue;
    const [, kind, l, preview, ext] = m;
    const langs = by.get(kind) ?? new Map();
    const entry = langs.get(l) ?? { lang: l };
    const url = `/db/posters/${encodeURIComponent(f)}`;
    if (preview) entry.preview = url;
    else if (ext === 'png') entry.png = url;
    else if (ext === 'pdf') entry.pdf = url;
    langs.set(l, entry);
    by.set(kind, langs);
  }
  // A festival sheet (<festival>-<year>) leads while it exists, then its price history; the standing four follow.
  const ORDER = ['overview', 'districts', 'brands', 'percapita'];
  const rank = (k: string) => (/-\d{4}$/.test(k) ? 0 : k.endsWith('-prices') ? 0.5 : ORDER.indexOf(k) + 1 || 99);
  return [...by.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([kind, langs]) => ({
    kind,
    title: kind.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    files: [...langs.values()].sort((a, b) => (a.lang === lang ? -1 : b.lang === lang ? 1 : 0)),
  }));
}
