'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, TipProvider, TipRow, type CardText, type LegendItem, type TableSpec } from './kit';
import {
  Columns, DistrictMap, Heatmap, HBars, Lines, Lorenz, SeqKey, Stack100, StackedArea,
  type Geo, type HBar, type Series,
} from './charts';
import { PerCapitaCards, type PerCapitaDTO } from './percapita';
import type { PerCapitaStrings } from '@/lib/strings-percapita';
import { FestivalCards, type FestivalDTO } from './festival';
import type { FestivalStrings } from '@/lib/strings-festival';
import { CATEGORY_COLOR, compactCount, compactRupees } from '@/lib/format';
import type { DbStrings } from '@/lib/strings-db';

/**
 * The /db dashboard, client side.
 *
 * Everything arrives pre-aggregated from the server (src/lib/dashboard.ts) for
 * the chosen area; this component only re-cuts it for the chosen measure and
 * draws. Changing the area is a server round trip under a transition — the
 * current charts stay up, faded, until the new ones land — and the measure is
 * local state, so it survives the area change.
 */

type Measure = 'rev' | 'units' | 'ml';
const MI: Record<Measure, 0 | 1 | 2> = { rev: 0, units: 1, ml: 2 };

export interface DbData {
  from: string;
  to: string;
  builtAt: string | null;
  districtId: number | null;
  daily: { day: string; cats: Record<string, [number, number, number]>; received: number; dry: string | null }[];
  hourly: number[][];
  totals: { rev: number; units: number; ml: number; alc: number; shopsSelling: number; shopDays: number; shopsOperational: number };
  byCategory: { category: string; rev: number; units: number; ml: number; alc: number }[];
  brands: { id: number; name: string; category: string; supplierId: number | null; supplier: string | null; rev: number; units: number; ml: number }[];
  brandCount: number;
  suppliers: { id: number; name: string; type: string | null; rev: number; units: number; ml: number; cats: Record<string, [number, number, number]> }[];
  districts: { id: number; name: string; rev: number; units: number; ml: number; shops: number; shopDays: number; operational: number }[];
  taluks: { id: number; name: string; rev: number; units: number; shops: number }[];
  sizes: { ml: number; category: string; units: number; rev: number }[];
  prices: { band: number; units: number; rev: number }[];
  lorenz: [number, number][];
  topShops: { shopNo: number; address: string | null; taluk: string | null; district: string | null; rev: number; units: number; days: number }[];
  points: [number, number, number, number][];
}

export interface Poster { kind: string; title: string; files: { lang: string; png?: string; pdf?: string; preview?: string }[] }

export function Dashboard({
  data, S, lang, geo, catLabels, districtOptions, priceBands, posters, pc, PC, fest, F,
}: {
  data: DbData;
  S: DbStrings;
  lang: 'en' | 'ta';
  geo: Geo;
  catLabels: Record<string, string>;
  districtOptions: { id: number; name: string }[];
  priceBands: string[];
  posters: Poster[];
  pc: PerCapitaDTO;
  PC: PerCapitaStrings;
  fest: FestivalDTO;
  F: FestivalStrings;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [m, setM] = useState<Measure>('rev');
  const [mapMode, setMapMode] = useState<'total' | 'perShop'>('total');

  const go = (id: number | null) =>
    start(() => router.replace(id == null ? '/db' : `/db?d=${id}`, { scroll: false }));

  // ── formatting ────────────────────────────────────────────────
  // Past a thousand crore the compact form needs its digit grouping back
  // ("₹8,358 cr", not "₹8358 cr").
  const crore = lang === 'ta' ? ' கோடி' : ' cr';
  const grouped = (v: number) => (Math.abs(v) >= 1e10 ? Math.round(v / 1e7).toLocaleString('en-IN') + crore : null);
  const rupees = (paise: number) => '₹' + (grouped(paise / 100) ?? compactRupees(paise / 100, lang));
  const n = (v: number) => grouped(v) ?? compactCount(v, lang);
  const litres = (ml: number) => grouped(ml / 1000) ?? compactCount(ml / 1000, lang);
  const whole = (v: number) => Math.round(v).toLocaleString('en-IN');
  const fmt = m === 'rev' ? rupees : m === 'units' ? n : litres;
  const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
  const fmtDay = (day: string) => {
    const d = new Date(day + 'T00:00:00Z');
    return `${d.getUTCDate()} ${S.monthsShort[d.getUTCMonth()]}`;
  };
  const longDay = (day: string) => {
    const d = new Date(day + 'T00:00:00Z');
    return `${d.getUTCDate()} ${S.months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };
  const sub = (s: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), s);
  const unitWord = m === 'rev' ? S.unit_rev : m === 'units' ? S.unit_units : S.unit_ml;

  const districtName = data.districtId == null ? S.statewide : districtOptions.find((d) => d.id === data.districtId)?.name ?? '';
  const text: CardText = { table: S.table, chart: S.chart, download: S.download, source: S.source, scope: districtName };
  const color = (c: string) => CATEGORY_COLOR[c] ?? CATEGORY_COLOR.OTHER;
  const catLegend: LegendItem[] = data.byCategory.map((c) => ({ key: c.category, label: catLabels[c.category] ?? c.category, color: color(c.category) }));

  // ── derived series ────────────────────────────────────────────
  const days = data.daily.map((d) => d.day);
  const cats = data.byCategory.map((c) => c.category);
  const series: Series[] = cats.map((c) => ({
    key: c, label: catLabels[c] ?? c, color: color(c),
    values: data.daily.map((d) => d.cats[c]?.[MI[m]] ?? 0),
  }));
  const dayTotal = data.daily.map((d) => Object.values(d.cats).reduce((a, v) => a + v[MI[m]], 0));
  const marks = new Map<number, string>();
  data.daily.forEach((d, i) => { if (d.dry) marks.set(i, S.dryNames[d.dry] ?? S.dry); });
  const tradingDays = data.daily.filter((d) => !d.dry).length;

  // Ordinary days: not dry, not the eve of a dry day.
  const eve = new Set<number>();
  data.daily.forEach((d, i) => { if (d.dry && i > 0) eve.add(i - 1); });
  const ordinary = (i: number) => !data.daily[i].dry && !eve.has(i);
  const dow = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay();

  const weekday = useMemo(() => {
    const sum = new Array(7).fill(0), cnt = new Array(7).fill(0);
    data.daily.forEach((d, i) => { if (ordinary(i)) { sum[dow(d.day)] += dayTotal[i]; cnt[dow(d.day)]++; } });
    return sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, m]);

  const months = useMemo(() => {
    const map = new Map<string, { total: number; covered: number; trading: number }>();
    data.daily.forEach((d, i) => {
      const k = d.day.slice(0, 7);
      const r = map.get(k) ?? { total: 0, covered: 0, trading: 0 };
      r.total += dayTotal[i]; r.covered++; if (!d.dry) r.trading++;
      map.set(k, r);
    });
    return [...map.entries()].map(([k, r]) => {
      const [y, mo] = k.split('-').map(Number);
      const inMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      return { key: k, label: `${S.monthsShort[mo - 1]} ${y}`, ...r, inMonth, avg: r.trading ? r.total / r.trading : 0 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, m]);

  // Weeks run Monday to Sunday; averaged per trading day so a week with a dry
  // day in it, or a part week at either end, still compares.
  const weeks = useMemo(() => {
    const map = new Map<string, { total: number; trading: number }>();
    data.daily.forEach((d, i) => {
      const dt = new Date(d.day + 'T00:00:00Z');
      const monday = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
      const r = map.get(monday) ?? { total: 0, trading: 0 };
      r.total += dayTotal[i]; if (!d.dry) r.trading++;
      map.set(monday, r);
    });
    return [...map.entries()].map(([k, r]) => ({ key: k, total: r.total, trading: r.trading, avg: r.trading ? r.total / r.trading : 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, m]);

  const eves = data.daily
    .map((d, i) => ({ d, i }))
    .filter(({ d, i }) => d.dry && i > 0 && !data.daily[i - 1].dry)
    .map(({ d, i }) => {
      const prev = data.daily[i - 1];
      const base = weekday[dow(prev.day)];
      return { name: S.dryNames[d.dry as string] ?? S.dry, day: prev.day, value: dayTotal[i - 1], lift: base ? dayTotal[i - 1] / base - 1 : 0, weekday: S.weekdays[dow(prev.day)] };
    });

  // Hours: the ones shops actually report in, starting from the morning.
  const hourCols = useMemo(() => {
    // An hour earns a column when it carries a real share of the day; the
    // stray morning reports (corrections, a shop opening early) would only add
    // a row of near-empty cells.
    const col = new Array(24).fill(0);
    data.hourly.forEach((r) => r.forEach((v, h) => { col[h] += v; }));
    const peak = Math.max(...col);
    return col.map((v, h) => [v, h]).filter(([v]) => v >= peak * 0.03).map(([, h]) => h)
      .sort((a, b) => ((a + 18) % 24) - ((b + 18) % 24));
  }, [data]);
  const weekOrder = [1, 2, 3, 4, 5, 6, 0];

  const measureOf = (r: { rev: number; units: number; ml: number }) => (m === 'rev' ? r.rev : m === 'units' ? r.units : r.ml);

  const brands: HBar[] = [...data.brands]
    .sort((a, b) => measureOf(b) - measureOf(a))
    .slice(0, 20)
    .map((b) => ({
      key: String(b.id), label: b.name, sub: b.supplier ?? undefined, href: `/brands/${b.id}`, value: measureOf(b),
      segs: [{ key: b.category, label: catLabels[b.category] ?? b.category, color: color(b.category), value: measureOf(b) }],
    }));

  const supSorted = [...data.suppliers].sort((a, b) => measureOf(b) - measureOf(a));
  const supTotal = supSorted.reduce((a, s) => a + measureOf(s), 0) || 1;
  const suppliers: HBar[] = supSorted.slice(0, 15).map((s) => ({
    key: String(s.id), label: s.name, sub: s.type ?? undefined, href: `/suppliers/${s.id}`, value: measureOf(s),
    segs: cats.filter((c) => s.cats[c]).map((c) => ({ key: c, label: catLabels[c] ?? c, color: color(c), value: s.cats[c][MI[m]] })),
  }));
  const share = (k: number) => supSorted.slice(0, k).reduce((a, s) => a + measureOf(s), 0) / supTotal;

  // District values for the map and ranking.
  const dVal = (d: DbData['districts'][number]) => (mapMode === 'perShop' ? (d.shopDays ? measureOf(d) / d.shopDays : 0) : measureOf(d));
  const mapValues = new Map(data.districts.map((d) => [d.id, dVal(d)]));
  const names = new Map(districtOptions.map((d) => [d.id, d.name]));
  const fmtMap = mapMode === 'perShop' && m === 'units' ? (v: number) => v.toFixed(0) : fmt;
  const rankItems: HBar[] =
    data.districtId == null
      ? [...data.districts].sort((a, b) => dVal(b) - dVal(a)).map((d) => ({
          key: String(d.id), label: names.get(d.id) ?? d.name, href: `/db?d=${d.id}`, value: dVal(d),
          segs: [{ key: 'v', label: unitWord, color: 'var(--cat-brandy)', value: dVal(d) }],
        }))
      : data.taluks.map((t) => {
          const v = m === 'units' ? t.units : t.rev;
          return { key: String(t.id), label: t.name, sub: `${t.shops} ${S.shops}`, value: v, segs: [{ key: 'v', label: m === 'units' ? S.unit_units : S.unit_rev, color: 'var(--cat-brandy)', value: v }] };
        });

  // Bottle sizes: the sizes that matter, the rest folded.
  const sizeRows = useMemo(() => {
    const by = new Map<number, Map<string, number>>();
    let total = 0;
    for (const s of data.sizes) {
      const v = m === 'rev' ? s.rev : s.units;
      const r = by.get(s.ml) ?? new Map<string, number>();
      r.set(s.category, (r.get(s.category) ?? 0) + v);
      by.set(s.ml, r);
      total += v;
    }
    return [...by.entries()]
      .map(([ml, r]) => ({ ml, r, v: [...r.values()].reduce((a, x) => a + x, 0) }))
      .filter((x) => x.v / (total || 1) >= 0.002)
      .sort((a, b) => b.v - a.v)
      .map((x) => ({
        key: String(x.ml), label: x.ml >= 1000 ? `${x.ml / 1000} ${lang === 'ta' ? 'லி' : 'L'}` : `${x.ml} ${lang === 'ta' ? 'மி.லி' : 'ml'}`,
        value: x.v,
        segs: cats.filter((c) => x.r.get(c)).map((c) => ({ key: c, label: catLabels[c] ?? c, color: color(c), value: x.r.get(c) as number })),
      }));
  }, [data, m, cats, catLabels, lang]);
  const sizeFmt = m === 'rev' ? rupees : n;

  // The one line that makes the four bars worth reading: the category whose
  // share of litres most outruns its share of the money (beer, statewide).
  const mixStory = (() => {
    const T = data.totals;
    if (!T.rev || !T.ml) return '';
    const best = [...data.byCategory].sort((a, b) => (b.ml / T.ml - b.rev / T.rev) - (a.ml / T.ml - a.rev / T.rev))[0];
    if (!best || best.ml / T.ml - best.rev / T.rev < 0.05) return '';
    return sub(S.c_mix_story, { cat: catLabels[best.category] ?? best.category, a: pct(best.rev / T.rev), b: pct(best.ml / T.ml) });
  })();
  const top10 = data.lorenz.find(([a]) => a >= 0.1)?.[1] ?? 0;
  const perDay = (v: number) => (tradingDays ? v / tradingDays : 0);

  // ── tables ────────────────────────────────────────────────────
  const dailyTable: TableSpec = {
    head: [S.day, ...cats.map((c) => catLabels[c] ?? c), S.total],
    rows: data.daily.map((d, i) => [fmtDay(d.day) + (d.dry ? ` · ${S.dryNames[d.dry] ?? S.dry}` : ''), ...cats.map((c) => fmt(d.cats[c]?.[MI[m]] ?? 0)), fmt(dayTotal[i])]),
  };

  const festivalCards = (
    <FestivalCards
      data={fest} F={F} S={S} lang={lang} geo={geo} text={text} catLabels={catLabels}
      focus={data.districtId} onPick={(id) => go(id === data.districtId ? null : id)}
    />
  );

  return (
    <TipProvider>
      <div className="db" data-pending={pending || undefined}>
        {/* ── hero ─────────────────────────────────────────────── */}
        <section className="db-hero">
          <div className="label br">{S.kicker} · {districtName}</div>
          <h1 className="db-h1">{data.districtId == null ? S.title : `${S.title} — ${districtName}`}</h1>
          <p className="db-lede">{sub(S.lede, { days: tradingDays, from: longDay(data.from), to: longDay(data.to) })} {S.floorNote}</p>
        </section>

        {/* ── one filter row scopes everything below ─────────────── */}
        <div className="db-controls" role="group" aria-label={S.scope}>
          <label className="db-field">
            <span className="label">{S.scope}</span>
            <select value={data.districtId ?? ''} onChange={(e) => go(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{S.statewide}</option>
              {districtOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <div className="db-seg" role="group" aria-label={S.measure}>
            {(['rev', 'units', 'ml'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={m === k} onClick={() => setM(k)}>
                {k === 'rev' ? S.m_rev : k === 'units' ? S.m_units : S.m_ml}
              </button>
            ))}
          </div>
        </div>

        <div className="db-tiles">
          <Tile label={S.t_sales} value={rupees(data.totals.rev)} sub={sub(S.t_salesSub, { perDay: rupees(perDay(data.totals.rev)) })} />
          <Tile label={S.t_bottles} value={n(data.totals.units)} sub={sub(S.t_bottlesSub, { perDay: n(perDay(data.totals.units)) })} />
          <Tile label={S.t_litres} value={litres(data.totals.ml)} sub={sub(S.t_litresSub, { perDay: litres(perDay(data.totals.ml)) })} />
          <Tile label={S.t_alc} value={litres(data.totals.alc)} sub={S.t_alcSub} />
          <Tile label={S.t_shops} value={whole(data.totals.shopsSelling)} sub={sub(S.t_shopsSub, { n: whole(data.totals.shopsOperational) })} />
          <Tile
            label={S.t_perShop}
            value={rupees(data.totals.shopDays ? data.totals.rev / data.totals.shopDays : 0)}
            sub={sub(S.t_perShopSub, { bottles: whole(data.totals.shopDays ? data.totals.units / data.totals.shopDays : 0) })}
          />
        </div>

        <div className="db-grid">
          {fest.prominent ? festivalCards : null}

          <Card id="daily" wide kicker={S.c_daily_k} title={S.c_daily} sub={`${S.c_daily_s} (${unitWord})`} legend={catLegend} table={dailyTable} text={text}>
            <StackedArea days={days} series={series} fmt={fmt} fmtDay={fmtDay} marks={marks} totalLabel={S.total} />
          </Card>

          <Card
            id="months" kicker={S.c_month_k} title={S.c_month} sub={S.c_month_s} text={text}
            table={{
              head: [S.month, S.c_month_total, S.days, S.c_month_avg],
              rows: [
                ...months.map((x) => [x.label, fmt(x.total), `${x.covered}/${x.inMonth}`, fmt(x.avg)]),
                ...weeks.map((x) => [`${S.weekOf} ${fmtDay(x.key)}`, fmt(x.total), x.trading, fmt(x.avg)]),
              ],
            }}
            aside={
              <div className="mt-4">
                <div className="label mb-2">{S.c_week_avg}</div>
                <Columns fmt={fmt} height={190} items={weeks.map((x) => ({ key: x.key, label: fmtDay(x.key), value: x.avg }))} />
              </div>
            }
          >
            <div className="db-pair">
              <div>
                <div className="label mb-2">{S.c_month_avg}</div>
                <Columns fmt={fmt} height={200} items={months.map((x) => ({ key: x.key, label: x.label, value: x.avg }))} />
              </div>
              <div>
                <div className="label mb-2">{S.c_month_total}</div>
                <Columns
                  fmt={fmt} height={200}
                  items={months.map((x) => ({
                    key: x.key, label: x.label, value: x.total, muted: x.covered < x.inMonth,
                    sub: x.covered < x.inMonth ? `${x.covered}/${x.inMonth}` : undefined,
                    tip: (
                      <>
                        <div className="db-tip-h">{x.label}</div>
                        <TipRow label={S.c_month_total} value={fmt(x.total)} strong />
                        {x.covered < x.inMonth ? <div className="t-xs dim-2">{sub(S.c_month_partial, { n: x.covered, of: x.inMonth })}</div> : null}
                      </>
                    ),
                  }))}
                />
              </div>
            </div>
          </Card>

          <Card
            id="week" kicker={S.c_week_k} title={S.c_week} sub={S.c_week_s} text={text}
            table={{ head: [S.weekday, unitWord], rows: weekOrder.map((w) => [S.weekdays[w], fmt(weekday[w])]) }}
            aside={eves.length ? (
              <div className="db-eves-wrap">
                <div className="label br">{S.c_dry_k}</div>
                <h3 className="db-h3">{S.c_dry}</h3>
                <p className="db-sub">{S.c_dry_s}</p>
                <div className="db-eves">
                  {eves.map((e) => (
                    <div key={e.day} className="db-eve">
                      <div className="label">{sub(S.c_dry_eve, { name: e.name })} · {fmtDay(e.day)}</div>
                      <div className="db-eve-v">{fmt(e.value)}</div>
                      <div className="t-sm dim-2">{sub(S.c_dry_vs, { pct: pct(e.lift), weekday: e.weekday })}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          >
            <Columns fmt={fmt} items={weekOrder.map((w) => ({ key: String(w), label: S.weekdaysShort[w], value: weekday[w] }))} />
          </Card>


          <Card
            id="hours" wide kicker={S.c_hour_k} title={S.c_hour} sub={S.c_hour_s} text={text}
            table={{
              head: [S.weekday, ...hourCols.map((h) => `${String(h).padStart(2, '0')}:00`)],
              rows: weekOrder.map((w) => [S.weekdays[w], ...hourCols.map((h) => rupees(data.hourly[w][h]))]),
            }}
            aside={<SeqKey lo={rupees(0)} hi={rupees(Math.max(...data.hourly.flat()))} />}
          >
            <Heatmap rows={weekOrder.map((w) => S.weekdaysShort[w])} cols={hourCols} values={weekOrder.map((w) => data.hourly[w])} fmt={rupees} rowTip={(i) => S.weekdays[weekOrder[i]]} />
          </Card>

          <Card
            id="mix" kicker={S.c_mix_k} title={S.c_mix} sub={`${S.c_mix_s} ${mixStory}`} legend={catLegend} text={text}
            table={{
              head: [S.category, S.c_mix_rev, S.c_mix_units, S.c_mix_ml, S.c_mix_alc],
              rows: data.byCategory.map((c) => [catLabels[c.category] ?? c.category, rupees(c.rev), n(c.units), litres(c.ml), litres(c.alc)]),
            }}
          >
            <Stack100
              fmt={(v) => n(v)}
              rows={(['rev', 'units', 'ml', 'alc'] as const).map((k) => ({
                key: k,
                label: k === 'rev' ? S.c_mix_rev : k === 'units' ? S.c_mix_units : k === 'ml' ? S.c_mix_ml : S.c_mix_alc,
                sub: sub(S.c_mix_of, { total: k === 'rev' ? rupees(data.totals.rev) : k === 'units' ? n(data.totals.units) : `${litres(data.totals[k])} ${S.unit_ml}` }),
                fmt: k === 'rev' ? rupees : k === 'units' ? n : litres,
                segs: data.byCategory.map((c) => ({ key: c.category, label: catLabels[c.category] ?? c.category, color: color(c.category), value: c[k] })),
              }))}
            />
          </Card>

          <Card
            id="sizes" kicker={S.c_size_k} title={S.c_size} sub={S.c_size_s} legend={catLegend} text={text}
            table={{ head: [S.size, m === 'rev' ? S.unit_rev : S.unit_units], rows: sizeRows.map((r) => [r.label, sizeFmt(r.value)]) }}
          >
            <HBars items={sizeRows} fmt={sizeFmt} labelFrac={0.18} />
          </Card>

          <Card
            id="brands" kicker={S.c_brand_k} title={S.c_brand} sub={sub(S.c_brand_s, { n: brands.length, total: n(data.brandCount) })}
            legend={catLegend} text={text}
            table={{ head: ['#', S.brand, S.supplier, unitWord], numeric: [0, 3], rows: brands.map((b, i) => [i + 1, b.label, b.sub ?? '', fmt(b.value)]) }}
          >
            <HBars items={brands} fmt={fmt} />
          </Card>

          <Card
            id="suppliers" kicker={S.c_sup_k} title={S.c_sup}
            sub={`${sub(S.c_sup_s, { n: suppliers.length, total: data.suppliers.length })} ${sub(S.c_sup_share, { n: 3, pct: pct(share(3)) })} · ${sub(S.c_sup_share, { n: 5, pct: pct(share(5)) })}`}
            legend={catLegend} text={text}
            table={{ head: ['#', S.supplier, unitWord, S.share], numeric: [0, 2, 3], rows: supSorted.map((s, i) => [i + 1, s.name, fmt(measureOf(s)), pct(measureOf(s) / supTotal, 1)]) }}
          >
            <HBars items={suppliers} fmt={fmt} />
          </Card>

          <Card
            id="map" kicker={S.c_map_k} title={S.c_map}
            sub={data.districtId == null ? sub(S.c_map_s, { what: mapMode === 'perShop' ? S.c_map_perShop : S.c_map_total }) : sub(S.c_map_sd, { district: districtName })}
            text={text}
            table={{
              head: [S.district, unitWord, S.shops, S.perShopDay],
              rows: [...data.districts].sort((a, b) => measureOf(b) - measureOf(a)).map((d) => [names.get(d.id) ?? d.name, fmt(measureOf(d)), d.shops, fmt(d.shopDays ? measureOf(d) / d.shopDays : 0)]),
            }}
            aside={data.districtId == null ? (
              <div className="db-card-foot">
                <div className="db-seg db-seg-sm" role="group">
                  <button type="button" aria-pressed={mapMode === 'total'} onClick={() => setMapMode('total')}>{S.c_map_total}</button>
                  <button type="button" aria-pressed={mapMode === 'perShop'} onClick={() => setMapMode('perShop')}>{S.c_map_perShop}</button>
                </div>
                <SeqKey lo={fmtMap(Math.min(...[...mapValues.values()].filter((v) => v > 0)))} hi={fmtMap(Math.max(...mapValues.values()))} />
              </div>
            ) : null}
          >
            <DistrictMap
              geo={geo} values={mapValues} fmt={fmtMap} names={names} focus={data.districtId}
              points={data.points} onPick={(id) => go(id === data.districtId ? null : id)}
            />
          </Card>

          <Card
            id="rank" kicker={S.c_rank_k} title={data.districtId == null ? S.c_rank : S.c_rank_t}
            sub={data.districtId == null ? (mapMode === 'perShop' ? S.c_map_perShop : unitWord) : (m === 'units' ? S.unit_units : S.unit_rev)}
            text={text}
            table={{ head: ['#', data.districtId == null ? S.district : S.taluk, unitWord], numeric: [0, 2], rows: rankItems.map((r, i) => [i + 1, r.label, (data.districtId == null ? fmtMap : m === 'units' ? n : rupees)(r.value)]) }}
          >
            <div className="db-scroll">
              <HBars items={rankItems} fmt={data.districtId == null ? fmtMap : m === 'units' ? n : rupees} rowH={22} labelFrac={0.34} />
            </div>
          </Card>

          <PerCapitaCards data={pc} S={PC} lang={lang} geo={geo} text={text} onPick={(id) => go(id === data.districtId ? null : id)} focus={data.districtId} />

          <Card
            id="prices" kicker={S.c_price_k} title={S.c_price} sub={S.c_price_s} text={text}
            table={{ head: [S.band, S.unit_units, S.unit_rev], rows: data.prices.map((p) => [priceBands[p.band], n(p.units), rupees(p.rev)]) }}
          >
            <Columns fmt={n} items={data.prices.map((p) => ({ key: String(p.band), label: priceBands[p.band], value: p.units }))} />
          </Card>

          <Card
            id="concentration" kicker={S.c_conc_k} title={S.c_conc} sub={`${S.c_conc_s} ${sub(S.c_conc_note, { top: 10, pct: pct(top10) })}`} text={text}
            table={{ head: [S.shops, S.share], rows: data.lorenz.filter((_, i) => i % 10 === 0).map(([a, b]) => [pct(a), pct(b, 1)]) }}
          >
            <Lorenz points={data.lorenz} eqLabel={S.c_conc_eq} fmtPct={(v) => pct(v)} />
          </Card>

          <Card id="topshops" wide kicker={S.c_top_k} title={S.c_top} text={text} snap={false}>
            <div className="db-table-wrap">
              <table className="db-table">
                <thead>
                  <tr>
                    <th>{S.shop}</th><th>{data.districtId == null ? S.district : S.taluk}</th>
                    <th data-num>{S.unit_rev}</th><th data-num>{S.unit_units}</th><th data-num>{S.perDay}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topShops.map((s) => (
                    <tr key={s.shopNo}>
                      <td><a className="link-ox num" href={`/shops/${s.shopNo}`}>#{s.shopNo}</a> <span className="t-xs dim-2 db-addr">{s.address}</span></td>
                      <td>{data.districtId == null ? s.district : s.taluk}</td>
                      <td data-num>{rupees(s.rev)}</td>
                      <td data-num>{n(s.units)}</td>
                      <td data-num>{rupees(s.days ? s.rev / s.days : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            id="flow" wide kicker={S.c_flow_k} title={S.c_flow} sub={S.c_flow_s} text={text}
            legend={[{ key: 'out', label: S.c_flow_out, color: 'var(--cat-brandy)', shape: 'line' }, { key: 'in', label: S.c_flow_in, color: 'var(--cat-rum)', shape: 'line' }]}
            table={{
              head: [S.day, S.c_flow_out, S.c_flow_in],
              rows: data.daily.map((d) => [fmtDay(d.day), n(Object.values(d.cats).reduce((a, v) => a + v[1], 0)), n(d.received)]),
            }}
          >
            <Lines
              days={days} fmt={n} fmtDay={fmtDay}
              series={[
                { key: 'out', label: S.c_flow_out, color: 'var(--cat-brandy)', values: data.daily.map((d) => Object.values(d.cats).reduce((a, v) => a + v[1], 0)) },
                { key: 'in', label: S.c_flow_in, color: 'var(--cat-rum)', values: data.daily.map((d) => d.received) },
              ]}
            />
          </Card>

          {fest.prominent ? null : festivalCards}

          {posters.length ? (
            <section className="db-card" data-wide id="posters">
              <header className="db-card-head">
                <div>
                  <div className="label br">{S.posters_k}</div>
                  <h2 className="db-h2">{S.posters}</h2>
                  <p className="db-sub">{S.posters_s}</p>
                </div>
              </header>
              <div className="db-posters">
                {posters.map((p) => (
                  <figure key={p.kind} className="db-poster">
                    {p.files[0]?.preview || p.files[0]?.png ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={(p.files.find((f) => f.lang === lang) ?? p.files[0]).preview ?? (p.files.find((f) => f.lang === lang) ?? p.files[0]).png} alt={p.title} loading="lazy" />
                    ) : null}
                    <figcaption>
                      <div className="t-sm med">{p.title}</div>
                      <div className="row g-2 t-xs">
                        {p.files.map((f) => (
                          <span key={f.lang} className="row g-1">
                            <span className="label">{f.lang.toUpperCase()}</span>
                            {f.png ? <a className="link-ox" href={f.png}>PNG</a> : null}
                            {f.pdf ? <a className="link-ox" href={f.pdf}>PDF</a> : null}
                          </span>
                        ))}
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          <section className="db-card db-method" data-wide id="method">
            <div className="label br">{S.c_method_k}</div>
            <h2 className="db-h2">{S.c_method}</h2>
            {S.method.map((para, i) => <p key={i} className="db-sub">{sub(para, { from: longDay(data.from) })}</p>)}
            {data.builtAt ? <p className="t-xs dim-2 mt-2">{sub(S.built, { at: data.builtAt })}</p> : null}
          </section>
        </div>
      </div>
    </TipProvider>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="db-tile">
      <div className="label">{label}</div>
      <div className="db-tile-v">{value}</div>
      {sub ? <div className="t-xs dim-2">{sub}</div> : null}
    </div>
  );
}
