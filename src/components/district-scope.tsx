'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

/**
 * District scope for the homepage.
 *
 * The whole page is server-rendered against SQLite, so narrowing it to a
 * district is a server round trip however it is triggered. What makes it feel
 * like an in-place filter rather than a page load is `useTransition` around
 * `router.replace`: React keeps the current tree mounted and interactive while
 * the new one streams in, then swaps it. Nothing unmounts, the scroll position
 * is untouched (`scroll: false`), and the only visible sign of the wait is the
 * fade `ScopeFade` puts on the figures that are about to change.
 *
 * The scope lives in the URL rather than in state so a filtered view is a
 * shareable link and the back button steps through it. Everything is bundled
 * here — provider, trigger and fade — because the trigger sits in the kicker
 * line and the fade wraps the sections underneath it, and they have to share
 * one transition.
 */

interface Scope {
  pending: boolean;
  go: (districtId: number | null) => void;
}

const ScopeCtx = createContext<Scope>({ pending: false, go: () => {} });

export function DistrictScope({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = useCallback(
    (districtId: number | null) => {
      start(() => {
        // The homepage carries no other query state, so the URL can be rebuilt
        // rather than merged — and `scroll: false` is what keeps the reader
        // where they were instead of jumping to the top on every pick.
        router.replace(districtId == null ? '/' : `/?d=${districtId}`, { scroll: false });
      });
    },
    [router],
  );

  return <ScopeCtx.Provider value={{ pending, go }}>{children}</ScopeCtx.Provider>;
}

/**
 * Dims whatever it wraps while the next scope is in flight.
 *
 * Takes the className of the element it replaces so it can *be* the grid or
 * section wrapper rather than adding a layer inside it — an extra div between a
 * grid and its cells would break the layout.
 */
export function ScopeFade({ className, children }: { className?: string; children: ReactNode }) {
  const { pending } = useContext(ScopeCtx);
  return (
    <div className={className ? `scope-body ${className}` : 'scope-body'} data-pending={pending || undefined}>
      {children}
    </div>
  );
}

export interface DistrictOption {
  district_id: number;
  name: string;
}

/**
 * The picker itself.
 *
 * Reads as part of the sentence it sits in — an underlined stretch of the
 * kicker line — and opens a listbox. The list is alphabetical and opens
 * scrolled so the active district sits in the middle of the viewport, with
 * neighbours visible above and below, so it is obvious the list runs both ways
 * rather than starting where it happens to be scrolled.
 */
export function DistrictSelect({
  options,
  value,
  focusId,
  allLabel,
  ariaLabel,
}: {
  options: DistrictOption[];
  value: number | null;
  /** Centred on open when nothing is selected — Chennai. */
  focusId: number | null;
  allLabel: string;
  ariaLabel: string;
}) {
  const { pending, go } = useContext(ScopeCtx);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(value);
  const rootRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // `null` is the "all districts" row, so the keyboard walks one flat list.
  const ids: (number | null)[] = [null, ...options.map((o) => o.district_id)];
  const current = value == null ? null : options.find((o) => o.district_id === value) ?? null;
  const label = current ? current.name : allLabel;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const pick = useCallback(
    (id: number | null) => {
      close();
      if (id !== value) go(id);
    },
    [close, go, value],
  );

  // Open through here, never with a bare `setOpen(true)`: the highlighted row
  // has to be settled in the same render that first paints the list, or the
  // layout effect below measures the previous one and centres the wrong row.
  const openMenu = useCallback(() => {
    setActive(value ?? focusId ?? null);
    setOpen(true);
  }, [value, focusId]);

  // Centre that row before paint, so the list is never seen at the top and then
  // jumping. Read off the id rather than `[data-active]` so this does not
  // depend on the state having flushed.
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-id="${value ?? focusId ?? 'all'}"]`);
    if (!list || !row) return;
    list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
  }, [open, value, focusId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture, so a pick inside a scroll container still closes cleanly.
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  /** Highlight a row and keep it in view — every keyboard move goes through here. */
  const moveTo = (id: number | null) => {
    setActive(id);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-id="${id ?? 'all'}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const step = (delta: number) => {
    const at = ids.indexOf(active ?? null);
    moveTo(ids[Math.min(ids.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta))]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'Escape': e.preventDefault(); close(); break;
      case 'ArrowDown': e.preventDefault(); step(1); break;
      case 'ArrowUp': e.preventDefault(); step(-1); break;
      case 'Home': e.preventDefault(); moveTo(ids[0]); break;
      case 'End': e.preventDefault(); moveTo(ids[ids.length - 1]); break;
      case 'Enter':
      case ' ': e.preventDefault(); pick(active ?? null); break;
    }
  };

  return (
    <span className="scope-pick" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="scope-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? 'scope-list' : undefined}
        aria-activedescendant={open ? `scope-opt-${active ?? 'all'}` : undefined}
        aria-label={`${ariaLabel}: ${label}`}
        data-pending={pending || undefined}
        onClick={() => (open ? close(false) : openMenu())}
      >
        {label}
        <svg className="scope-caret" width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
          <path d="M1 1l3.5 3.5L8 1" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>

      {open && (
        <div className="scope-pop" id="scope-list" role="listbox" aria-label={ariaLabel} ref={listRef} tabIndex={-1}>
          <button
            type="button"
            role="option"
            id="scope-opt-all"
            aria-selected={value == null}
            data-id="all"
            data-active={active == null || undefined}
            data-on={value == null || undefined}
            className="scope-opt scope-opt-all"
            onClick={() => pick(null)}
            onPointerEnter={() => setActive(null)}
          >
            {allLabel}
          </button>
          {options.map((o) => (
            <button
              key={o.district_id}
              type="button"
              role="option"
              id={`scope-opt-${o.district_id}`}
              aria-selected={value === o.district_id}
              data-id={o.district_id}
              data-active={active === o.district_id || undefined}
              data-on={value === o.district_id || undefined}
              className="scope-opt"
              onClick={() => pick(o.district_id)}
              onPointerEnter={() => setActive(o.district_id)}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
