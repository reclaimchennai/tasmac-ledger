/**
 * The map's key, sitting above the map rather than on it.
 *
 * In its own file, not `shop-map.tsx`: the map is dynamically imported and
 * client-only, and importing the key from there would drag the whole map bundle
 * into the initial payload to render four coloured squares. Here it is plain
 * markup that renders on the server with the rest of the page.
 *
 * Google's attribution deliberately stays *on* the map — that is where the terms
 * put it, and it has to travel with the tiles rather than with the key.
 */

const CLASS_COLOR: Record<string, string> = {
  trading: 'var(--verdigris)',
  stopped: 'var(--oxblood)',
  closed: 'var(--flag)',
};

export function MapLegend({
  classes,
  sizeKey,
}: {
  classes: Record<string, string>;
  sizeKey: string;
}) {
  return (
    <div className="map-key">
      {(['trading', 'stopped', 'closed'] as const).map((k) => (
        <span key={k} className="label row g-1 nowrap">
          <span
            className="shrink-0"
            style={{ width: 8, height: 8, background: CLASS_COLOR[k], display: 'inline-block' }}
          />
          {classes[k] ?? k}
        </span>
      ))}
      {/* Size is the map's second variable and the less obvious one, so the key
          shows it with the sizes themselves rather than describing it. */}
      <span className="label row g-1 nowrap">
        <svg width="28" height="10" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
          <circle cx="3" cy="5" r="1.8" fill="var(--ink-3)" />
          <circle cx="11" cy="5" r="3" fill="var(--ink-3)" />
          <circle cx="22" cy="5" r="4.6" fill="var(--ink-3)" />
        </svg>
        {sizeKey}
      </span>
    </div>
  );
}
