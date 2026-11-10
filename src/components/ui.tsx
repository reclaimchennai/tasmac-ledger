import Link from 'next/link';
import type { ReactNode } from 'react';
import { categoryColor } from '@/lib/format';

/**
 * A figure with its label set beneath it, ledger-style: number first, name after.
 *
 * `over` is for the one case where a figure needs context *before* it rather
 * than after — the feed clock, where a time on its own is unreadable without the
 * date it belongs to.
 */
export function Stat({
  label, value, sub, over, accent, delay = 0,
}: { label: string; value: ReactNode; sub?: ReactNode; over?: ReactNode; accent?: string; delay?: number }) {
  return (
    <div className="stat rise" style={{ animationDelay: `${delay}ms` }}>
      {over ? <div className="stat-over">{over}</div> : null}
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="label mt-2">{label}</div>
      {sub ? <div className="t-xs dim-2 mt-1">{sub}</div> : null}
    </div>
  );
}

export function SectionHead({
  n, title, note, right,
}: { n?: string; title: string; note?: ReactNode; right?: ReactNode }) {
  return (
    <div className="row-e between g-4 rule-b pb-4 mb-4" style={{ paddingBottom: 12 }}>
      <div className="row-b g-3 min0">
        {n ? <span className="num t-xs br shrink-0">{n}</span> : null}
        <h2 className="h2">{title}</h2>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
      {note ? <span className="label truncate only-wide" style={{ flex: 1 }}>{note}</span> : null}
    </div>
  );
}

/**
 * The colour swatch stays keyed to the untranslated category — it is the same
 * colour in both languages — while `label` carries whatever the reader should
 * actually see.
 */
export function CategoryTag({
  category, label, href,
}: { category: string | null | undefined; label?: string | null; href?: string }) {
  if (!category) return null;
  const body = (
    <>
      <span className="shrink-0" style={{ width: 7, height: 7, background: categoryColor(category), display: 'inline-block' }} />
      {label ?? category}
    </>
  );
  const cls = 'num row g-2 nowrap';
  const style = { fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const };

  /*
    Opt-in rather than always-on: this tag also appears inside rows that are
    themselves links (the stacked phone records), and an anchor inside an anchor
    is invalid markup that browsers silently unpick. Callers that are certainly
    not inside one pass `href`.

    It carries no link decoration on purpose — the tag should look exactly as it
    did, and reveal itself only on hover.
  */
  return href ? (
    <Link href={href} className={`${cls} cat-link`} style={style}>{body}</Link>
  ) : (
    <span className={cls} style={style}>{body}</span>
  );
}

/**
 * TASMAC's published consumer helpline, as something a phone can dial.
 *
 * The printed form carries non-breaking hyphens so the number never wraps
 * mid-sequence; `tel:` wants bare digits, so the two are kept separately rather
 * than derived from one another by stripping characters.
 */
export const HELPLINE = '1800‑425‑2041';
/* Dialled as-is: an Indian toll-free number is not reachable behind +91. */
const HELPLINE_TEL = 'tel:18004252041';

export function Helpline() {
  return (
    <a href={HELPLINE_TEL} className="num ox helpline">
      {HELPLINE}
    </a>
  );
}

/** Proportion bar used inside rows — reads as a ledger tally, not a chart. */
export function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  // The 0.5% floor keeps a tiny-but-real quantity visible rather than rounding
  // it away; zero has to stay empty, or "no shops missing" would draw the same
  // mark as "one shop missing".
  const w = max > 0 && value > 0 ? Math.max(0.5, (value / max) * 100) : 0;
  return (
    <div className="bar-track">
      <div className="bar-fill draw" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function Delta({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="dim-2">—</span>;
  const up = value > 0;
  return (
    <span className="num" style={{ color: up ? 'var(--verdigris)' : 'var(--oxblood)' }}>
      {up ? '+' : '−'}{Math.abs(value).toLocaleString('en-IN')}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="label" style={{ padding: '48px 0', textAlign: 'center' }}>{children}</div>;
}

export function Crumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="label row wrap g-2 mb-4" style={{ paddingTop: 16 }}>
      {items.map((it, i) => (
        <span key={i} className="row g-2">
          {i > 0 ? <span style={{ color: 'var(--rule)' }}>/</span> : null}
          {it.href ? <Link href={it.href} className="link-ox">{it.label}</Link> : <span className="dim">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** A field inside a stacked mobile record. */
export function F({ k, v }: { k: string; v: ReactNode }) {
  return (
    <span className="record-field">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </span>
  );
}

/**
 * Inline sparkline — deliberately unlabelled and tiny. It shows shape at a
 * glance; the exact figures live in the column beside it.
 */
export function Spark({
  points, width = 120, height = 26, color = 'var(--oxblood)', fill = true,
}: { points: number[]; width?: number; height?: number; color?: string; fill?: boolean }) {
  if (points.length < 2) return <span className="label" style={{ fontSize: 9 }}>—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const dx = width / (points.length - 1);
  const xy = points.map((p, i) => [i * dx, height - ((p - min) / span) * (height - 3) - 1.5] as const);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden style={{ overflow: 'visible' }}>
      {fill ? <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity={0.1} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={1.9} fill={color} />
    </svg>
  );
}

export interface Slice { key: string; label: string; value: number; color: string }

/**
 * Proportional breakdown, drawn as a ring.
 *
 * A ring rather than a filled pie: the hole carries the total, which is the
 * number a reader wants alongside the split, and it keeps the whole figure
 * legible at the size a phone can give it. Drawn with `stroke-dasharray` on one
 * circle per slice rather than as arc paths — no trigonometry, no rounding
 * seams between neighbouring wedges, and it degrades to a plain circle if a
 * single category accounts for everything.
 *
 * Slices below 1% are still drawn, at a floor width, so "present but negligible"
 * does not render as "absent".
 */
export function Ring({
  slices, total, caption, size = 168, thickness = 26,
}: {
  slices: Slice[];
  /** Rendered in the middle — usually the total the slices sum to. */
  total?: ReactNode;
  caption?: ReactNode;
  size?: number;
  thickness?: number;
}) {
  const sum = slices.reduce((a, s) => a + s.value, 0);
  if (sum <= 0) return null;

  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const drawn = slices.map((s) => {
    const share = s.value / sum;
    const length = Math.max(circumference * share, 1.5);
    const seg = { ...s, share, length, offset };
    offset += circumference * share;
    return seg;
  });

  return (
    <div className="ring-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden>
        {/* Rotated so the first slice starts at twelve o'clock. */}
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {drawn.map((s) => (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.length} ${circumference - s.length}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </g>
        {total ? (
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="ring-total"
          >
            {total}
          </text>
        ) : null}
      </svg>

      {/* The figures live in the key, not on the ring: labels crammed into
          wedges are unreadable at this size and in two scripts. */}
      <ul className="ring-key">
        {drawn.map((s) => (
          <li key={s.key}>
            <span className="ring-swatch" style={{ background: s.color }} />
            <span className="ring-label truncate">{s.label}</span>
            <span className="num ring-share">{(s.share * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      {caption ? <div className="label ring-caption">{caption}</div> : null}
    </div>
  );
}

/** Full-width area trace, used for statewide and per-entity time series. */
export function Trace({
  points, height = 140, color = 'var(--oxblood)',
}: { points: number[]; height?: number; color?: string }) {
  if (points.length < 2) return <Empty>Not enough readings yet</Empty>;
  const W = 1200;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const dx = W / (points.length - 1);
  const xy = points.map((p, i) => [i * dx, height - ((p - min) / span) * (height - 16) - 8] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none" aria-hidden>
      <path d={`${line} L${W},${height} L0,${height} Z`} fill={color} opacity={0.08} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2} fill={color} opacity={i === xy.length - 1 ? 1 : 0.3} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
