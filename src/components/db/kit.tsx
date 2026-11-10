'use client';

import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState,
  type ReactNode, type RefObject,
} from 'react';

/**
 * The dashboard's shared pieces: a measured width (charts draw in real pixels,
 * so type stays 11px on a phone instead of shrinking with a viewBox), one
 * floating tooltip for every chart, and the card every chart sits in — kicker,
 * title, subtitle, legend, a table view of the same numbers, and a button that
 * saves the card as an image.
 */

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Width of an element, tracked. Starts from a guess so the server render has a shape. */
export function useWidth<T extends HTMLElement>(guess = 720): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(guess);
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width) || guess);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || guess));
    ro.observe(el);
    return () => ro.disconnect();
  }, [guess]);
  return [ref, w];
}

// ── tooltip ─────────────────────────────────────────────────────

interface Tip {
  show: (e: { clientX: number; clientY: number }, body: ReactNode) => void;
  hide: () => void;
}
const TipCtx = createContext<Tip>({ show: () => {}, hide: () => {} });
export const useTip = () => useContext(TipCtx);

export function TipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const show = useCallback<Tip['show']>((e, body) => setTip({ x: e.clientX, y: e.clientY, body }), []);
  const hide = useCallback(() => setTip(null), []);

  // Keep the box on screen: flip left of the cursor near the right edge, and
  // above it near the bottom.
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useIso(() => {
    if (!tip || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const pad = 14;
    let left = tip.x + pad;
    let top = tip.y + pad;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, tip.x - pad - r.width);
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, tip.y - pad - r.height);
    setPos({ left, top });
  }, [tip]);

  return (
    <TipCtx.Provider value={{ show, hide }}>
      {children}
      <div
        ref={box}
        className="db-tip"
        role="status"
        aria-live="polite"
        style={{ left: pos.left, top: pos.top, opacity: tip ? 1 : 0, visibility: tip ? 'visible' : 'hidden' }}
      >
        {tip?.body}
      </div>
    </TipCtx.Provider>
  );
}

/** One row of a tooltip: swatch, label, value. */
export function TipRow({ color, label, value, strong }: { color?: string; label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="db-tip-row" data-strong={strong || undefined}>
      {color ? <span className="db-sw" style={{ background: color }} /> : <span className="db-sw" />}
      <span className="db-tip-l">{label}</span>
      <span className="db-tip-v num">{value}</span>
    </div>
  );
}

// ── legend ──────────────────────────────────────────────────────

export interface LegendItem { key: string; label: string; color: string; shape?: 'line' }

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <div className="db-legend">
      {items.map((it) => (
        <span key={it.key} className="db-legend-i">
          <span className={it.shape === 'line' ? 'db-sw-line' : 'db-sw'} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ── table view ──────────────────────────────────────────────────

export interface TableSpec {
  head: string[];
  rows: (string | number)[][];
  /** Column indexes that are numbers (right-aligned, tabular). */
  numeric?: number[];
}

function DataTable({ spec }: { spec: TableSpec }) {
  const num = new Set(spec.numeric ?? spec.head.map((_, i) => i).slice(1));
  return (
    <div className="db-table-wrap">
      <table className="db-table">
        <thead>
          <tr>{spec.head.map((h, i) => <th key={i} data-num={num.has(i) || undefined}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {spec.rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} data-num={num.has(j) || undefined}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── card ────────────────────────────────────────────────────────

export interface CardText {
  table: string;
  chart: string;
  download: string;
  source: string;
  scope: string;
}

/**
 * A chart in a card. `table` is the same numbers as rows (every chart has one —
 * a tooltip is never the only way to read a value); `snap` turns on the
 * save-as-image button, which draws the card's SVG with its title, legend and
 * source onto a canvas.
 */
export function Card({
  id, kicker, title, sub, legend, table, children, text, wide, snap = true, aside,
}: {
  id: string;
  kicker: string;
  title: string;
  sub?: ReactNode;
  legend?: LegendItem[];
  table?: TableSpec;
  children: ReactNode;
  text: CardText;
  wide?: boolean;
  snap?: boolean;
  aside?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const subText = typeof sub === 'string' ? sub : '';

  const save = async () => {
    const svg = body.current?.querySelector('svg.db-svg') as SVGSVGElement | null;
    if (!svg) return;
    await saveCard(svg, { kicker: `${kicker} · ${text.scope}`, title, sub: subText, legend: legend ?? [], source: text.source, name: id });
  };

  return (
    <section className="db-card" id={id} data-wide={wide || undefined} aria-labelledby={`${id}-h`}>
      <header className="db-card-head">
        <div className="min0">
          <div className="label br">{kicker}</div>
          <h2 className="db-h2" id={`${id}-h`}>{title}</h2>
          {sub ? <p className="db-sub">{sub}</p> : null}
        </div>
        <div className="db-card-tools">
          {table ? (
            <button type="button" className="db-tool" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
              {asTable ? text.chart : text.table}
            </button>
          ) : null}
          {snap ? (
            <button type="button" className="db-tool" onClick={save} aria-label={text.download} title={text.download}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M2 5.5h2.5L6 3.5h4l1.5 2H14v7.5H2z" strokeLinejoin="round" />
                <circle cx="8" cy="9" r="2.4" />
              </svg>
            </button>
          ) : null}
        </div>
      </header>
      {legend && !asTable ? <Legend items={legend} /> : null}
      <div ref={body} className="db-card-body">
        {asTable && table ? <DataTable spec={table} /> : children}
      </div>
      {aside}
    </section>
  );
}

// ── save as image ───────────────────────────────────────────────

const PAINT = ['fill', 'stroke', 'stop-color', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'letter-spacing'] as const;

/**
 * The chart SVG is drawn with CSS variables and classes, neither of which
 * survive being turned into an image on their own. So the live element's
 * computed paint is written onto a clone, attribute by attribute, and the
 * clone is rasterised with the card's text set around it.
 */
async function saveCard(
  svg: SVGSVGElement,
  meta: { kicker: string; title: string; sub: string; legend: LegendItem[]; source: string; name: string },
) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const live = [svg, ...svg.querySelectorAll('*')];
  const copy = [clone, ...clone.querySelectorAll('*')];
  live.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const c = copy[i] as Element;
    for (const p of PAINT) {
      const v = cs.getPropertyValue(p);
      if (v) c.setAttribute(p, v);
    }
    c.removeAttribute('class');
  });
  const w = svg.clientWidth || Number(svg.getAttribute('width')) || 720;
  const h = svg.clientHeight || Number(svg.getAttribute('height')) || 300;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const root = getComputedStyle(document.documentElement);
  const paper = root.getPropertyValue('--paper').trim() || '#f2ede1';
  const ink = root.getPropertyValue('--ink').trim() || '#17140f';
  const ink2 = root.getPropertyValue('--ink-2').trim() || '#4a4336';
  const accent = root.getPropertyValue('--brass').trim() || '#9a6b1e';
  const font = getComputedStyle(document.body).fontFamily;

  const img = new Image();
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });

  const scale = 2;
  const pad = 28;
  const width = w + pad * 2;
  const ctx0 = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  ctx0.font = `13px ${font}`;
  const wrap = (text: string, max: number, ctx: CanvasRenderingContext2D) => {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const wd of words) {
      const t = line ? `${line} ${wd}` : wd;
      if (ctx.measureText(t).width > max && line) { lines.push(line); line = wd; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  };
  const subLines = meta.sub ? wrap(meta.sub, w, ctx0) : [];
  ctx0.font = `11px ${font}`;
  const srcLines = wrap(meta.source, w, ctx0);
  const legendH = meta.legend.length > 1 ? 26 : 0;
  const head = pad + 16 + 30 + subLines.length * 18 + 10 + legendH;
  const height = head + h + 18 + srcLines.length * 15 + pad;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(scale, scale);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  let y = pad + 10;
  ctx.fillStyle = accent;
  ctx.font = `600 11px ${font}`;
  ctx.fillText(meta.kicker.toUpperCase(), pad, y);
  y += 28;
  ctx.fillStyle = ink;
  ctx.font = `600 22px ${font}`;
  ctx.fillText(meta.title, pad, y);
  y += 22;
  ctx.fillStyle = ink2;
  ctx.font = `13px ${font}`;
  for (const l of subLines) { ctx.fillText(l, pad, y); y += 18; }
  if (legendH) {
    y += 6;
    let x = pad;
    ctx.font = `12px ${font}`;
    for (const it of meta.legend) {
      ctx.fillStyle = it.color.startsWith('var(')
        ? root.getPropertyValue(it.color.slice(4, -1)).trim()
        : it.color;
      ctx.fillRect(x, y - 9, 10, 10);
      ctx.fillStyle = ink2;
      ctx.fillText(it.label, x + 15, y);
      x += 15 + ctx.measureText(it.label).width + 16;
    }
    y += 14;
  }
  ctx.drawImage(img, pad, head, w, h);
  URL.revokeObjectURL(url);
  y = head + h + 22;
  ctx.fillStyle = ink2;
  ctx.font = `11px ${font}`;
  for (const l of srcLines) { ctx.fillText(l, pad, y); y += 15; }

  const a = document.createElement('a');
  a.download = `tasmac-${meta.name}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

// ── scales ──────────────────────────────────────────────────────

/** Round tick values covering [0, max]: 1, 2 or 5 × a power of ten. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/** Path for a bar with a 4px rounded data end and a square base. */
export function barPath(x: number, y: number, w: number, h: number, dir: 'up' | 'right'): string {
  if (w <= 0 || h <= 0) return '';
  const r = Math.min(4, dir === 'up' ? w / 2 : h / 2, dir === 'up' ? h : w);
  if (dir === 'up') {
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}
