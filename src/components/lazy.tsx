'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Progressive reveal for long ledgers.
 *
 * The rows are already in the document — they came down with the page and cost
 * nothing more to keep — so this is not about fetching, it is about not asking
 * the browser to lay out and paint four thousand table rows before the reader
 * has seen the first twenty. A sentinel below the last visible row extends the
 * window as it comes into view, one screenful ahead of the scroll.
 *
 * Without JavaScript every row renders, which is the correct fallback: a slow
 * page beats a truncated one, and search engines see the whole ledger.
 */
export function LazyList({
  children,
  initial = 40,
  step = 40,
  label,
}: {
  children: ReactNode[];
  initial?: number;
  step?: number;
  /** Announced to assistive tech when more rows arrive. */
  label?: string;
}) {
  const [shown, setShown] = useState(initial);
  const [hydrated, setHydrated] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // Until hydration the full list is in the DOM; trimming it is the first thing
  // that happens once the browser is actually driving.
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated || shown >= children.length) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setShown((n) => Math.min(children.length, n + step)); },
      // Start the next batch a screen early, so the reader never meets the edge.
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hydrated, shown, step, children.length]);

  const visible = hydrated ? children.slice(0, shown) : children;

  return (
    <>
      {visible}
      {hydrated && shown < children.length ? (
        <div ref={sentinel} className="lazy-sentinel" role="status" aria-live="polite">
          <span className="label">{label ?? `${children.length - shown} more`}</span>
        </div>
      ) : null}
    </>
  );
}

/**
 * The same thing for table bodies, where a `<div>` sentinel would be invalid
 * markup — the sentinel has to be a row.
 */
export function LazyRows({
  children,
  initial = 40,
  step = 40,
  colSpan,
  label,
}: {
  children: ReactNode[];
  initial?: number;
  step?: number;
  colSpan: number;
  label?: string;
}) {
  const [shown, setShown] = useState(initial);
  const [hydrated, setHydrated] = useState(false);
  const sentinel = useRef<HTMLTableRowElement>(null);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated || shown >= children.length) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setShown((n) => Math.min(children.length, n + step)); },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hydrated, shown, step, children.length]);

  const visible = hydrated ? children.slice(0, shown) : children;

  return (
    <>
      {visible}
      {hydrated && shown < children.length ? (
        <tr ref={sentinel} className="lazy-sentinel-row">
          <td colSpan={colSpan}>
            <span className="label">{label ?? `${children.length - shown} more`}</span>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * Defer anything expensive until it is near the viewport — used for the charts
 * and traces further down a page, which are pure decoration until scrolled to.
 */
export function WhenVisible({
  children,
  placeholder,
  minHeight = 140,
}: {
  children: ReactNode;
  placeholder?: ReactNode;
  minHeight?: number;
}) {
  const [seen, setSeen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return (
    <div ref={box} style={seen ? undefined : { minHeight }}>
      {seen ? children : placeholder ?? null}
    </div>
  );
}
