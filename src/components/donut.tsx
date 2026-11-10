import { categoryColor } from '@/lib/format';

/**
 * Market share, as a ring.
 *
 * Two decisions worth recording, because both were the opposite of the obvious
 * one:
 *
 * **One hue, not six.** Share here is a ranked magnitude — first, second,
 * third — not six unrelated identities, so this is a sequential ramp rather
 * than a categorical palette. That is also the only honest option available:
 * this site's palette is a deliberately muted paper-ledger set, and six of its
 * tokens put adjacent slices below the separation a reader with ordinary colour
 * vision needs, let alone a colourblind one. A single hue stepped by lightness
 * cannot have that problem.
 *
 * **Opacity, not fixed tints.** The steps are the category's own colour laid
 * over the page at falling alpha, so the ramp re-derives itself against paper
 * or against the dark ground without a second palette to keep in sync.
 *
 * Every slice is named and given its percentage underneath, so identity never
 * rests on colour at all — the ring is there to show the shape of the split at
 * a glance, and the list under it is the actual reading.
 */

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** The folded-up tail. Painted neutral, because it is a remainder rather than
      a rank — and it is often the largest slice, which would otherwise hand the
      palest step of a descending ramp to the biggest arc. */
  rest?: boolean;
}

const R = 58;
const STROKE = 24;
const C = 2 * Math.PI * R;
/** Surface-coloured gap between segments, in px of arc. */
const GAP = 3;

export function Donut({
  slices, category, total, centreValue, centreLabel,
}: {
  slices: Slice[];
  category: string | null;
  total: number;
  centreValue: string;
  centreLabel: string;
}) {
  if (!slices.length || total <= 0) return null;
  const base = categoryColor(category);

  let acc = 0;
  const arcs = slices.map((s, i) => {
    const frac = s.value / total;
    const len = Math.max(0, frac * C - GAP);
    const offset = -acc * C;
    acc += frac;
    return {
      ...s,
      // Falls from solid to a quarter — monotonic by construction, so the ramp
      // is always readable as an order.
      alpha: s.rest ? 1 : 1 - (i / Math.max(1, slices.length)) * 0.7,
      stroke: s.rest ? 'var(--rule)' : base,
      len,
      offset,
      pct: frac * 100,
    };
  });

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut" role="img"
           aria-label={arcs.map((a) => `${a.label} ${a.pct.toFixed(1)}%`).join(', ')}>
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--rule-soft)" strokeWidth={STROKE} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="70" cy="70" r={R}
              fill="none"
              stroke={a.stroke}
              strokeOpacity={a.alpha}
              strokeWidth={STROKE}
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={a.offset}
            />
          ))}
        </g>
        <text x="70" y="67" textAnchor="middle" className="donut-value">{centreValue}</text>
        <text x="70" y="81" textAnchor="middle" className="donut-label">{centreLabel}</text>
      </svg>

      <ul className="donut-key">
        {arcs.map((a) => (
          <li key={a.key}>
            <span className="donut-chip" style={{ background: a.stroke, opacity: a.alpha }} />
            <span className="donut-name truncate">{a.label}</span>
            <span className="num t-xs dim-2">{a.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
