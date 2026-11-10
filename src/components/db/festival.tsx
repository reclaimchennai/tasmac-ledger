'use client';

import { useMemo, useState } from 'react';
import { Card, TipRow, barPath, niceTicks, useTip, useWidth, type CardText, type LegendItem } from './kit';
import { Columns, DistrictMap, FSEQ, SeqKey, type Geo } from './charts';
import { CATEGORY_COLOR, compactRupees } from '@/lib/format';
import type { FestivalStrings } from '@/lib/strings-festival';
import type { DbStrings } from '@/lib/strings-db';

/**
 * The festival tracker: a festival's days against ordinary days of the same
 * weekday (see src/lib/festival.ts for what "ordinary" means).
 *
 * Colour: the festival is crimson (--fest) and the ordinary day it is measured
 * against is ink — neither is a category hue, so they never read as "brandy" or
 * "rum". Category colours appear only on the one chart that is split by
 * category. Must render inside Dashboard's TipProvider.
 */

type Fmt = (v: number) => string;
const AX = { fontSize: 11 } as const;

export interface FestDayDTO {
  day: string; offset: number; future: boolean; partial: boolean;
  rev: number; units: number; ml: number; alc: number;
  base: { rev: number; units: number; ml: number; alc: number };
  cats: Record<string, number>; baseCats: Record<string, number>;
}
export interface HistoryReportDTO {
  dates: string[]; total: number; perDay?: Record<string, number>; regions?: Record<string, number>;
  source: string; headline?: string; published?: string; url?: string; note?: string;
}
export interface FestivalDTO {
  featured: null | {
    def: { id: string; name: { en: string; ta: string }; day: string; from: number; to: number; counted?: number[] };
    status: 'upcoming' | 'live' | 'done';
    today: string;
    days: FestDayDTO[];
    baseCount: number[];
    hourCols: number[];
    hours: Record<string, { values: number[]; base: number[]; lastCol: number }>;
    districts: { id: number; name: string; rev: number; base: number }[];
    regions: { name: string; rev: number; base: number }[];
    closedDays: string[];
  };
  prominent: boolean;
  past: { id: string; name: { en: string; ta: string }; day: string; rev: number; base: number; peakDay: string; peakRev: number; peakBase: number }[];
  history: Record<string, { year: number; day: string; perDay?: Record<string, number>; reports: HistoryReportDTO[] }[]>;
}

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`;

export function FestivalCards({
  data, F, S, lang, geo, text, catLabels, onPick, focus,
}: {
  data: FestivalDTO;
  F: FestivalStrings;
  S: DbStrings;
  lang: 'en' | 'ta';
  geo: Geo;
  text: CardText;
  catLabels: Record<string, string>;
  onPick: (id: number) => void;
  focus: number | null;
}) {
  const f = data.featured;
  const sub = (s: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), s);
  const rupees = (paise: number) => '₹' + compactRupees(paise / 100, lang);
  // Counts spelled out: an "L" beside litres of alcohol would read as litres, not lakh.
  const big = (v: number) => {
    const w = lang === 'ta' ? [' கோடி', ' லட்சம்'] : [' crore', ' lakh'];
    const t = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(1)).replace(/\.0$/, '');
    return Math.abs(v) >= 1e7 ? t(v / 1e7) + w[0] : Math.abs(v) >= 1e5 ? t(v / 1e5) + w[1] : Math.round(v).toLocaleString('en-IN');
  };
  const fmtDay = (day: string) => {
    const d = new Date(day + 'T00:00:00Z');
    return `${d.getUTCDate()} ${S.monthsShort[d.getUTCMonth()]}`;
  };
  const wd = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay();

  const defaultDay = useMemo(() => {
    if (!f) return '';
    const live = f.days.find((x) => x.partial);
    if (live) return live.day;
    const fest = f.days.find((x) => x.offset === 0 && !x.future);
    return fest?.day ?? [...f.days].reverse().find((x) => !x.future)?.day ?? f.days[0].day;
  }, [f]);
  const [hourDay, setHourDay] = useState(defaultDay);

  if (!f) return null;
  const name = f.def.name[lang];
  const year = f.def.day.slice(0, 4);
  const offLabel = (o: number) =>
    o === 0 ? sub(F.off_0, { name }) : o === -1 ? F.off_m1 : o === 1 ? F.off_p1 : o < 0 ? sub(F.off_mN, { n: -o }) : sub(F.off_pN, { n: o });
  const status = f.status === 'live' ? F.live : f.status === 'done' ? F.done : F.upcoming;
  const traded = f.days.filter((x) => !x.future);
  const sum = (k: 'rev' | 'units' | 'alc', rows = traded) => rows.reduce((a, x) => a + x[k], 0);
  const sumBase = (k: 'rev' | 'units', rows = traded) =>
    rows.reduce((a, x) => {
      // A day still trading is held against the same hours of an ordinary day, not a whole one.
      if (!x.partial) return a + x.base[k];
      const h = f.hours[x.day];
      const all = h.base.reduce((s, v) => s + v, 0) || 1;
      const upTo = h.base.slice(0, h.lastCol + 1).reduce((s, v) => s + v, 0);
      return a + x.base[k] * (upTo / all);
    }, 0);
  const rev = sum('rev'), baseRev = sumBase('rev');
  const units = sum('units'), baseUnits = sumBase('units');

  const counted = f.def.counted
    ? f.days.filter((x) => x.offset >= (f.def.counted as number[])[0] && x.offset <= (f.def.counted as number[])[1])
    : null;
  const spanLabel = counted ? `${fmtDay(counted[0].day)}–${fmtDay(counted[counted.length - 1].day)}` : '';
  const countedDone = counted ? counted.every((x) => !x.future && !x.partial) : false;
  const oursCounted = counted?.filter((x) => !x.future) ?? [];

  const title =
    f.status === 'upcoming'
      ? sub(F.days_t_up, { name, year, n: Math.max(1, Math.round((Date.parse(f.def.day) - Date.parse(f.today)) / 86_400_000)) })
      : sub(f.status === 'live' ? F.days_t_live : F.days_t_done, { name, year });

  // ── day columns ──────────────────────────────────────────────────
  const dayItems = f.days.map((x) => ({
    key: x.day,
    label: offLabel(x.offset),
    date: fmtDay(x.day),
    value: x.rev,
    base: x.base.rev,
    partial: x.partial,
    future: x.future,
    lift: x.base.rev && !x.future && !x.partial ? x.rev / x.base.rev - 1 : null,
    weekday: S.weekdays[wd(x.day)],
  }));

  // ── hours ────────────────────────────────────────────────────────
  const activeDay = f.hours[hourDay] && f.days.some((x) => x.day === hourDay && !x.future) ? hourDay : defaultDay;
  const hd = f.hours[activeDay];
  const hdDay = f.days.find((x) => x.day === activeDay) ?? f.days[0];
  const hourLabel = (h: number) => (h === 0 ? F.hours_close : `${String(h).padStart(2, '0')}:00`);
  const cum = (v: number[]) => { let s = 0; return v.map((x) => (s += x)); };
  const hv = hd ? cum(hd.values) : [];
  const hb = hd ? cum(hd.base) : [];
  const liveLine = hd && hdDay.partial && hd.lastCol >= 0
    ? sub(F.hours_live, {
        hour: hourLabel(f.hourCols[hd.lastCol]),
        v: rupees(hv[hd.lastCol]),
        pct: hb[hd.lastCol] ? signed(hv[hd.lastCol] / hb[hd.lastCol] - 1) : '–',
        weekday: S.weekdays[wd(hdDay.day)],
      })
    : '';

  // ── whole-day cuts, over closed days ─────────────────────────────
  const closed = f.days.filter((x) => f.closedDays.includes(x.day));
  const closedSpan = closed.length ? (closed.length === 1 ? fmtDay(closed[0].day) : `${fmtDay(closed[0].day)}–${fmtDay(closed[closed.length - 1].day)}`) : '';
  const catRows = (() => {
    const tot: Record<string, [number, number]> = {};
    for (const x of closed) {
      for (const [c, v] of Object.entries(x.cats)) (tot[c] ??= [0, 0])[0] += v;
      for (const [c, v] of Object.entries(x.baseCats)) (tot[c] ??= [0, 0])[1] += v;
    }
    const all = Object.values(tot).reduce((a, [, b]) => a + b, 0) || 1;
    return Object.entries(tot)
      .filter(([, [, b]]) => b / all >= 0.003)
      .map(([c, [a, b]]) => ({ key: c, label: catLabels[c] ?? c, value: b ? a / b - 1 : 0, color: CATEGORY_COLOR[c] ?? CATEGORY_COLOR.OTHER, a, b }))
      .sort((p, q) => q.value - p.value);
  })();

  // The map takes the ratio to an ordinary day (always positive), labelled as the change.
  const distLift = new Map(f.districts.map((x) => [x.id, x.base ? x.rev / x.base : 0]));
  const distNames = new Map(f.districts.map((x) => [x.id, x.name]));
  const distSorted = [...f.districts].sort((a, b) => (b.rev / b.base) - (a.rev / a.base));
  const tb = (rows: typeof distSorted) => rows.map((x) => `${x.name} ${signed(x.rev / x.base - 1)}`).join(', ');

  // ── history ──────────────────────────────────────────────────────
  // Years compare on the eve and the day itself: every year since 2019 has both
  // as TASMAC's own per-day figures, whatever span each release quoted.
  const hist = (data.history[f.def.id] ?? []).filter((y) => y.reports.length).sort((a, b) => a.year - b.year);
  const latestRegions = [...hist].reverse().find((y) => y.reports.some((r) => r.regions && Object.keys(r.regions).length >= 5));
  const official = latestRegions?.reports.find((r) => r.regions && Object.keys(r.regions).length >= 5);
  const prevDay = (day: string) => new Date(Date.parse(day + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10);
  const crore = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${F.crore}`;
  const histItems = hist.flatMap((y) => {
    const eve = y.perDay?.[prevDay(y.day)], day = y.perDay?.[y.day];
    if (eve == null || day == null) return [];
    const avg = (eve + day) / 2;
    return [{
      key: String(y.year), label: String(y.year), sub: S.weekdaysShort[wd(y.day)], value: avg * 1e9,
      tip: (
        <>
          <div className="db-tip-h">{y.year} · {S.weekdays[wd(y.day)]} {fmtDay(y.day)}</div>
          <TipRow label={F.off_m1} value={crore(eve)} />
          <TipRow label={sub(F.off_0, { name })} value={crore(day)} />
          <TipRow label={F.col_perDay} value={crore(Math.round(avg * 100) / 100)} strong />
        </>
      ),
    }];
  });
  const evePair = f.days.filter((x) => x.offset === -1 || x.offset === 0);
  const oursPair = evePair.filter((x) => !x.future);
  const pairDone = evePair.length === 2 && evePair.every((x) => !x.future && !x.partial);
  if (histItems.length && oursPair.length) {
    const tot = oursPair.reduce((a, x) => a + x.rev, 0);
    histItems.push({
      key: 'ours', label: `${year}*`, sub: S.weekdaysShort[wd(f.def.day)], value: pairDone ? tot / 2 : tot / oursPair.length,
      tip: (
        <>
          <div className="db-tip-h">{year} · {F.hist_ours}</div>
          {oursPair.map((x) => <TipRow key={x.day} label={offLabel(x.offset)} value={`${rupees(x.rev)}${x.partial ? ` (${F.so_far})` : ''}`} />)}
          <TipRow label={F.col_perDay} value={rupees(tot / (pairDone ? 2 : oursPair.length))} strong />
        </>
      ),
    });
  }

  const legendDays: LegendItem[] = [
    { key: 'f', label: F.festival_day, color: 'var(--fest)' },
    { key: 'o', label: F.ordinary_day, color: 'var(--ink)', shape: 'line' },
  ];

  return (
    <>
      <Card
        id="fest-days" wide kicker={`${F.kicker} · ${status}`} title={title}
        sub={f.status === 'upcoming' ? F.days_s_up : F.days_s}
        legend={legendDays} text={text}
        table={{
          head: [F.col_day, F.col_sales, F.col_ordinary, F.col_change],
          rows: dayItems.map((x) => [
            `${x.label} · ${x.weekday.slice(0, 3)} ${x.date}${x.partial ? ` (${F.so_far})` : x.future ? ` (${F.to_come})` : ''}`,
            x.future ? '–' : rupees(x.value), rupees(x.base), x.lift == null ? '–' : signed(x.lift),
          ]),
        }}
        aside={traded.length ? (
          <div className="db-eves-wrap">
            <div className="db-eves">
              <Stat label={F.st_total} value={rupees(rev)} sub={sub(F.st_totalSub, { n: traded.length, of: f.days.length })} />
              <Stat label={F.st_extra} value={rupees(Math.max(0, rev - baseRev))} sub={sub(F.st_extraSub, { pct: baseRev ? signed(rev / baseRev - 1) : '–' })} />
              <Stat label={F.st_bottles} value={big(units)} sub={sub(F.st_bottlesSub, { extra: big(Math.max(0, units - baseUnits)) })} />
              <Stat label={F.st_alc} value={big(sum('alc') / 1000)} sub={F.st_alcSub} />
            </div>
            {counted && oursCounted.length ? (
              <p className="db-sub mt-2">
                {sub(countedDone ? F.counted_done : F.counted, { span: spanLabel, total: rupees(oursCounted.reduce((a, x) => a + x.rev, 0)) })} {F.floor}
              </p>
            ) : null}
          </div>
        ) : null}
      >
        <FestDays items={dayItems} fmt={rupees} F={F} />
      </Card>

      {traded.length && hd ? (
        <Card
          id="fest-hours" kicker={F.hours_k} title={F.hours_t}
          sub={`${sub(F.hours_s, { weekday: S.weekdays[wd(hdDay.day)] })}${liveLine ? ' ' + liveLine : ''}`}
          legend={[
            { key: 'f', label: `${offLabel(hdDay.offset)} · ${fmtDay(hdDay.day)}`, color: 'var(--fest)', shape: 'line' },
            { key: 'o', label: sub(F.ordinary, { weekday: S.weekdays[wd(hdDay.day)] }), color: 'var(--ink-3)', shape: 'line' },
          ]}
          text={text}
          table={{
            head: [F.hour, offLabel(hdDay.offset), sub(F.ordinary, { weekday: S.weekdaysShort[wd(hdDay.day)] })],
            rows: f.hourCols.map((h, k) => [hourLabel(h), k <= hd.lastCol ? rupees(hv[k]) : '–', rupees(hb[k])]),
          }}
        >
          <div className="db-seg db-seg-sm mb-2" role="group">
            {traded.map((x) => (
              <button key={x.day} type="button" aria-pressed={x.day === activeDay} onClick={() => setHourDay(x.day)}>
                {offLabel(x.offset)}
              </button>
            ))}
          </div>
          <HourCurve
            labels={f.hourCols.map(hourLabel)} values={hv} base={hb} lastCol={hd.lastCol} fmt={rupees}
            names={[offLabel(hdDay.offset), sub(F.ordinary, { weekday: S.weekdays[wd(hdDay.day)] })]}
          />
        </Card>
      ) : null}

      {catRows.length ? (
        <Card
          id="fest-cats" kicker={F.cats_k} title={F.cats_t} sub={sub(F.cats_s, { days: closedSpan })} text={text}
          table={{ head: [F.col_category, F.col_sales, F.col_ordinary, F.col_change], rows: catRows.map((r) => [r.label, rupees(r.a), rupees(r.b), signed(r.value)]) }}
        >
          <LiftBars rows={catRows} />
        </Card>
      ) : null}

      {f.districts.length ? (
        <Card
          id="fest-map" kicker={F.dist_k} title={F.dist_t}
          sub={sub(F.dist_s, { days: closedSpan, top: tb(distSorted.slice(0, 3)), bottom: tb(distSorted.slice(-3).reverse()) })}
          text={text}
          table={{
            head: [F.col_district, F.col_sales, F.col_ordinary, F.col_change],
            rows: distSorted.map((x) => [x.name, rupees(x.rev), rupees(x.base), signed(x.rev / x.base - 1)]),
          }}
          aside={<SeqKey ramp={FSEQ} lo={signed(Math.min(...distLift.values()) - 1)} hi={signed(Math.max(...distLift.values()) - 1)} />}
        >
          <DistrictMap geo={geo} values={distLift} fmt={(r) => signed(r - 1)} names={distNames} focus={focus} points={[]} onPick={onPick} ramp={FSEQ} />
        </Card>
      ) : null}

      {f.regions.length ? (
        <Card
          id="fest-regions" kicker={F.reg_k} title={F.reg_t}
          sub={official ? sub(F.reg_s, { year: latestRegions?.year ?? '' }) : F.reg_noOfficial}
          legend={official ? [
            { key: 'a', label: sub(F.reg_ours, { year }), color: 'var(--fest)' },
            { key: 'b', label: sub(F.reg_official, { year: latestRegions?.year ?? '' }), color: 'var(--ink-3)' },
          ] : undefined}
          text={text}
          table={{
            head: [F.col_region, F.col_sales, F.col_share, ...(official ? [sub(F.reg_official, { year: latestRegions?.year ?? '' }), F.col_share] : []), F.col_change],
            rows: (() => {
              const tot = f.regions.reduce((a, r) => a + r.rev, 0) || 1;
              const otot = official?.regions ? Object.values(official.regions).reduce((a, v) => a + v, 0) : 1;
              return f.regions.map((r) => [
                F.regions[r.name] ?? r.name, rupees(r.rev), `${((r.rev / tot) * 100).toFixed(1)}%`,
                ...(official?.regions ? [`₹${official.regions[r.name]?.toLocaleString('en-IN') ?? '–'} ${F.crore}`, official.regions[r.name] ? `${((official.regions[r.name] / otot) * 100).toFixed(1)}%` : '–'] : []),
                r.base ? signed(r.rev / r.base - 1) : '–',
              ]);
            })(),
          }}
        >
          <PairBars
            rows={(() => {
              const tot = f.regions.reduce((a, r) => a + r.rev, 0) || 1;
              const otot = official?.regions ? Object.values(official.regions).reduce((a, v) => a + v, 0) : 0;
              return f.regions.map((r) => ({
                key: r.name, label: F.regions[r.name] ?? r.name, a: r.rev / tot,
                b: official?.regions && otot ? (official.regions[r.name] ?? 0) / otot : null,
              }));
            })()}
          />
        </Card>
      ) : null}

      {histItems.length ? (
        <Card
          id="fest-history" wide kicker={F.hist_k} title={F.hist_t} sub={F.hist_s} text={text}
          table={{
            head: [F.col_year, F.col_festDay, F.off_m1, sub(F.off_0, { name }), F.col_quoted, F.col_source],
            numeric: [2, 3],
            rows: hist.map((y) => {
              const r = y.reports[y.reports.length - 1];
              const eve = y.perDay?.[prevDay(y.day)], day = y.perDay?.[y.day];
              return [
                y.year, `${S.weekdaysShort[wd(y.day)]} ${fmtDay(y.day)}`,
                eve != null ? crore(eve) : '–', day != null ? crore(day) : '–',
                `${crore(r.total)} (${r.dates.map(fmtDay).join(', ')})`,
                `${r.source}${r.published ? `, ${r.published}` : ''}`,
              ];
            }),
          }}
          aside={
            <details className="db-sources mt-2">
              <summary className="label">{F.hist_sources}</summary>
              <ul className="t-xs dim-2">
                {hist.flatMap((y) => y.reports.map((r, i) => (
                  <li key={`${y.year}-${i}`}>
                    {y.year}: ₹{r.total.toLocaleString('en-IN')} {F.crore} ({r.dates.map(fmtDay).join(', ')}) —{' '}
                    {r.url ? <a className="link-ox" href={r.url} rel="noopener noreferrer" target="_blank">{r.headline ?? r.source}</a> : (r.headline ?? '')}{' '}
                    {r.source}{r.published ? `, ${r.published}` : ''}{r.note ? `. ${r.note}` : ''}
                  </li>
                )))}
              </ul>
            </details>
          }
        >
          <ColumnsCr items={histItems} crore={F.crore} />
        </Card>
      ) : null}

      {data.past.length ? (
        <Card
          id="fest-past" kicker={F.past_k} title={F.past_t} sub={F.past_s} text={text}
          table={{
            head: [F.col_festDay, F.col_sales, F.col_ordinary, F.col_change],
            rows: data.past.map((p) => [`${p.name[lang]} · ${fmtDay(p.peakDay)}`, rupees(p.peakRev), rupees(p.peakBase), p.peakBase ? signed(p.peakRev / p.peakBase - 1) : '–']),
          }}
        >
          <LiftBars
            rows={data.past.map((p) => ({
              key: p.id, label: p.name[lang], value: p.peakBase ? p.peakRev / p.peakBase - 1 : 0, color: 'var(--fest)',
            }))}
          />
        </Card>
      ) : null}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="db-eve">
      <div className="label">{label}</div>
      <div className="db-eve-v">{value}</div>
      {sub ? <div className="t-sm dim-2">{sub}</div> : null}
    </div>
  );
}

/** Rupee crore per day: the history columns arrive as paise so the shared Columns can draw them. */
function ColumnsCr({ items, crore }: { items: Parameters<typeof Columns>[0]['items']; crore: string }) {
  return <Columns items={items.map((c) => ({ ...c, muted: c.key === 'ours' }))} fmt={(v) => `₹${Math.round(v / 1e9)} ${crore}`} color="var(--fest)" height={230} />;
}

// ── a festival's days: column = the day, rule across it = an ordinary day ──
function FestDays({
  items, fmt, F,
}: {
  items: { key: string; label: string; date: string; value: number; base: number; partial: boolean; future: boolean; lift: number | null; weekday: string }[];
  fmt: Fmt;
  F: FestivalStrings;
}) {
  const [ref, W] = useWidth<HTMLDivElement>(640);
  const tip = useTip();
  const height = 290, top = 24, bottom = 58, left = 8, right = 8;
  const ih = height - top - bottom;
  const band = Math.max(10, W - left - right) / Math.max(1, items.length);
  const bw = Math.min(56, band * 0.56);
  const max = Math.max(1, ...items.map((x) => Math.max(x.value, x.base)));
  const y = (v: number) => top + ih - (v / max) * ih;

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        <line className="db-base" x1={left} x2={W - right} y1={top + ih} y2={top + ih} />
        {items.map((x, i) => {
          const cx = left + band * i + band / 2;
          const h = (x.value / max) * ih;
          return (
            <g
              key={x.key}
              onPointerMove={(e) => tip.show(e, (
                <>
                  <div className="db-tip-h">{x.label} · {x.weekday} {x.date}</div>
                  {x.future ? <div className="t-xs dim-2">{F.to_come}</div> : <TipRow color="var(--fest)" label={x.partial ? F.so_far : F.festival_day} value={fmt(x.value)} strong />}
                  <TipRow color="var(--ink)" label={F.ordinary.replace('{weekday}', x.weekday)} value={fmt(x.base)} />
                  {x.lift != null ? <TipRow label="Δ" value={signed(x.lift)} /> : null}
                </>
              ))}
              onPointerLeave={tip.hide}
            >
              <rect x={cx - band / 2} y={0} width={band} height={height} fill="transparent" />
              {x.future ? (
                <rect x={cx - bw / 2} y={y(x.base)} width={bw} height={(x.base / max) * ih} className="db-fest-future" />
              ) : (
                <path d={barPath(cx - bw / 2, y(x.value), bw, h, 'up')} fill="var(--fest)" opacity={x.partial ? 0.5 : 1} />
              )}
              <line x1={cx - bw / 2 - 6} x2={cx + bw / 2 + 6} y1={y(x.base)} y2={y(x.base)} className="db-fest-base" />
              {!x.future ? (
                <text className="db-val" x={cx} y={Math.min(y(x.value), y(x.base)) - 7} textAnchor="middle" {...AX}>{fmt(x.value)}</text>
              ) : null}
              <text className="db-axis" x={cx} y={top + ih + 16} textAnchor="middle" {...AX}>{x.label}</text>
              <text className="db-axis" x={cx} y={top + ih + 30} textAnchor="middle" fontSize={10}>{x.weekday.slice(0, 3)} {x.date}</text>
              <text className="db-val" x={cx} y={top + ih + 46} textAnchor="middle" fontSize={11} fontWeight={600}>
                {x.lift != null ? signed(x.lift) : x.partial ? F.so_far : F.to_come}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── running total through the day, against an ordinary day ──────────
function HourCurve({
  labels, values, base, lastCol, fmt, names,
}: { labels: string[]; values: number[]; base: number[]; lastCol: number; fmt: Fmt; names: [string, string] }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const height = 260, top = 12, bottom = 26, left = 54, right = 10;
  const iw = Math.max(10, W - left - right), ih = height - top - bottom;
  const n = labels.length;
  const ticks = niceTicks(Math.max(1, ...values.slice(0, lastCol + 1), ...base));
  const yMax = ticks[ticks.length - 1];
  const x = (i: number) => left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => top + ih - (v / yMax) * ih;
  const path = (v: number[], upto: number) => v.slice(0, upto + 1).map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p)}`).join('');
  const every = Math.max(1, Math.ceil(44 / Math.max(1, iw / Math.max(1, n - 1))));

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line className="db-gl" x1={left} x2={W - right} y1={y(t)} y2={y(t)} />
            <text className="db-axis" x={left - 6} y={y(t) + 4} textAnchor="end" {...AX}>{fmt(t)}</text>
          </g>
        ))}
        <path d={path(base, n - 1)} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
        {lastCol >= 0 ? <path d={path(values, lastCol)} fill="none" stroke="var(--fest)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {lastCol >= 0 ? <circle cx={x(lastCol)} cy={y(values[lastCol])} r={4} fill="var(--fest)" className="db-ring" /> : null}
        {labels.map((l, i) => ((i % every === 0 && i <= n - 1 - Math.max(2, every)) || i === n - 1 ? (
          <text key={i} className="db-axis" x={x(i)} y={height - 8} textAnchor={i === n - 1 ? 'end' : 'middle'} {...AX}>{l}</text>
        ) : null))}
        <line className="db-base" x1={left} x2={W - right} y1={top + ih} y2={top + ih} />
        {hover != null ? <line className="db-cross" x1={x(hover)} x2={x(hover)} y1={top} y2={top + ih} /> : null}
        <rect
          x={left} y={top} width={iw} height={ih} fill="transparent"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
            setHover(i);
            tip.show(e, (
              <>
                <div className="db-tip-h">{labels[i]}</div>
                {i <= lastCol ? <TipRow color="var(--fest)" label={names[0]} value={fmt(values[i])} strong /> : null}
                <TipRow color="var(--ink-3)" label={names[1]} value={fmt(base[i])} />
                {i <= lastCol && base[i] ? <TipRow label="Δ" value={signed(values[i] / base[i] - 1)} /> : null}
              </>
            ));
          }}
          onPointerLeave={() => { setHover(null); tip.hide(); }}
        />
      </svg>
    </div>
  );
}

// ── change from zero, either way ────────────────────────────────────
function LiftBars({ rows }: { rows: { key: string; label: string; value: number; color: string }[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(520);
  const tip = useTip();
  const rowH = 26, bh = 14, valW = 52;
  const labelW = Math.round(Math.min(220, Math.max(110, W * 0.36)));
  const lo = Math.min(0, ...rows.map((r) => r.value));
  const hi = Math.max(0.01, ...rows.map((r) => r.value));
  const iw = Math.max(10, W - labelW - valW * (lo < 0 ? 2 : 1));
  const x0 = labelW + (lo < 0 ? valW : 0) + (-lo / (hi - lo)) * iw;
  const sx = (v: number) => (v / (hi - lo)) * iw;
  const height = rows.length * rowH + 4;
  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        <line className="db-base" x1={x0} x2={x0} y1={0} y2={height} />
        {rows.map((r, i) => {
          const y0 = i * rowH + 2, w = Math.abs(sx(r.value));
          const neg = r.value < 0;
          return (
            <g key={r.key} onPointerMove={(e) => tip.show(e, <TipRow color={r.color} label={r.label} value={signed(r.value)} strong />)} onPointerLeave={tip.hide}>
              <rect x={0} y={y0} width={W} height={rowH} fill="transparent" />
              <text className="db-lab" x={0} y={y0 + rowH / 2 + 4} fontSize={12}>{r.label}</text>
              <path
                d={neg
                  ? `M${x0},${y0 + (rowH - bh) / 2}H${x0 - w + Math.min(4, w)}Q${x0 - w},${y0 + (rowH - bh) / 2} ${x0 - w},${y0 + (rowH - bh) / 2 + Math.min(4, w)}V${y0 + (rowH + bh) / 2 - Math.min(4, w)}Q${x0 - w},${y0 + (rowH + bh) / 2} ${x0 - w + Math.min(4, w)},${y0 + (rowH + bh) / 2}H${x0}Z`
                  : barPath(x0, y0 + (rowH - bh) / 2, w, bh, 'right')}
                fill={r.color}
              />
              <text className="db-val" x={neg ? x0 - w - 6 : x0 + w + 6} y={y0 + rowH / 2 + 4} textAnchor={neg ? 'end' : 'start'} fontSize={11}>{signed(r.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── two shares side by side: this feed, and TASMAC's own ──────────────
function PairBars({ rows }: { rows: { key: string; label: string; a: number; b: number | null }[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(520);
  const rowH = 40, bh = 12, valW = 52;
  const labelW = Math.round(Math.min(160, Math.max(96, W * 0.28)));
  const iw = Math.max(10, W - labelW - valW);
  const max = Math.max(0.01, ...rows.flatMap((r) => [r.a, r.b ?? 0]));
  const height = rows.length * rowH + 4;
  const pc = (v: number) => `${(v * 100).toFixed(1)}%`;
  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        {rows.map((r, i) => {
          const y0 = i * rowH + 4;
          const bars: [number, string, number][] = [[r.a, 'var(--fest)', 0]];
          if (r.b != null) bars.push([r.b, 'var(--ink-3)', bh + 4]);
          const mid = r.b != null ? y0 + bh + 2 : y0 + bh / 2;
          return (
            <g key={r.key}>
              <text className="db-lab" x={0} y={mid + 4} fontSize={12}>{r.label}</text>
              {bars.map(([v, c, dy]) => (
                <g key={c}>
                  <path d={barPath(labelW, y0 + dy, (v / max) * iw, bh, 'right')} fill={c} />
                  <text className="db-val" x={labelW + (v / max) * iw + 6} y={y0 + dy + bh - 2} fontSize={11}>{pc(v)}</text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
