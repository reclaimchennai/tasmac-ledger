import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { Dir } from '@/lib/queries';

/**
 * A sortable ledger heading.
 *
 * Rendered as a link rather than a button so sorting stays in the URL: a sorted
 * view can be shared, bookmarked and reached by the back button, and the whole
 * thing keeps working before any JavaScript arrives. The current column shows
 * its direction; the rest show a faint hint that they can be clicked at all.
 */
export function Th({
  col,
  label,
  sort,
  dir,
  hrefFor,
  right,
  defaultDir = 'desc',
  style,
}: {
  /** Column key, matched against the query's own whitelist. */
  col: string;
  label: ReactNode;
  sort: string | undefined;
  dir: Dir | undefined;
  hrefFor: (col: string, dir: Dir) => string;
  right?: boolean;
  /**
   * Which way the first click sorts. Money and counts open descending — the
   * reader wants the biggest first; names open A–Z.
   */
  defaultDir?: Dir;
  style?: CSSProperties;
}) {
  const on = sort === col;
  const current: Dir = on ? (dir ?? defaultDir) : defaultDir;
  const next: Dir = on ? (current === 'asc' ? 'desc' : 'asc') : defaultDir;

  return (
    <th
      className={right ? 'r' : undefined}
      style={style}
      aria-sort={on ? (current === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Link href={hrefFor(col, next)} className="th-sort" data-on={on || undefined} scroll={false}>
        <span>{label}</span>
        <span className="th-arrow" aria-hidden>
          {on ? (current === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </Link>
    </th>
  );
}

/**
 * Build the `hrefFor` a page hands to its headings: keep every other query
 * parameter, set the sort, and drop the page number — a re-sorted list should
 * start at its own first page, not at whatever offset the reader had reached.
 */
export function sortHref(
  base: string,
  params: Record<string, string | number | undefined>,
): (col: string, dir: Dir) => string {
  return (col, dir) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = { ...params, s: col, d: dir, p: undefined };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || v === 0) continue;
      p.set(k, String(v));
    }
    return `${base}${p.toString() ? `?${p}` : ''}`;
  };
}
