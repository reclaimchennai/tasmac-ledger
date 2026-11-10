'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { CategoryTag, F } from '@/components/ui';
import { Th, sortHref } from '@/components/sort';
import type { Dir } from '@/lib/queries';
import type { CatDto, BrandDto } from '@/lib/list-dto';

/**
 * Fetch-on-scroll for the long ledgers. Page 0 arrives server-rendered; a
 * sentinel a screen below the fold pulls the next batch from /api/list and
 * appends it, until the list is exhausted. The sentinel sits *after* both the
 * table and the card layouts (only one is ever visible), so it lands at the true
 * bottom of whatever the reader is looking at.
 *
 * Changing a filter or sort is a real navigation — the server sends a fresh
 * page 0 — so this component simply remounts with new `initial` rows; there is
 * no client-side filtering to keep in sync.
 */
function useInfinite<T extends { id: number }>(
  endpoint: string, query: string, initial: T[], total: number,
) {
  const [rows, setRows] = useState<T[]>(initial);
  const [page, setPage] = useState(1); // page 0 was the server render
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initial.length >= total);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${endpoint}?${query}&p=${page}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { rows: T[]; hasMore: boolean };
      setRows((r) => {
        const seen = new Set(r.map((x) => x.id));
        return [...r, ...data.rows.filter((x) => !seen.has(x.id))];
      });
      setPage((p) => p + 1);
      if (!data.hasMore) setDone(true);
    } catch {
      setDone(true); // stop hammering a failing endpoint; the reader can reload
    } finally {
      setLoading(false);
    }
  }, [endpoint, query, page]);

  useEffect(() => {
    if (done || loading) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) loadMore(); },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [done, loading, loadMore]);

  return { rows, loading, done, sentinel };
}

function Sentinel({ loading, done, count, moreLabel, sentinel }: {
  loading: boolean; done: boolean; count: number; moreLabel: string;
  sentinel: RefObject<HTMLDivElement | null>;
}) {
  if (done) return null;
  return (
    <div ref={sentinel} className="lazy-sentinel" role="status" aria-live="polite">
      <span className="label">{loading ? '…' : moreLabel.replace('{n}', String(count))}</span>
    </div>
  );
}

function Flag({ flag, labels }: { flag: 'delisted' | 'registered' | null; labels: CatLabels }) {
  if (!flag) return null;
  return <span className="label br ml-2" style={{ color: flag === 'delisted' ? 'var(--oxblood)' : 'var(--brass, #a8842c)' }}>
    {flag === 'delisted' ? labels.delisted : labels.registered}
  </span>;
}

export interface CatLabels {
  product: string; size: string; category: string; supplier: string; mrp: string;
  shops: string; bottles: string; value: string; more: string; delisted: string; registered: string;
}

export function CatalogueLedger({
  initial, total, query, sortParams, sort, dir, labels, sortBarLabels,
}: {
  initial: CatDto[]; total: number; query: string;
  sortParams: Record<string, string | undefined>;
  sort: string | undefined; dir: Dir | undefined;
  labels: CatLabels;
  sortBarLabels: { value: string; shops: string; mrp: string; product: string };
}) {
  const { rows, loading, done, sentinel } = useInfinite('/api/list', query, initial, total);
  const th = sortHref('/catalogue', sortParams);

  return (
    <>
      <div className="only-wide wrap-x">
        <table className="ledger">
          <thead>
            <tr>
              <Th col="product" label={labels.product} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
              <Th col="size" label={labels.size} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
              <Th col="category" label={labels.category} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
              <Th col="supplier" label={labels.supplier} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
              <Th col="mrp" label={labels.mrp} sort={sort} dir={dir} hrefFor={th} right />
              <Th col="shops" label={labels.shops} sort={sort} dir={dir} hrefFor={th} right />
              <Th col="bottles" label={labels.bottles} sort={sort} dir={dir} hrefFor={th} right />
              <Th col="value" label={labels.value} sort={sort} dir={dir} hrefFor={th} right />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/catalogue/${r.id}`} className="link-ox t-sm">{r.name}</Link>
                  <Flag flag={r.flag} labels={labels} />
                </td>
                <td className="num t-xs br">{r.sizeLabel}</td>
                <td><CategoryTag category={r.category} label={r.categoryLabel} /></td>
                <td className="t-xs dim-2 truncate" style={{ maxWidth: 190 }}>
                  {r.supplierId ? <Link href={`/suppliers/${r.supplierId}`} className="link-ox">{r.supplierName}</Link> : r.supplierName}
                </td>
                <td className="r num med">{r.mrpLabel}</td>
                <td className="r num">{r.shopsLabel}</td>
                <td className="r num">{r.bottlesLabel}</td>
                <td className="r num dim">{r.valueLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="only-narrow">
        <div className="sort-bar mb-3">
          {(['value', 'shops', 'mrp', 'product'] as const).map((c) => (
            <Link key={c} href={th(c, c === 'product' ? 'asc' : 'desc')} className="chip" data-on={sort === c}>
              {sortBarLabels[c]}
            </Link>
          ))}
        </div>
        {rows.map((r) => (
          <Link key={r.id} href={`/catalogue/${r.id}`} className="record">
            <div className="record-head">
              <span className="record-title">{r.name} <span className="num br t-xs">{r.sizeLabel}</span></span>
              <span className="num t-sm med shrink-0">{r.mrpLabel}</span>
            </div>
            <div className="t-xs dim-2 truncate mt-1">{r.supplierName}</div>
            <div className="record-meta">
              <F k={labels.shops} v={r.shopsLabel} />
              <F k={labels.bottles} v={r.bottlesLabel} />
            </div>
            <div className="mt-2 row g-2 wrap">
              <CategoryTag category={r.category} label={r.categoryLabel} />
              <Flag flag={r.flag} labels={labels} />
            </div>
          </Link>
        ))}
      </div>

      <Sentinel loading={loading} done={done} count={total - rows.length} moreLabel={labels.more} sentinel={sentinel} />
    </>
  );
}

export interface BrandLabels {
  brand: string; types: string; sizes: string; madeBy: string; price: string;
  shops: string; value: string; bottles: string; more: string;
}

export function BrandLedger({
  initial, total, query, sortParams, sort, dir, labels, sortBarLabels,
}: {
  initial: BrandDto[]; total: number; query: string;
  sortParams: Record<string, string | undefined>;
  sort: string | undefined; dir: Dir | undefined;
  labels: BrandLabels;
  sortBarLabels: { value: string; shops: string; price: string; brand: string };
}) {
  const { rows, loading, done, sentinel } = useInfinite('/api/list', query, initial, total);
  const th = sortHref('/brands', sortParams);

  return (
    <>
      <div className="only-wide wrap-x">
        <table className="ledger">
          <thead>
            <tr>
              <Th col="brand" label={labels.brand} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
              <Th col="types" label={labels.types} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
              <Th col="sizes" label={labels.sizes} sort={sort} dir={dir} hrefFor={th} />
              <Th col="made_by" label={labels.madeBy} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
              <Th col="price" label={labels.price} sort={sort} dir={dir} hrefFor={th} right />
              <Th col="shops" label={labels.shops} sort={sort} dir={dir} hrefFor={th} right />
              <Th col="value" label={labels.value} sort={sort} dir={dir} hrefFor={th} right />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><Link href={`/brands/${b.id}`} className="link-ox t-sm">{b.name}</Link></td>
                <td className="label" style={{ letterSpacing: '0.08em' }}>{b.typesLabel}</td>
                <td className="num t-xs br truncate" style={{ maxWidth: 150 }}>{b.sizesLabel}</td>
                <td className="t-xs dim-2 truncate" style={{ maxWidth: 180 }}>
                  {b.supplierId ? <Link href={`/suppliers/${b.supplierId}`} className="link-ox">{b.supplierName}</Link> : '—'}
                </td>
                <td className="r num">{b.priceLabel}</td>
                <td className="r num">{b.shopsLabel}</td>
                <td className="r num med">{b.valueLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="only-narrow">
        <div className="sort-bar mb-3">
          {(['value', 'shops', 'price', 'brand'] as const).map((c) => (
            <Link key={c} href={th(c, c === 'brand' ? 'asc' : 'desc')} className="chip" data-on={sort === c}>
              {sortBarLabels[c]}
            </Link>
          ))}
        </div>
        {rows.map((b) => (
          <Link key={b.id} href={`/brands/${b.id}`} className="record">
            <div className="record-head">
              <span className="record-title">{b.name}</span>
              <span className="num t-sm med shrink-0">{b.valueLabel}</span>
            </div>
            <div className="t-xs dim-2 truncate mt-1">{b.supplierName}</div>
            <div className="record-meta">
              <F k={labels.price} v={b.priceLabel} />
              <F k={labels.sizes} v={b.variants} />
              <F k={labels.shops} v={b.shopsLabel} />
              <F k={labels.bottles} v={b.bottlesLabel} />
            </div>
          </Link>
        ))}
      </div>

      <Sentinel loading={loading} done={done} count={total - rows.length} moreLabel={labels.more} sentinel={sentinel} />
    </>
  );
}
