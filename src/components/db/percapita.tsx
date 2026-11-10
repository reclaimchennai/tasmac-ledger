'use client';

import { useMemo, useState } from 'react';
import { Card, TipRow, useTip, useWidth, niceTicks, type CardText, type TableSpec } from './kit';
import { DistrictMap, HBars, SeqKey, type Geo, type HBar } from './charts';
import { compactCount, compactRupees } from '@/lib/format';
import type { PerCapitaStrings } from '@/lib/strings-percapita';

/**
 * Sales per person, three ways.
 *
 * Must be rendered *inside* Dashboard's TipProvider — the charts here use the
 * same tooltip as the rest of the grid.
 *
 * The denominator is local state rather than a URL scope: switching between
 * "everyone" and "drinkers" is a reading aid, not a different view of the data,
 * and all four counts are already on the client.
 */

export interface PerCapitaRowDTO {
  district_id: number;
  name: string;
  pop: number;
  adults: number;
  adult_men: number;
  drinkers: number;
  m6: number;
  w6: number;
  rev: number;
  units: number;
  litres: number;
  alc: number;
  shops: number;
}

export interface PerCapitaDTO {
  days: number;
  rows: PerCapitaRowDTO[];
  state: { pop: number; adults: number; adult_men: number; drinkers: number; rev: number; units: number; litres: number; alc: number };
  popSource: string;
  popMethod: string[];
  nfhsSource: string;
}

type By = 'head' | 'adult' | 'man' | 'drinker';
const BY: By[] = ['head', 'adult', 'man', 'drinker'];
const countOf = (r: PerCapitaRowDTO, by: By) =>
  by === 'head' ? r.pop : by === 'adult' ? r.adults : by === 'man' ? r.adult_men : r.drinkers;

/**
 * Prevalence against spending. Small enough to live here rather than in
 * charts.tsx — nothing else on the dashboard is a scatter, and giving it its
 * own general-purpose component would mean inventing axes it does not need.
 */
function Scatter({
  points, xLabel, yLabel, fmtY, onPick,
}: {
  points: { id: number; name: string; x: number; y: number; r: number }[];
  xLabel: string;
  yLabel: string;
  fmtY: (v: number) => string;
  onPick: (id: number) => void;
}) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const tip = useTip();
  const H = Math.max(280, Math.min(440, Math.round(W * 0.62)));
  // The y title sits above the plot as a plain line rather than rotated down
  // the side: in Tamil it is long enough to run across the tick labels.
  const padL = 62, padB = 34, padT = 26, padR = 12;
  const iw = Math.max(10, W - padL - padR);
  const ih = Math.max(10, H - padT - padB);

  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs) / 5) * 5, x1 = Math.ceil(Math.max(...xs) / 5) * 5;
  const yTicks = niceTicks(Math.max(...ys));
  const y1 = yTicks[yTicks.length - 1] || 1;
  const px = (v: number) => padL + ((v - x0) / (x1 - x0 || 1)) * iw;
  const py = (v: number) => padT + ih - (v / y1) * ih;
  const rmax = Math.max(1, ...points.map((p) => p.r));

  const xTicks: number[] = [];
  for (let v = x0; v <= x1; v += 5) xTicks.push(v);

  const named = useMemo(() => {
    if (points.length < 4) return new Set(points.map((p) => p.id));
    const byY = [...points].sort((a, b) => b.y - a.y);
    const byX = [...points].sort((a, b) => a.x - b.x);
    const midX = byX[Math.floor(byX.length / 2)].x;
    const drinkMost = [...points].filter((p) => p.x >= midX).sort((a, b) => a.y - b.y)[0];
    return new Set([byY[0].id, byX[0].id, byX[byX.length - 1].id, drinkMost.id]);
  }, [points]);

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={H} role="img">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={padL + iw} y1={py(v)} y2={py(v)} stroke="var(--rule)" strokeWidth={1} />
            <text className="db-axis" x={padL - 6} y={py(v) + 4} textAnchor="end" fontSize={11}>{fmtY(v)}</text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} className="db-lab" x={px(v)} y={H - 14} textAnchor="middle" fontSize={11}>{v}%</text>
        ))}
        <text className="db-lab" x={padL + iw / 2} y={H - 1} textAnchor="middle" fontSize={11}>{xLabel}</text>
        <text className="db-axis" x={0} y={10} fontSize={11}>{yLabel}</text>
        {points.map((p) => {
          const r = 3 + 7 * Math.sqrt(p.r / rmax);
          const cx = px(p.x), cy = py(p.y);
          // Label to the right, unless that would run off the plot.
          const flip = cx + r + 60 > padL + iw;
          return (
            <g key={p.id}>
              <circle
                cx={cx} cy={cy} r={r}
                fill="var(--cat-brandy)" fillOpacity={named.has(p.id) ? 0.85 : 0.55}
                stroke="var(--paper)" strokeWidth={1}
                style={{ cursor: 'pointer' }}
                onPointerMove={(e) => tip.show(e, (
                  <>
                    <TipRow label={p.name} value={fmtY(p.y)} strong />
                    <TipRow label={xLabel} value={`${p.x.toFixed(1)}%`} />
                  </>
                ))}
                onPointerLeave={tip.hide}
                onClick={() => onPick(p.id)}
              />
              {named.has(p.id) ? (
                <text
                  className="db-lab"
                  x={flip ? cx - r - 5 : cx + r + 5}
                  y={cy + 4}
                  textAnchor={flip ? 'end' : 'start'}
                  fontSize={11}
                  pointerEvents="none"
                >
                  {p.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function PerCapitaCards({
  data, S, lang, geo, text, onPick, focus,
}: {
  data: PerCapitaDTO;
  S: PerCapitaStrings;
  lang: 'en' | 'ta';
  geo: Geo;
  text: CardText;
  onPick: (id: number) => void;
  focus: number | null;
}) {
  const [by, setBy] = useState<By>('drinker');
  // A window of {days} days read as a year. Dry days stay in the denominator:
  // they are real days on which nothing was sold, not missing readings.
  const year = 365 / data.days;

  const rupeesPer = (r: PerCapitaRowDTO, b: By) => {
    const n = countOf(r, b);
    return n > 0 ? (r.rev / 100) * year / n : 0;
  };
  const alcPerDrinker = (r: PerCapitaRowDTO) => (r.drinkers > 0 ? (r.alc * year) / r.drinkers : 0);

  const names = useMemo(() => new Map(data.rows.map((r) => [r.district_id, r.name])), [data.rows]);
  const values = useMemo(
    () => new Map(data.rows.map((r) => [r.district_id, Math.round(rupeesPer(r, by))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.rows, by, year],
  );

  const rupees = (v: number) => compactRupees(v, lang);
  const perPhrase = { head: S.per_head, adult: S.per_adult, man: S.per_man, drinker: S.per_drinker }[by];
  const definition = { head: S.def_head, adult: S.def_adult, man: S.def_man, drinker: S.def_drinker }[by];

  const sorted = [...data.rows].sort((a, b2) => rupeesPer(b2, by) - rupeesPer(a, by));
  const mapTable: TableSpec = {
    head: [S.col_district, S.col_pop, S.col_drinkPct, S.col_perHead, S.col_perAdult, S.col_perMan, S.col_perDrinker],
    rows: sorted.map((r) => [
      r.name, compactCount(r.pop, lang), `${r.m6.toFixed(1)}%`,
      Math.round(rupeesPer(r, 'head')).toLocaleString('en-IN'),
      Math.round(rupeesPer(r, 'adult')).toLocaleString('en-IN'),
      Math.round(rupeesPer(r, 'man')).toLocaleString('en-IN'),
      Math.round(rupeesPer(r, 'drinker')).toLocaleString('en-IN'),
    ]),
    numeric: [1, 2, 3, 4, 5, 6],
  };

  const alcRows: HBar[] = [...data.rows]
    .sort((a, b2) => alcPerDrinker(b2) - alcPerDrinker(a))
    .map((r) => ({
      key: String(r.district_id),
      label: r.name,
      value: Math.round(alcPerDrinker(r) * 10) / 10,
      segs: [{ key: 'alc', label: r.name, color: 'var(--cat-brandy)', value: Math.round(alcPerDrinker(r) * 10) / 10 }],
    }));

  const scatter = data.rows.map((r) => ({
    id: r.district_id, name: r.name, x: r.m6, y: rupeesPer(r, 'adult'), r: r.rev,
  }));

  const picker = (
    <div className="db-seg" role="group" aria-label={S.by}>
      {BY.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={by === k}
          onClick={() => setBy(k)}
        >
          {{ head: S.by_head, adult: S.by_adult, man: S.by_man, drinker: S.by_drinker }[k]}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Card
        id="pc-map"
        kicker={S.map_k}
        title={S.map_t.replace('{per}', perPhrase)}
        sub={`${definition} ${S.map_s.replace('{days}', String(data.days))}`}
        text={text}
        table={mapTable}
        aside={picker}
        wide
      >
        <DistrictMap
          geo={geo}
          values={values}
          fmt={(v) => `₹${Math.round(v).toLocaleString('en-IN')}`}
          names={names}
          focus={focus}
          points={[]}
          onPick={onPick}
        />
        <SeqKey lo={S.map_lo} hi={S.map_hi} />
      </Card>

      <Card
        id="pc-alc"
        kicker={S.rank_k}
        title={S.rank_t}
        sub={S.rank_s}
        text={text}
        table={{
          head: [S.col_district, S.col_drinkers, S.col_drinkPct, S.col_alc],
          rows: alcRows.map((b) => {
            const r = data.rows.find((x) => String(x.district_id) === b.key)!;
            return [r.name, compactCount(r.drinkers, lang), `${r.m6.toFixed(1)}%`, b.value.toFixed(1)];
          }),
          numeric: [1, 2, 3],
        }}
      >
        <div className="db-scroll">
          <HBars items={alcRows} fmt={(v) => v.toFixed(1)} rowH={24} />
        </div>
      </Card>

      <Card
        id="pc-scatter"
        kicker={S.scat_k}
        title={S.scat_t}
        sub={S.scat_s}
        text={text}
        table={{
          head: [S.col_district, S.col_drinkPct, S.col_perAdult],
          rows: [...scatter].sort((a, b2) => b2.y - a.y)
            .map((p) => [p.name, `${p.x.toFixed(1)}%`, Math.round(p.y).toLocaleString('en-IN')]),
          numeric: [1, 2],
        }}
      >
        <Scatter
          points={scatter}
          xLabel={S.scat_x}
          yLabel={S.scat_y}
          fmtY={rupees}
          onPick={onPick}
        />
      </Card>

      <Card id="pc-caveat" kicker={S.kicker} title={S.caveat_h} text={text} snap={false}>
        <div>
          <p className="db-sub">{S.caveat_1}</p>
          <p className="db-sub">{S.caveat_2}</p>
          <p className="db-sub">{S.caveat_3.replace('{days}', String(data.days))}</p>
          <p className="db-sub t-xs dim-2" style={{ marginTop: 12 }}>{S.src_pop}: {data.popSource}</p>
          <p className="db-sub t-xs dim-2">{S.src_nfhs}: {data.nfhsSource}</p>
        </div>
      </Card>
    </>
  );
}
