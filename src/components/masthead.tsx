'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LangSwitch } from './lang-switch';
import type { Lang } from '@/lib/i18n-shared';

/**
 * Six destinations do not fit across a phone header, so they don't go there.
 * Wide screens get the horizontal rail; phones get a five-slot bottom tab bar
 * within thumb reach, with the sixth destination reachable from search and from
 * links in the pages themselves.
 *
 * Labels arrive from the server rather than being looked up here: the whole page
 * is server-rendered against the reader's language cookie, and translating in
 * the client would mean a flash of English on every navigation.
 */

export interface NavLabels {
  ledger: string;
  shops: string;
  catalogue: string;
  brands: string;
  districts: string;
  suppliers: string;
  db: string;
  shortDb: string;
  shortCatalogue: string;
  shortDistricts: string;
  mark: string;
  /** Longest to shortest; the field picks whichever fits the width it is given. */
  searchPlaceholders: [string, string, string];
  searchAria: string;
  toDark: string;
  toLight: string;
}

const isOn = (path: string, href: string) => (href === '/' ? path === '/' : path.startsWith(href));

function navItems(l: NavLabels) {
  return [
    { href: '/', label: l.ledger, tab: true },
    { href: '/shops', label: l.shops, tab: true },
    { href: '/catalogue', label: l.catalogue, short: l.shortCatalogue, tab: true },
    { href: '/brands', label: l.brands, tab: true },
    { href: '/districts', label: l.districts, short: l.shortDistricts, tab: true },
    { href: '/suppliers', label: l.suppliers, tab: false },
    { href: '/db', label: l.db, short: l.shortDb, tab: true },
  ];
}

export function Masthead({ labels, lang }: { labels: NavLabels; lang: Lang }) {
  const path = usePathname();
  const header = useRef<HTMLElement>(null);

  /*
    Publish the masthead's real height so the sticky ledger headings can park
    directly beneath it. It changes with the breakpoint and with the Tamil line
    height, so it is measured rather than hard-coded.
  */
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      document.documentElement.style.setProperty('--masthead-h', `${Math.round(e.contentRect.height)}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="masthead" ref={header}>
      <div className="container">
        <div className="masthead-inner">
          <Link href="/" className="row-b g-2 shrink-0">
            <span className="wordmark">TASMAC</span>
            <span className="label ox mark">{labels.mark}</span>
          </Link>
          <div className="row g-2 flex-1 shrink-0" style={{ justifyContent: 'flex-end' }}>
            <Search placeholders={labels.searchPlaceholders} aria={labels.searchAria} />
            <LangSwitch lang={lang} />
            <ThemeToggle toDark={labels.toDark} toLight={labels.toLight} />
          </div>
        </div>

        <nav className="nav-rail">
          {navItems(labels).map((item) => (
            <Link key={item.href} href={item.href} data-on={isOn(path, item.href)}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function TabBar({ labels }: { labels: NavLabels }) {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Primary">
      {navItems(labels).filter((n) => n.tab).map((item) => {
        const on = isOn(path, item.href);
        return (
          <Link key={item.href} href={item.href} data-on={on}>
            <span className="tick" />
            {item.short ?? item.label}
          </Link>
        );
      })}
    </nav>
  );
}

interface Hit { kind: string; id: number; title: string; subtitle: string }

const HREF: Record<string, (id: number) => string> = {
  shop: (id) => `/shops/${id}`,
  sku: (id) => `/catalogue/${id}`,
  brand: (id) => `/brands/${id}`,
  supplier: (id) => `/suppliers/${id}`,
};

/**
 * Widest placeholder that fits, measured rather than guessed.
 *
 * A media query would be the cheap answer and the wrong one: the field shares a
 * row with the wordmark and two buttons, so how much room it has depends on
 * those as much as on the viewport, and the Tamil strings set noticeably wider
 * than the English ones at the same size. So the candidates are measured in the
 * field's own font and the longest one that clears its width wins.
 */
function useFittedPlaceholder(candidates: readonly string[], input: React.RefObject<HTMLInputElement | null>) {
  const [text, setText] = useState(candidates[candidates.length - 1]);

  useEffect(() => {
    const el = input.current;
    if (!el) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fit = () => {
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      // The padding is inside the width, and a little slack keeps the last
      // character clear of the caret rather than flush against it.
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 6;
      setText(candidates.find((c) => ctx.measureText(c).width <= room) ?? candidates[candidates.length - 1]);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // Re-measure once the webfont lands: fallback metrics differ enough to flip
    // which candidate fits.
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [candidates, input]);

  return text;
}

function Search({ placeholders, aria }: { placeholders: readonly string[]; aria: string }) {
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const placeholder = useFittedPlaceholder(placeholders, input);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: Hit[]) => { setHits(d); setCursor(0); setOpen(true); })
        .catch(() => {});
    }, 140);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [term]);

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); input.current?.focus(); }
      if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  const go = (h: Hit) => {
    setOpen(false);
    setTerm('');
    input.current?.blur();
    router.push(HREF[h.kind]?.(h.id) ?? '/');
  };

  return (
    <div ref={box} className="search-wrap">
      <input
        ref={input}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !hits.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % hits.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + hits.length) % hits.length); }
          if (e.key === 'Enter') { e.preventDefault(); go(hits[cursor]); }
        }}
        placeholder={placeholder}
        className="field"
        type="search"
        enterKeyHint="search"
        aria-label={aria}
      />

      {open && hits.length > 0 && (
        <div className="search-results">
          {hits.map((h, i) => (
            <button
              key={`${h.kind}-${h.id}-${i}`}
              onClick={() => go(h)}
              onMouseEnter={() => setCursor(i)}
              className="search-hit"
              data-cursor={i === cursor}
            >
              <span className="row-b between g-3">
                <span className="t-sm truncate">{h.title}</span>
                <span className="label ox shrink-0">{h.kind}</span>
              </span>
              <span className="t-xs dim-2 truncate" style={{ display: 'block' }}>{h.subtitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeToggle({ toDark, toLight }: { toDark: string; toLight: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.dataset.theme === 'dark'); }, []);
  return (
    <button
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? 'dark' : 'light';
        try { localStorage.setItem('tasmac-theme', next ? 'dark' : 'light'); } catch {}
      }}
      className="chip shrink-0"
      aria-label={dark ? toLight : toDark}
    >
      {dark ? '◐' : '◑'}
    </button>
  );
}
