'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { MapStrings, Point, Viewport } from './shop-map';
import { MapLegend } from './map-legend';
import { F, SectionHead } from './ui';
import { compactCount, count, inr, stamp } from '@/lib/format';

/*
  The map is the heaviest thing on the site and the only part that talks to the
  network after load, so it is code-split: the ledger renders and is readable
  while the map's JavaScript is still arriving. `ssr: false` because it is all
  measurement and pointer handling — there is nothing for the server to usefully
  produce, and rendering a guess would only be thrown away on hydration.
*/
const ShopMap = dynamic(() => import('./shop-map').then((m) => m.ShopMap), {
  ssr: false,
  loading: () => <div className="map-placeholder rule-t rule-b" />,
});

export interface ShopRowLite {
  shop_no: number;
  lat: number | null;
  lon: number | null;
  taluk: string | null;
  taluk_id: number | null;
  district: string | null;
  district_id: number | null;
  address: string | null;
  trading_status: string | null;
  units: number | null;
  value_paise: number | null;
  sku_count: number | null;
  reported_at: string | null;
}

export interface ExplorerStrings {
  /* Carried through so the clock column formats in the reader's language: this
     runs in the browser, where the language cookie is not being read. */
  lang: 'en' | 'ta';
  title: string;
  note: string;
  search: string;
  emptyView: string;
  clearFilter: string;
  countLine: string;
  onShelves: string;
  scopeStatewide: string;
  scopeInView: string;
  scopeShop: string;
  all: string;
  showMore: string;
  cols: {
    shop: string; class: string; where: string; address: string;
    skus: string; bottles: string; value: string; counted: string;
  };
  classes: Record<string, string>;
  map: MapStrings;
}

const CLASS_COLOUR: Record<string, string> = {
  trading: 'var(--verdigris)',
  stopped: 'var(--oxblood)',
  closed: 'var(--flag)',
};

/** Every column the ledger can be ordered by, and how to read a value out of a row. */
type SortKey = 'shop' | 'class' | 'where' | 'address' | 'skus' | 'bottles' | 'value' | 'counted';

const VALUE_OF: Record<SortKey, (r: ShopRowLite) => string | number | null> = {
  shop: (r) => r.shop_no,
  class: (r) => r.trading_status ?? '',
  where: (r) => `${r.taluk ?? ''} ${r.district ?? ''}`,
  address: (r) => r.address ?? '',
  skus: (r) => r.sku_count,
  bottles: (r) => r.units,
  value: (r) => r.value_paise,
  counted: (r) => r.reported_at,
};

/** Names sort A–Z on the first click; quantities sort biggest-first. */
const DEFAULT_DIR: Record<SortKey, 'asc' | 'desc'> = {
  shop: 'asc', class: 'asc', where: 'asc', address: 'asc',
  skus: 'desc', bottles: 'desc', value: 'desc', counted: 'desc',
};

const PAGE = 60;

/**
 * Map on top, ledger underneath, one shared filter state. Panning or zooming the
 * map narrows the ledger to what is on screen; clicking a dot pins a single shop.
 * The full row set is delivered once and filtered client-side — 4,850 rows is
 * small enough that a round trip per pan would be slower and worse — and only
 * the rows near the viewport are actually laid out.
 */
export function ShopsExplorer({
  rows,
  classes,
  strings,
}: {
  rows: ShopRowLite[];
  classes: { key: string; n: number }[];
  strings: ExplorerStrings;
}) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cls, setCls] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<SortKey>('shop');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  // The map points are the coordinate subset of the rows — derived here rather
  // than shipped a second time from the server, which used to double the payload.
  const points = useMemo<Point[]>(
    () => rows
      .filter((r) => r.lat != null && r.lon != null)
      .map((r) => ({
        shop_no: r.shop_no, lat: r.lat as number, lon: r.lon as number,
        trading_status: r.trading_status, taluk: r.taluk, district: r.district, units: r.units,
      })),
    [rows],
  );

  const filteredPoints = useMemo(
    () => (cls ? points.filter((p) => p.trading_status === cls) : points),
    [points, cls],
  );

  // Search stays responsive: filtering runs against the deferred term, so a
  // keystroke paints immediately and the (cheap) refilter follows.
  const deferredTerm = useDeferredValue(term);

  const filtered = useMemo(() => {
    const q = deferredTerm.trim().toLowerCase();
    let out = rows;
    if (cls) out = out.filter((r) => r.trading_status === cls);
    if (selected != null) out = out.filter((r) => r.shop_no === selected);
    else if (viewport) {
      out = out.filter(
        (r) =>
          r.lat != null && r.lon != null &&
          r.lat >= viewport.south && r.lat <= viewport.north &&
          r.lon >= viewport.west && r.lon <= viewport.east,
      );
    }
    if (q) {
      out = out.filter(
        (r) =>
          String(r.shop_no).includes(q) ||
          r.address?.toLowerCase().includes(q) ||
          r.taluk?.toLowerCase().includes(q) ||
          r.district?.toLowerCase().includes(q),
      );
    }

    // Trading shops first whichever column is chosen. Ordering purely by shop
    // number would open the list on a run of closed shops, which reads as though
    // the data were empty.
    const read = VALUE_OF[sort];
    const sign = dir === 'asc' ? 1 : -1;
    const trading = (r: ShopRowLite) => (r.sku_count ? 0 : 1);

    return [...out].sort((a, b) => {
      const byTrading = trading(a) - trading(b);
      if (byTrading) return byTrading;
      const av = read(a);
      const bv = read(b);
      // Absent readings sink to the bottom in both directions — a shop that did
      // not report is missing data, not a zero.
      if (av == null && bv == null) return a.shop_no - b.shop_no;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return cmp * sign || a.shop_no - b.shop_no;
    });
  }, [rows, cls, selected, viewport, deferredTerm, sort, dir]);

  // Only build the rows near the top of the list into the DOM. Rendering all
  // ~4,850 (twice, table + cards) is what made this page multi-megabyte and made
  // every keystroke rebuild thousands of nodes; a sentinel below the fold grows
  // the window as the reader scrolls.
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [filtered]);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown >= filtered.length) return;
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setShown((n) => Math.min(filtered.length, n + PAGE)); },
      { rootMargin: '700px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, filtered.length]);
  const visible = filtered.slice(0, shown);

  const clickSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDir(DEFAULT_DIR[key]); }
  };

  const scope = selected != null
    ? strings.scopeShop.replace('{n}', String(selected))
    : viewport ? strings.scopeInView : strings.scopeStatewide;

  const shelfValue = filtered.reduce((a, r) => a + (r.value_paise ?? 0), 0);

  const head = (key: SortKey, label: string, right?: boolean) => (
    <th className={right ? 'r' : undefined} aria-sort={sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" data-on={sort === key || undefined} onClick={() => clickSort(key)}>
        <span>{label}</span>
        <span className="th-arrow" aria-hidden>{sort === key ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );

  return (
    <>
      <section className="pt-6">
        <SectionHead title={strings.title} note={strings.note.replace('{n}', count(points.length))} />
        <MapLegend classes={strings.classes} sizeKey={strings.map.sizeKey} />
        <ShopMap
          points={filteredPoints}
          onViewportChange={setViewport}
          selected={selected}
          onSelect={setSelected}
          strings={strings.map}
        />
      </section>

      <section className="section mt-4">
        <div className="row g-2 mb-3">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={strings.search}
            className="field flex-1"
            type="search"
          />
        </div>

        <div className="chip-row mb-3">
          <button className="chip" data-on={!cls} onClick={() => setCls(null)}>
            {strings.all} {count(points.length)}
          </button>
          {classes.map((c) => (
            <button key={c.key} className="chip" data-on={cls === c.key} onClick={() => setCls(c.key)}>
              {strings.classes[c.key] ?? c.key} {count(c.n)}
            </button>
          ))}
          {(viewport || selected != null) && (
            <button
              className="chip"
              onClick={() => { setViewport(null); setSelected(null); }}
              style={{ borderColor: 'var(--oxblood)', color: 'var(--oxblood)' }}
            >
              {strings.clearFilter}
            </button>
          )}
        </div>

        {/* Wraps rather than colliding: the two halves are long in Tamil and on
            a narrow phone, and they were running into each other. */}
        <div className="row between wrap g-3 mb-3">
          <span className="label">
            {strings.countLine.replace('{n}', count(filtered.length)).replace('{scope}', scope)}
          </span>
          <span className="label">
            {strings.onShelves.replace('{v}', inr(shelfValue, { compact: true, lang: strings.lang }))}
          </span>
        </div>


        {filtered.length === 0 ? (
          <div className="label" style={{ padding: '48px 0', textAlign: 'center' }}>{strings.emptyView}</div>
        ) : (
          <>
            <div className="only-wide wrap-x">
              <table className="ledger">
                <thead>
                  <tr>
                    {head('shop', strings.cols.shop)}
                    {head('class', strings.cols.class)}
                    {head('where', strings.cols.where)}
                    {head('address', strings.cols.address)}
                    {head('skus', strings.cols.skus, true)}
                    {head('bottles', strings.cols.bottles, true)}
                    {head('value', strings.cols.value, true)}
                    {head('counted', strings.cols.counted, true)}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                      <tr key={s.shop_no}>
                        <td><Link href={`/shops/${s.shop_no}`} className="link-ox num">#{s.shop_no}</Link></td>
                        <td>
                          <span className="label" style={{ color: CLASS_COLOUR[s.trading_status ?? 'trading'] ?? 'var(--ink-3)' }}>
                            {strings.classes[s.trading_status ?? 'trading'] ?? '—'}
                          </span>
                        </td>
                        <td className="t-sm">{s.taluk ?? '—'}<span className="dim-2">, {s.district ?? '—'}</span></td>
                        <td className="t-xs dim-2 truncate" style={{ maxWidth: 240 }}>{s.address ?? '—'}</td>
                        <td className="r num">{s.sku_count ?? '—'}</td>
                        <td className="r num">{s.units != null ? compactCount(s.units, strings.lang) : '—'}</td>
                        <td className="r num med">{s.value_paise != null ? inr(s.value_paise, { compact: true, lang: strings.lang }) : '—'}</td>
                        <td className="r num t-xs dim-2">{stamp(s.reported_at, { withDate: false, lang: strings.lang })}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="only-narrow">
              <div className="sort-bar mb-3">
                {(['shop', 'value', 'bottles', 'skus', 'counted'] as const).map((k) => (
                  <button key={k} className="chip" data-on={sort === k} onClick={() => clickSort(k)}>
                    {strings.cols[k]} {sort === k ? (dir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                ))}
              </div>
              {visible.map((s) => (
                  <Link key={s.shop_no} href={`/shops/${s.shop_no}`} className="record">
                    <div className="record-head">
                      <span className="record-title">
                        <span className="num ox">#{s.shop_no}</span> {s.taluk ?? ''}
                      </span>
                      <span className="num t-sm med shrink-0">
                        {s.value_paise != null ? inr(s.value_paise, { compact: true, lang: strings.lang }) : '—'}
                      </span>
                    </div>
                    <div className="t-xs dim-2 truncate mt-1">{s.address ?? s.district ?? ''}</div>
                    <div className="record-meta">
                      <F k={strings.cols.class} v={strings.classes[s.trading_status ?? 'trading'] ?? '—'} />
                      <F k={strings.cols.skus} v={s.sku_count ?? '—'} />
                      <F k={strings.cols.bottles} v={s.units != null ? compactCount(s.units, strings.lang) : '—'} />
                    </div>
                  </Link>
                ))}
            </div>

            {shown < filtered.length ? (
              <div ref={moreRef} className="lazy-sentinel" role="status" aria-live="polite">
                <span className="label">{count(filtered.length - shown)} {strings.showMore}</span>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
