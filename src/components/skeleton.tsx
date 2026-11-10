/**
 * Route-level placeholder.
 *
 * Every page here is `force-dynamic` and reads SQLite on the server, so a
 * navigation has a real gap in it. Next streams this in the moment the reader
 * clicks, then swaps in the page — which turns the gap from "nothing happened"
 * into "it is coming". Shaped like the ledger it precedes, so nothing shifts
 * when the real rows land.
 */
export function LedgerSkeleton({ rows = 12, title = true }: { rows?: number; title?: boolean }) {
  return (
    <section className="pt-8" aria-busy="true" aria-live="polite">
      {title ? (
        <div className="rule-b pb-4 mb-4" style={{ paddingBottom: 12 }}>
          <div className="skeleton" style={{ width: 180, height: 26 }} />
        </div>
      ) : null}
      <div className="skeleton mb-3" style={{ height: 38 }} />
      <div className="row g-2 mb-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton" style={{ width: 62, height: 30 }} />
        ))}
      </div>
      <div className="col g-1">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height: 34,
              // A little variation stops the block reading as a solid slab.
              opacity: 1 - i * (0.5 / rows),
            }}
          />
        ))}
      </div>
    </section>
  );
}

/** For the detail pages, which open on a headline and a block of figures. */
export function DetailSkeleton() {
  return (
    <section className="pt-8" aria-busy="true" aria-live="polite">
      <div className="skeleton mb-4" style={{ width: 140, height: 12 }} />
      <div className="skeleton mb-3" style={{ width: '70%', height: 54 }} />
      <div className="skeleton mb-6" style={{ width: '45%', height: 16 }} />
      <div className="grid gc-4 g-4 mb-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 84 }} />
        ))}
      </div>
      <div className="col g-1">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 34, opacity: 1 - i * 0.06 }} />
        ))}
      </div>
    </section>
  );
}
