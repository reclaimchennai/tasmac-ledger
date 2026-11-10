'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Shop map.
 *
 * A slippy Web Mercator map: Google raster tiles underneath, the ~4,850 shop
 * points as one SVG layer on top. Keeping the points in SVG rather than handing
 * them to a mapping library is what makes the whole set affordable — they are
 * static, they never re-project, and the browser draws four thousand circles far
 * more cheaply than four thousand marker objects.
 *
 * Tiles are only ever requested for the visible grid, and are `loading="lazy"`
 * on top of that, so a pan costs the handful of tiles that actually came into
 * view. `Plain` draws no basemap at all — no network, and the fastest way to
 * read the distribution as a distribution.
 *
 * The map reports its viewport upward so the ledger beneath narrows to whatever
 * is on screen.
 */

export interface Point {
  shop_no: number;
  lat: number;
  lon: number;
  trading_status: string | null;
  taluk: string | null;
  district: string | null;
  /** Bottles on the shelf at the latest reading; null if the shop did not report. */
  units: number | null;
}

export interface Viewport { south: number; west: number; north: number; east: number }

export interface MapStrings {
  locate: string;
  locating: string;
  reset: string;
  zoomIn: string;
  zoomOut: string;
  denied: string;
  noFix: string;
  noGeo: string;
  street: string;
  satellite: string;
  terrain: string;
  plain: string;
  streetView: string;
  openInMaps: string;
  label: string;
  basemapAria: string;
  sizeKey: string;
  closeShop: string;
  viewShop: string;
  classes: Record<string, string>;
}

const CLASS_COLOR: Record<string, string> = {
  trading: 'var(--verdigris)',
  stopped: 'var(--oxblood)',
  closed: 'var(--flag)',
};

/** Tamil Nadu, with a little air around it — the opening view. */
const TN = { south: 7.9, west: 76.0, north: 13.7, east: 80.6 };
const TN_CENTRE = { lat: (TN.south + TN.north) / 2, lon: (TN.west + TN.east) / 2 };

const TILE = 256;
const MIN_Z = 6;
const MAX_Z = 18;

/**
 * Google's tile endpoints, the same `lyrs` values a GIS client uses for them.
 * `mt0`–`mt3` are round-robined because browsers cap concurrent connections per
 * host, and a pan at high zoom asks for twenty-odd tiles at once.
 */
const BASEMAPS = {
  street: 'm',
  satellite: 'y',
  terrain: 'p',
} as const;

type Basemap = keyof typeof BASEMAPS | 'plain';

const tileUrl = (kind: keyof typeof BASEMAPS, x: number, y: number, z: number) =>
  `https://mt${(x + y) % 4}.google.com/vt/lyrs=${BASEMAPS[kind]}&hl=en&x=${x}&y=${y}&z=${z}`;

/** Stacked layers — the conventional mark for a basemap switch. */
function LayersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
      <path d="M8 1.6 1.6 5 8 8.4 14.4 5 8 1.6Z" />
      <path d="M1.6 8 8 11.4 14.4 8" />
      <path d="M1.6 11 8 14.4 14.4 11" opacity="0.55" />
    </svg>
  );
}

/** Crosshair over a dot — "where am I". */
function LocateIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="8" cy="8" r="3.2" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <path d="M8 0.8v2.2M8 13v2.2M0.8 8h2.2M13 8h2.2" strokeLinecap="round" />
    </svg>
  );
}

// ── Web Mercator, in pixels at a given zoom ──────────────────────

const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * TILE * 2 ** z;

const latToY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};

const xToLon = (x: number, z: number) => (x / (TILE * 2 ** z)) * 360 - 180;

const yToLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/** Zoom at which the whole of Tamil Nadu fits the given box. */
function fitZoom(w: number, h: number): number {
  const z = 8;
  const dx = lonToX(TN.east, z) - lonToX(TN.west, z);
  const dy = latToY(TN.south, z) - latToY(TN.north, z);
  return z + Math.log2(Math.min(w / dx, h / dy));
}

export function ShopMap({
  points,
  onViewportChange,
  selected,
  onSelect,
  strings,
}: {
  points: Point[];
  onViewportChange: (v: Viewport | null) => void;
  selected: number | null;
  onSelect: (shopNo: number | null) => void;
  strings: MapStrings;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [mounted, setMounted] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>('street');
  const [pickerOpen, setPickerOpen] = useState(false);
  const basemapBox = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ lat: number; lon: number; zoom: number }>({
    ...TN_CENTRE,
    zoom: 7,
  });
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; lat: number; lon: number; moved: boolean } | null>(null);
  const home = useRef<number>(7);

  // Escape closes whichever is open — the basemap menu first, then the selected
  // shop — the same way it closes the masthead search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pickerOpen) setPickerOpen(false);
      else if (selected != null) onSelect(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, onSelect, pickerOpen]);

  // A menu that only closes by re-clicking its own button is a trap on touch.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!basemapBox.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pickerOpen]);

  // Tiles are only drawn once the browser is driving: their grid depends on the
  // measured box, and rendering a guess on the server would mean throwing every
  // tile away on hydration.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      const w = Math.max(320, r.width);
      const h = Math.max(320, Math.min(560, r.width * 0.72));
      setSize({ w, h });
      const z = fitZoom(w, h);
      home.current = z;
      setView((v) => (v.zoom === 7 ? { ...v, zoom: z } : v));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;

  /** Screen position of a coordinate, in the current view. */
  const project = useCallback(
    (lat: number, lon: number) => ({
      x: lonToX(lon, view.zoom) - lonToX(view.lon, view.zoom) + w / 2,
      y: latToY(lat, view.zoom) - latToY(view.lat, view.zoom) + h / 2,
    }),
    [view, w, h],
  );

  const bounds = useCallback(
    (v: typeof view): Viewport => {
      const cx = lonToX(v.lon, v.zoom);
      const cy = latToY(v.lat, v.zoom);
      return {
        west: xToLon(cx - w / 2, v.zoom),
        east: xToLon(cx + w / 2, v.zoom),
        north: yToLat(cy - h / 2, v.zoom),
        south: yToLat(cy + h / 2, v.zoom),
      };
    },
    [w, h],
  );

  /** Push the viewport up to the ledger — but not at full extent, where it adds nothing. */
  const emit = useCallback(
    (v: typeof view) => onViewportChange(v.zoom <= home.current + 0.1 ? null : bounds(v)),
    [bounds, onViewportChange],
  );

  const nudge = (next: typeof view) => { setView(next); emit(next); };

  const zoomBy = (delta: number, cx = w / 2, cy = h / 2) => {
    const zoom = Math.min(MAX_Z, Math.max(Math.min(MIN_Z, home.current), view.zoom + delta));
    if (zoom === view.zoom) return;
    // Keep the point under the cursor fixed while the scale changes.
    const k = 2 ** (zoom - view.zoom);
    const wx = lonToX(view.lon, view.zoom) + (cx - w / 2);
    const wy = latToY(view.lat, view.zoom) + (cy - h / 2);
    const nx = (wx - (cx - w / 2) / k) * k;
    const ny = (wy - (cy - h / 2) / k) * k;
    nudge({ zoom, lon: xToLon(nx, zoom), lat: yToLat(ny, zoom) });
  };

  const locate = () => {
    if (!navigator.geolocation) { setLocError(strings.noGeo); return; }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lon } = pos.coords;
        setMe({ lat, lon });
        nudge({ lat, lon, zoom: 14 });
      },
      (err) => { setLocating(false); setLocError(err.code === 1 ? strings.denied : strings.noFix); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const reset = () => nudge({ ...TN_CENTRE, zoom: home.current });

  // ── tile grid ──────────────────────────────────────────────────
  const tiles = useMemo(() => {
    if (!mounted || basemap === 'plain') return null;
    const tz = Math.max(MIN_Z, Math.min(MAX_Z, Math.round(view.zoom)));
    const k = 2 ** (view.zoom - tz); // fractional zoom, applied as CSS size
    const px = TILE * k;
    const cx = lonToX(view.lon, tz) * k;
    const cy = latToY(view.lat, tz) * k;
    const left = cx - w / 2;
    const top = cy - h / 2;
    const x0 = Math.floor(left / px);
    const y0 = Math.floor(top / px);
    const x1 = Math.floor((left + w) / px);
    const y1 = Math.floor((top + h) / px);
    const span = 2 ** tz;

    const out: { key: string; url: string; left: number; top: number; size: number }[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= span) continue; // above the pole or below it
        const wrapped = ((x % span) + span) % span;
        out.push({
          key: `${tz}/${x}/${y}`,
          url: tileUrl(basemap, wrapped, y, tz),
          left: x * px - left,
          top: y * px - top,
          size: px,
        });
      }
    }
    return out;
  }, [mounted, basemap, view, w, h]);

  /*
    Base dot size grows with zoom, not against it. At full extent 4,850 shops are
    packed into one state and anything larger than a couple of pixels merges into
    a single blot; by the time you are over one taluk there are a handful on
    screen and they should be easy to hit.
  */
  const base = Math.min(9, Math.max(1.6, 1.4 + (view.zoom - MIN_Z) * 0.62));

  /*
    Dot size carries stock, scaled by area rather than by radius — a shop holding
    four times as much gets four times the ink, which is what the eye actually
    reads off a circle. Radius therefore goes as the square root.

    Scaled against the 90th percentile rather than the maximum: a handful of
    elite outlets carry several times an ordinary shop's stock, and letting the
    single largest set the top of the scale would flatten the other 4,800 into
    identical specks. Above the 90th percentile the size is capped, so those
    shops read as "among the largest" rather than dominating the map.
  */
  const p90 = useMemo(() => {
    const held = points.map((p) => p.units ?? 0).filter((u) => u > 0).sort((a, b) => a - b);
    return held.length ? held[Math.floor(held.length * 0.9)] : 1;
  }, [points]);

  const radiusFor = useCallback(
    (p: Point) => {
      /*
        Only a trading shop has stock to encode, so only a trading shop is sized
        by it. A shop that has stopped reporting holds nothing by definition —
        scaling it would collapse every one of them to the floor size, which is
        the opposite of what a reader looking for stoppages needs. They get one
        fixed, deliberately prominent size instead; closed shops get a fixed
        smaller one, since they are history rather than news.
      */
      if (p.trading_status === 'stopped') return base * 1.5;
      if (p.trading_status !== 'trading') return base * 0.8;
      if (!p.units) return base * 0.55;
      return base * (0.55 + 1.15 * Math.min(1, Math.sqrt(p.units / p90)));
    },
    [base, p90],
  );

  /*
    Largest first, so the big dots are painted underneath. Drawn in shop-number
    order a well-stocked outlet would sit on top of its smaller neighbours and
    hide them completely; this way the small ones stay visible and stay clickable.
  */
  const drawOrder = useMemo(
    () => [...points].sort((a, b) => radiusFor(b) - radiusFor(a)),
    [points, radiusFor],
  );
  const sel = selected != null ? points.find((p) => p.shop_no === selected) ?? null : null;
  const onTiles = basemap !== 'plain';

  return (
    <div
      ref={wrap}
      className="map-wrap rule-t rule-b"
      style={{ background: onTiles ? 'var(--paper-3)' : 'var(--paper-2)' }}
    >
      <div
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, lat: view.lat, lon: view.lon, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          // A few pixels of slop, so a slightly shaky tap still counts as a tap.
          if (Math.abs(e.clientX - d.x) > 3 || Math.abs(e.clientY - d.y) > 3) d.moved = true;
          const z = view.zoom;
          const nx = lonToX(d.lon, z) - (e.clientX - d.x);
          const ny = latToY(d.lat, z) - (e.clientY - d.y);
          setView({ zoom: z, lon: xToLon(nx, z), lat: yToLat(ny, z) });
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          // Tapping the map itself — not a dot, not a pan — clears the selection.
          // The dots stop their own events short of here, so reaching this point
          // means the reader tapped empty map.
          if (!d.moved && selected != null) onSelect(null);
          else emit(view);
        }}
        onPointerCancel={() => { if (drag.current) { drag.current = null; emit(view); } }}
        onWheel={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          zoomBy(e.deltaY < 0 ? 0.6 : -0.6, e.clientX - rect.left, e.clientY - rect.top);
        }}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          zoomBy(1, e.clientX - rect.left, e.clientY - rect.top);
        }}
        style={{
          position: 'relative', width: '100%', height: h, overflow: 'hidden',
          touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab',
        }}
      >
        {tiles?.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={t.url}
            alt=""
            /*
              Deliberately not `loading="lazy"`. The grid above is the lazy
              load — it computes which tiles the viewport actually covers and
              asks for those and nothing else. Native lazy-loading on top of
              that only adds its own in-viewport check, which lags a fast pan
              and leaves the map holed while the reader is looking at it.
            */
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            style={{
              position: 'absolute',
              left: Math.round(t.left),
              top: Math.round(t.top),
              width: Math.ceil(t.size),
              height: Math.ceil(t.size),
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        ))}

        <svg
          width={w}
          height={h}
          style={{ position: 'absolute', inset: 0, display: 'block' }}
          role="img"
          aria-label={strings.label}
        >
          {drawOrder.map((p) => {
            const { x, y } = project(p.lat, p.lon);
            if (x < -20 || y < -20 || x > w + 20 || y > h + 20) return null;
            const on = selected === p.shop_no;
            const r = radiusFor(p);
            return (
              <circle
                key={p.shop_no}
                cx={Math.round(x * 10) / 10}
                cy={Math.round(y * 10) / 10}
                r={Math.round((on ? Math.max(r, base) * 2.2 : r) * 10) / 10}
                fill={on ? 'var(--ink)' : CLASS_COLOR[p.trading_status ?? 'trading'] ?? 'var(--ink-3)'}
                fillOpacity={on ? 1 : onTiles ? 0.85 : 0.7}
                /* A hairline of paper around each dot keeps it legible over a
                   busy basemap; below ~3px the outline would be most of the
                   dot, so it is dropped. */
                stroke={onTiles && r >= 3 ? 'rgba(255,255,255,0.8)' : 'none'}
                strokeWidth={onTiles && r >= 3 ? 0.8 : 0}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(on ? null : p.shop_no)}
              />
            );
          })}
          {me
            ? (() => {
                const { x, y } = project(me.lat, me.lon);
                return (
                  <>
                    <circle cx={x} cy={y} r={14} fill="var(--flag)" opacity={0.2} />
                    <circle cx={x} cy={y} r={5} fill="var(--flag)" stroke="#fff" strokeWidth={1.5} />
                  </>
                );
              })()
            : null}
        </svg>
      </div>

      {/* ── controls ─────────────────────────────────────────── */}
      <div className="map-controls">
        <button
          onClick={locate}
          className="map-btn map-icon"
          disabled={locating}
          aria-label={strings.locate}
          title={strings.locate}
          data-busy={locating || undefined}
        >
          <LocateIcon />
        </button>
        <button onClick={() => zoomBy(1)} className="map-btn map-icon" aria-label={strings.zoomIn} title={strings.zoomIn}>+</button>
        <button onClick={() => zoomBy(-1)} className="map-btn map-icon" aria-label={strings.zoomOut} title={strings.zoomOut}>−</button>
        {view.zoom > home.current + 0.1 ? (
          <button onClick={reset} className="map-btn map-icon" aria-label={strings.reset} title={strings.reset}>⤺</button>
        ) : null}
      </div>

      {/*
        The basemap choice is a setting, not a primary action — it gets picked
        once and then left alone — so it collapses to one icon and opens on
        demand rather than spending four buttons of map on itself.
      */}
      <div className="map-basemaps" ref={basemapBox}>
        <button
          className="map-btn map-icon"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label={strings.basemapAria}
          title={strings.basemapAria}
          aria-expanded={pickerOpen}
          aria-haspopup="menu"
          data-on={pickerOpen || undefined}
        >
          <LayersIcon />
        </button>
        {pickerOpen ? (
          <div className="map-picker" role="menu" aria-label={strings.basemapAria}>
            {(['street', 'satellite', 'terrain', 'plain'] as const).map((k) => (
              <button
                key={k}
                role="menuitemradio"
                aria-checked={basemap === k}
                className="map-picker-item"
                data-on={basemap === k || undefined}
                onClick={() => { setBasemap(k); setPickerOpen(false); }}
              >
                {strings[k]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* The key lives above the map now; only Google's attribution stays on it,
          which is where the tile terms require it to be. */}
      {onTiles ? <div className="map-attribution label">© Google</div> : null}

      {/*
        Two rows, not one wrapping row. The action buttons are long — longer
        still in Tamil — and sharing a line with the shop name meant the name was
        the thing that got squeezed out. It is the one part of this that has to
        be readable, so it gets its own line and the actions get theirs.
      */}
      {sel ? (
        <div className="map-callout" role="dialog" aria-label={`#${sel.shop_no}`}>
          <div className="map-callout-head">
            <span className="num t-sm med shrink-0">#{sel.shop_no}</span>
            <span className="t-sm truncate flex-1">{[sel.taluk, sel.district].filter(Boolean).join(', ')}</span>
            {/*
              The callout covers the dot that opened it, so "click the dot again"
              is not a way out. This is — along with Escape, and a tap on open map.
            */}
            <button
              className="map-btn map-icon shrink-0"
              onClick={() => onSelect(null)}
              aria-label={strings.closeShop}
              title={strings.closeShop}
            >
              ✕
            </button>
          </div>
          <div className="map-callout-actions">
            <a className="chip map-btn" href={`/shops/${sel.shop_no}`}>{strings.viewShop}</a>
            <a
              className="chip map-btn"
              href={`https://www.google.com/maps/search/?api=1&query=${sel.lat},${sel.lon}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {strings.openInMaps}
            </a>
            <a
              className="chip map-btn"
              href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sel.lat},${sel.lon}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {strings.streetView}
            </a>
          </div>
        </div>
      ) : null}

      {locError ? <div className="label ox map-error">{locError}</div> : null}
    </div>
  );
}
