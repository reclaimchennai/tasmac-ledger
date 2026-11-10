'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { TipRow, barPath, niceTicks, useTip, useWidth } from './kit';

/**
 * The dashboard's charts, drawn as SVG at the container's real width.
 *
 * Shared conventions (the dataviz rules this site follows): one y-axis, never
 * two; hairline solid gridlines; bars capped at 24px with a 4px rounded data
 * end; a 2px surface gap between touching fills; text in ink tokens, never in a
 * series colour; every mark answers hover with a tooltip, and every chart has a
 * table view in its card.
 */

type Fmt = (v: number) => string;

let measureCtx: CanvasRenderingContext2D | null = null;
/**
 * Shorten a label to fit a width, measured with the page's own font. On the
 * server there is no canvas, so a conservative per-character estimate stands
 * in — on the client's first render too, so hydration matches — and the real
 * measure takes over once mounted.
 */
function fitText(s: string, max: number, size: number, measured: boolean): string {
  if (!measured || typeof document === 'undefined') {
    const cap = Math.floor(max / (size * 0.62));
    return s.length > cap ? s.slice(0, cap - 1) + '…' : s;
  }
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return s;
  measureCtx.font = `${size}px ${getComputedStyle(document.body).fontFamily}`;
  if (measureCtx.measureText(s).width <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measureCtx.measureText(s.slice(0, mid) + '…').width <= max) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo).trimEnd() + '…';
}

const AXIS = { fontSize: 11 } as const;
const AX_W = 54; // y-axis label column

// ── stacked area: a day series split by category ────────────────

export interface Series { key: string; label: string; color: string; values: number[] }

export function StackedArea({
  days, series, fmt, fmtDay, marks, height = 300, totalLabel,
}: {
  days: string[];
  series: Series[];
  fmt: Fmt;
  fmtDay: (day: string) => string;
  /** Labelled days (dry days): index → label. */
  marks?: Map<number, string>;
  height?: number;
  totalLabel: string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  const top = 18, bottom = 26, left = AX_W, right = 8;
  const iw = Math.max(10, W - left - right), ih = height - top - bottom;

  const { stacks, max } = useMemo(() => {
    const base = new Array(n).fill(0);
    const stacks = series.map((s) => {
      const lo = [...base];
      s.values.forEach((v, i) => { base[i] += v; });
      return { s, lo, hi: [...base] };
    });
    return { stacks, max: Math.max(1, ...base) };
  }, [series, n]);

  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1];
  const x = (i: number) => left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => top + ih - (v / yMax) * ih;

  const area = (lo: number[], hi: number[]) => {
    let d = `M${x(0)},${y(hi[0])}`;
    for (let i = 1; i < n; i++) d += `L${x(i)},${y(hi[i])}`;
    for (let i = n - 1; i >= 0; i--) d += `L${x(i)},${y(lo[i])}`;
    return d + 'Z';
  };

  // Weekly date ticks, on Sundays — the week's peak, so the eye finds the rhythm.
  // Sunday ticks, thinned so labels keep ~56px apart on a phone.
  const sundays = days.map((d, i) => [d, i] as const).filter(([d]) => new Date(d + 'T00:00:00Z').getUTCDay() === 0);
  const every = Math.max(1, Math.ceil(56 / Math.max(1, (iw / Math.max(1, n - 1)) * 7)));
  const xt = sundays.filter((_, j) => j % every === 0);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
    setHover(i);
    const total = series.reduce((a, s) => a + s.values[i], 0);
    tip.show(e, (
      <>
        <div className="db-tip-h">{fmtDay(days[i])}{marks?.get(i) ? ` · ${marks.get(i)}` : ''}</div>
        {[...series].reverse().filter((s) => s.values[i] > 0).map((s) => (
          <TipRow key={s.key} color={s.color} label={s.label} value={fmt(s.values[i])} />
        ))}
        <TipRow label={totalLabel} value={fmt(total)} strong />
      </>
    ));
  };

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line className="db-gl" x1={left} x2={W - right} y1={y(t)} y2={y(t)} />
            <text className="db-axis" x={left - 6} y={y(t) + 4} textAnchor="end" {...AXIS}>{fmt(t)}</text>
          </g>
        ))}
        {stacks.map(({ s, lo, hi }) => (
          <path key={s.key} d={area(lo, hi)} fill={s.color} className="db-area" />
        ))}
        {marks ? [...marks.entries()].map(([i, label]) => (
          <g key={i}>
            <line className="db-mark" x1={x(i)} x2={x(i)} y1={top} y2={top + ih} />
            <text className="db-axis" x={x(i)} y={top - 5} textAnchor="middle" {...AXIS}>{label}</text>
          </g>
        )) : null}
        {xt.map(([d, i]) => (
          <text key={d} className="db-axis" x={x(i)} y={height - 8} textAnchor="middle" {...AXIS}>{fmtDay(d)}</text>
        ))}
        <line className="db-base" x1={left} x2={W - right} y1={top + ih} y2={top + ih} />
        {hover != null ? <line className="db-cross" x1={x(hover)} x2={x(hover)} y1={top} y2={top + ih} /> : null}
        <rect
          x={left} y={top} width={iw} height={ih} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => { setHover(null); tip.hide(); }}
        />
      </svg>
    </div>
  );
}

// ── lines: a few series on one axis ─────────────────────────────

export function Lines({
  days, series, fmt, fmtDay, height = 240,
}: { days: string[]; series: Series[]; fmt: Fmt; fmtDay: (d: string) => string; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  const top = 12, bottom = 26, left = AX_W, right = 8;
  const iw = Math.max(10, W - left - right), ih = height - top - bottom;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1];
  const x = (i: number) => left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => top + ih - (v / yMax) * ih;
  // Sunday ticks, thinned so labels keep ~56px apart on a phone.
  const sundays = days.map((d, i) => [d, i] as const).filter(([d]) => new Date(d + 'T00:00:00Z').getUTCDay() === 0);
  const every = Math.max(1, Math.ceil(56 / Math.max(1, (iw / Math.max(1, n - 1)) * 7)));
  const xt = sundays.filter((_, j) => j % every === 0);

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line className="db-gl" x1={left} x2={W - right} y1={y(t)} y2={y(t)} />
            <text className="db-axis" x={left - 6} y={y(t) + 4} textAnchor="end" {...AXIS}>{fmt(t)}</text>
          </g>
        ))}
        {series.map((s) => (
          <path
            key={s.key}
            d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')}
            fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          />
        ))}
        {xt.map(([d, i]) => (
          <text key={d} className="db-axis" x={x(i)} y={height - 8} textAnchor="middle" {...AXIS}>{fmtDay(d)}</text>
        ))}
        <line className="db-base" x1={left} x2={W - right} y1={top + ih} y2={top + ih} />
        {hover != null ? (
          <>
            <line className="db-cross" x1={x(hover)} x2={x(hover)} y1={top} y2={top + ih} />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} className="db-ring" />
            ))}
          </>
        ) : null}
        <rect
          x={left} y={top} width={iw} height={ih} fill="transparent"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
            setHover(i);
            tip.show(e, (
              <>
                <div className="db-tip-h">{fmtDay(days[i])}</div>
                {series.map((s) => <TipRow key={s.key} color={s.color} label={s.label} value={fmt(s.values[i])} />)}
              </>
            ));
          }}
          onPointerLeave={() => { setHover(null); tip.hide(); }}
        />
      </svg>
    </div>
  );
}

// ── columns ─────────────────────────────────────────────────────

export interface Col { key: string; label: string; value: number; sub?: string; muted?: boolean; tip?: ReactNode }

export function Columns({
  items, fmt, height = 220, color = 'var(--cat-brandy)',
}: { items: Col[]; fmt: Fmt; height?: number; color?: string }) {
  const [ref, W] = useWidth<HTMLDivElement>(480);
  const tip = useTip();
  const left = 8, right = 8;
  const band0 = Math.max(10, W - left - right) / Math.max(1, items.length);
  // Labels wider than their band are set at an angle rather than allowed to collide.
  const tight = items.some((c) => c.label.length * 6.2 > band0 - 4);
  const top = 22, bottom = tight ? 44 : items.some((c) => c.sub) ? 40 : 26;
  const iw = Math.max(10, W - left - right), ih = height - top - bottom;
  const max = Math.max(1, ...items.map((c) => c.value));
  const band = band0;
  // Value labels only when every one fits its band; otherwise the axis-free
  // bars lean on the tooltip and the table view.
  const showVals = items.every((c) => fmt(c.value).length * 6.4 <= band - 2);
  const bw = Math.min(24, band * 0.6);
  const y = (v: number) => top + ih - (v / max) * ih;

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        <line className="db-base" x1={left} x2={W - right} y1={top + ih} y2={top + ih} />
        {items.map((c, i) => {
          const cx = left + band * i + band / 2;
          const h = (c.value / max) * ih;
          return (
            <g
              key={c.key}
              onPointerMove={(e) => tip.show(e, c.tip ?? <TipRow label={c.label} value={fmt(c.value)} strong />)}
              onPointerLeave={tip.hide}
            >
              <rect x={cx - band / 2} y={top} width={band} height={ih + bottom} fill="transparent" />
              <path d={barPath(cx - bw / 2, y(c.value), bw, h, 'up')} fill={color} opacity={c.muted ? 0.45 : 1} />
              {showVals ? <text className="db-val" x={cx} y={y(c.value) - 6} textAnchor="middle" {...AXIS}>{fmt(c.value)}</text> : null}
              {tight ? (
                <text className="db-axis" x={cx} y={top + ih + 12} textAnchor="end" fontSize={10} transform={`rotate(-35 ${cx} ${top + ih + 12})`}>{c.label}</text>
              ) : (
                <text className="db-axis" x={cx} y={top + ih + 16} textAnchor="middle" {...AXIS}>{c.label}</text>
              )}
              {c.sub ? <text className="db-axis" x={cx} y={top + ih + 30} textAnchor="middle" fontSize={10}>{c.sub}</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── ranked horizontal bars (optionally stacked) ─────────────────

export interface Seg { key: string; label: string; color: string; value: number }
export interface HBar { key: string; label: string; sub?: string; href?: string; value: number; segs: Seg[] }

export function HBars({
  items, fmt, rowH = 26, labelFrac = 0.42,
}: { items: HBar[]; fmt: Fmt; rowH?: number; labelFrac?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const tip = useTip();
  const valW = 64;
  const labelW = Math.round(Math.min(260, Math.max(110, W * labelFrac)));
  const iw = Math.max(10, W - labelW - valW - 8);
  const max = Math.max(1, ...items.map((b) => b.value));
  const bh = Math.min(16, rowH - 8);
  const height = items.length * rowH + 4;
  const [measured, setMeasured] = useState(false);
  useEffect(() => setMeasured(true), []);
  const fit = (s: string) => fitText(s, labelW - 10, 12, measured);

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        {items.map((b, i) => {
          const y0 = i * rowH + 2;
          let x0 = labelW;
          const segs = b.segs.filter((s) => s.value > 0);
          const label = (
            <text className="db-lab" x={0} y={y0 + rowH / 2 + 4} fontSize={12}>{fit(b.label)}</text>
          );
          return (
            <g
              key={b.key}
              onPointerMove={(e) => tip.show(e, (
                <>
                  <div className="db-tip-h">{b.label}{b.sub ? <span className="dim-2"> · {b.sub}</span> : null}</div>
                  {segs.length > 1 ? segs.map((s) => <TipRow key={s.key} color={s.color} label={s.label} value={fmt(s.value)} />) : null}
                  <TipRow color={segs.length === 1 ? segs[0].color : undefined} label={segs.length === 1 ? segs[0].label : '='} value={fmt(b.value)} strong />
                </>
              ))}
              onPointerLeave={tip.hide}
            >
              <rect x={0} y={y0} width={W} height={rowH} fill="transparent" />
              {b.href ? <a href={b.href}>{label}</a> : label}
              {segs.map((s, j) => {
                const w = (s.value / max) * iw;
                const last = j === segs.length - 1;
                // 2px surface gap between touching segments; only the last one is rounded.
                const gap = last ? 0 : Math.min(2, w / 2);
                const d = last
                  ? barPath(x0, y0 + (rowH - bh) / 2, w, bh, 'right')
                  : `M${x0},${y0 + (rowH - bh) / 2}h${Math.max(0, w - gap)}v${bh}h${-Math.max(0, w - gap)}Z`;
                x0 += w;
                return <path key={s.key} d={d} fill={s.color} />;
              })}
              <text className="db-val" x={labelW + (b.value / max) * iw + 6} y={y0 + rowH / 2 + 4} fontSize={11}>{fmt(b.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 100% stacked rows ───────────────────────────────────────────

export function Stack100({ rows, fmt }: { rows: { key: string; label: string; sub?: string; segs: Seg[]; fmt?: Fmt }[]; fmt: Fmt }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const tip = useTip();
  // Each row names its measure and its total, so the reader knows what 100% is.
  // On a narrow screen (and in Tamil, whose labels run long) the label moves
  // above its bar rather than squeezing into a column beside it.
  const above = W < 520;
  const labelW = above ? 0 : Math.min(150, Math.max(110, W * 0.26));
  const iw = Math.max(10, W - labelW);
  const rowH = above ? 58 : 48, bh = 24;
  const height = rows.length * rowH;

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        {rows.map((r, i) => {
          const total = r.segs.reduce((a, s) => a + s.value, 0) || 1;
          let x0 = labelW;
          const y0 = above ? i * rowH + 22 : i * rowH + (rowH - bh) / 2;
          return (
            <g key={r.key}>
              {above ? (
                <text x={0} y={y0 - 7} fontSize={12}>
                  <tspan className="db-lab">{r.label}</tspan>
                  {r.sub ? <tspan className="db-axis" fontSize={11}>{`  ${r.sub}`}</tspan> : null}
                </text>
              ) : (
                <>
                  <text className="db-lab" x={0} y={r.sub ? y0 + bh / 2 - 2 : y0 + bh / 2 + 4} fontSize={12}>{r.label}</text>
                  {r.sub ? <text className="db-axis" x={0} y={y0 + bh / 2 + 12} fontSize={11}>{r.sub}</text> : null}
                </>
              )}
              {r.segs.map((s) => {
                const w = (s.value / total) * iw;
                const sx = x0;
                x0 += w;
                const pct = s.value / total;
                const txt = `${(pct * 100).toFixed(pct < 0.1 ? 1 : 0)}%`;
                // Only label inside when the text fits with padding.
                const fits = w > txt.length * 7 + 10;
                return (
                  <g
                    key={s.key}
                    onPointerMove={(e) => tip.show(e, (
                      <>
                        <div className="db-tip-h">{r.label}</div>
                        <TipRow color={s.color} label={s.label} value={`${(pct * 100).toFixed(1)}% · ${(r.fmt ?? fmt)(s.value)}`} />
                      </>
                    ))}
                    onPointerLeave={tip.hide}
                  >
                    <rect x={sx} y={y0} width={Math.max(0, w - 2)} height={bh} fill={s.color} />
                    {fits ? (
                      <text x={sx + 6} y={y0 + bh / 2 + 4} fontSize={11} className="db-inbar">{txt}</text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── heatmap ─────────────────────────────────────────────────────

/** Sequential ramp, light → dark (CSS variables, flipped for the dark theme). */
export const SEQ = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)', 'var(--seq-7)'];
export const seqColor = (t: number, ramp: string[] = SEQ) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];
/** The festival tracker's crimson ramp (globals.css --fseq-*), for magnitude that is not a category. */
export const FSEQ = ['var(--fseq-1)', 'var(--fseq-2)', 'var(--fseq-3)', 'var(--fseq-4)', 'var(--fseq-5)', 'var(--fseq-6)', 'var(--fseq-7)'];

export function Heatmap({
  rows, cols, values, fmt, rowTip,
}: { rows: string[]; cols: number[]; values: number[][]; fmt: Fmt; rowTip: (r: number) => string }) {
  const [ref, W] = useWidth<HTMLDivElement>(640);
  const tip = useTip();
  const labelW = 40;
  const cw = Math.max(10, (W - labelW) / cols.length);
  const ch = Math.min(30, Math.max(20, cw * 0.8));
  const height = rows.length * ch + 22;
  const max = Math.max(1, ...values.flatMap((r) => cols.map((c) => r[c])));

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={height} role="img">
        {rows.map((r, i) => (
          <g key={r}>
            <text className="db-axis" x={0} y={i * ch + ch / 2 + 4} fontSize={11}>{r}</text>
            {cols.map((c, j) => {
              const v = values[i][c];
              return (
                <rect
                  key={c}
                  x={labelW + j * cw + 1} y={i * ch + 1} width={cw - 2} height={ch - 2} rx={2}
                  fill={v > 0 ? seqColor(v / max) : 'var(--paper-2)'}
                  onPointerMove={(e) => tip.show(e, (
                    <>
                      <div className="db-tip-h">{rowTip(i)} · {String(c).padStart(2, '0')}:00</div>
                      <TipRow label="" value={fmt(v)} strong />
                    </>
                  ))}
                  onPointerLeave={tip.hide}
                />
              );
            })}
          </g>
        ))}
        {cols.map((c, j) => (j % 2 === 0 || cw > 30 ? (
          <text key={c} className="db-axis" x={labelW + j * cw + cw / 2} y={height - 6} textAnchor="middle" fontSize={10}>
            {String(c).padStart(2, '0')}
          </text>
        ) : null))}
      </svg>
    </div>
  );
}

/** A labelled gradient key for a sequential scale. */
export function SeqKey({ lo, hi, ramp = SEQ }: { lo: string; hi: string; ramp?: string[] }) {
  return (
    <div className="db-seqkey">
      <span className="t-xs dim-2 num">{lo}</span>
      <span className="db-seqkey-bar">{ramp.map((c) => <span key={c} style={{ background: c }} />)}</span>
      <span className="t-xs dim-2 num">{hi}</span>
    </div>
  );
}

// ── Lorenz curve ────────────────────────────────────────────────

export function Lorenz({
  points, markAt = 0.1, eqLabel, fmtPct,
}: { points: [number, number][]; markAt?: number; eqLabel: string; fmtPct: (v: number) => string }) {
  const [ref, W] = useWidth<HTMLDivElement>(420);
  const tip = useTip();
  const size = Math.min(W, 360);
  const pad = 34;
  const s = size - pad - 8;
  const x = (v: number) => pad + v * s;
  const y = (v: number) => 8 + s - v * s;
  const mark = points.find(([a]) => a >= markAt) ?? points[points.length - 1];
  const d = points.map(([a, b], i) => `${i ? 'L' : 'M'}${x(a)},${y(b)}`).join('');

  return (
    <div ref={ref} className="db-chart">
      <svg className="db-svg" width={W} height={size} role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line className="db-gl" x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} />
            <text className="db-axis" x={pad - 6} y={y(t) + 4} textAnchor="end" fontSize={10}>{fmtPct(t)}</text>
            <text className="db-axis" x={x(t)} y={size - 2} textAnchor="middle" fontSize={10}>{fmtPct(t)}</text>
          </g>
        ))}
        <line className="db-ref" x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} />
        <text className="db-axis" x={x(0.62)} y={y(0.56)} fontSize={10} transform={`rotate(-45 ${x(0.62)} ${y(0.56)})`}>{eqLabel}</text>
        <path d={d} fill="none" stroke="var(--cat-brandy)" strokeWidth={2} />
        <line className="db-mark" x1={x(mark[0])} x2={x(mark[0])} y1={y(mark[1])} y2={y(0)} />
        <circle cx={x(mark[0])} cy={y(mark[1])} r={4.5} fill="var(--cat-brandy)" className="db-ring" />
        <rect
          x={x(0)} y={y(1)} width={s} height={s} fill="transparent"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            const p = points.reduce((m, q) => (Math.abs(q[0] - f) < Math.abs(m[0] - f) ? q : m), points[0]);
            tip.show(e, <TipRow label={`${fmtPct(p[0])} →`} value={fmtPct(p[1])} strong />);
          }}
          onPointerLeave={tip.hide}
        />
      </svg>
    </div>
  );
}

// ── district map ────────────────────────────────────────────────

export interface Geo {
  w: number; h: number; bbox: [number, number, number, number]; k: number;
  districts: { id: number; name: string; d: string; cx: number; cy: number }[];
}

/**
 * Choropleth of the 38 districts, or — with `focus` — one district zoomed in
 * with its shops as dots sized by sales (area, not radius, carries the value).
 */
export function DistrictMap({
  geo, values, fmt, names, focus, points, onPick, height = 520, ramp = SEQ,
}: {
  ramp?: string[];
  geo: Geo;
  values: Map<number, number>;
  fmt: Fmt;
  names: Map<number, string>;
  focus: number | null;
  points: [number, number, number, number][];
  onPick: (id: number) => void;
  height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>(480);
  const tip = useTip();
  const scale = geo.w / ((geo.bbox[2] - geo.bbox[0]) * geo.k);
  const proj = (lat: number, lon: number) => [(lon - geo.bbox[0]) * geo.k * scale, (geo.bbox[3] - lat) * scale];

  // The view: the whole state, or the focused district's own extent with air around it.
  const view = useMemo(() => {
    if (focus == null) return [0, 0, geo.w, geo.h];
    const f = geo.districts.find((d) => d.id === focus);
    if (!f) return [0, 0, geo.w, geo.h];
    const nums = f.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
      y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
    }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.12;
    return [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
  }, [focus, geo]);

  const h = Math.min(height, Math.round(W * (view[3] / view[2])));
  const w = Math.min(W, Math.round(h * (view[2] / view[3])));
  const k = view[2] / w; // viewBox units per screen pixel, for strokes and dots

  // Classed by rank, not by value: Chennai alone sells twice the next district,
  // and a linear scale would leave the other 37 in the same pale step.
  const vals = [...values.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const t = (v: number) => (vals.length > 1 ? vals.indexOf(v) / (vals.length - 1) : 1);
  const pmax = Math.max(1, ...points.map((p) => p[3]));

  return (
    <div ref={ref} className="db-chart" style={{ display: 'flex', justifyContent: 'center' }}>
      <svg className="db-svg" width={w} height={h} viewBox={view.join(' ')} role="img" style={{ overflow: 'hidden' }}>
        {geo.districts.map((d) => {
          const v = values.get(d.id) ?? 0;
          const on = focus === d.id;
          const fill = focus != null ? (on ? 'var(--paper-2)' : 'var(--paper-3)') : v > 0 ? seqColor(t(v), ramp) : 'var(--paper-2)';
          return (
            <path
              key={d.id}
              d={d.d}
              fill={fill}
              fillRule="evenodd"
              stroke={on ? 'var(--ink)' : 'var(--paper)'}
              strokeWidth={(on ? 1.6 : 0.8) * k}
              style={{ cursor: 'pointer' }}
              onPointerMove={(e) => tip.show(e, <TipRow label={names.get(d.id) ?? d.name} value={fmt(v)} strong />)}
              onPointerLeave={tip.hide}
              onClick={() => onPick(d.id)}
            />
          );
        })}
        {points.map(([no, lat, lon, v]) => {
          const [px, py] = proj(lat, lon);
          const r = (2 + 7 * Math.sqrt(v / pmax)) * k;
          return (
            <circle
              key={no} cx={px} cy={py} r={r} fill="var(--cat-brandy)" fillOpacity={0.75}
              stroke="var(--paper)" strokeWidth={1 * k}
              onPointerMove={(e) => tip.show(e, <TipRow label={`#${no}`} value={fmt(v)} strong />)}
              onPointerLeave={tip.hide}
              onClick={() => { window.location.href = `/shops/${no}`; }}
              style={{ cursor: 'pointer' }}
            />
          );
        })}
      </svg>
    </div>
  );
}

