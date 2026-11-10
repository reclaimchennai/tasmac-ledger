/**
 * Flags for the language toggle.
 *
 * Drawn as inline SVG rather than loaded as images or set as emoji: they are two
 * small shapes, they have to hold up at 20px inside a chip, and emoji flags do
 * not render at all on Windows. Both are `aria-hidden` — the button carries the
 * language name for anyone not looking at the picture.
 */

const BOX = { width: 22, height: 14 } as const;

/** Union Flag, standing for English. */
export function UnionFlag({ className }: { className?: string }) {
  return (
    <svg
      {...BOX}
      viewBox="0 0 60 36"
      className={className}
      aria-hidden
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="60" height="36" fill="#012169" />
      {/* Saltire, white then red, drawn as clipped diagonals. */}
      <g clipPath="url(#uf-clip)">
        <clipPath id="uf-clip"><rect width="60" height="36" /></clipPath>
        <path d="M0,0 L60,36 M60,0 L0,36" stroke="#fff" strokeWidth="7.2" />
        {/* The red saltire is counterchanged — offset to one side of the white
            on each arm — which is what stops it reading as a plain X. */}
        <path d="M0,0 L60,36" stroke="#C8102E" strokeWidth="2.4" clipPath="url(#uf-tl)" />
        <path d="M60,0 L0,36" stroke="#C8102E" strokeWidth="2.4" clipPath="url(#uf-tr)" />
        <clipPath id="uf-tl"><polygon points="0,0 30,0 30,18 60,18 60,36 30,36 30,18 0,18" /></clipPath>
        <clipPath id="uf-tr"><polygon points="30,0 60,0 60,18 30,18 30,36 0,36 0,18 30,18" /></clipPath>
      </g>
      {/* Cross of St George. */}
      <path d="M30,0 V36 M0,18 H60" stroke="#fff" strokeWidth="12" />
      <path d="M30,0 V36 M0,18 H60" stroke="#C8102E" strokeWidth="7.2" />
    </svg>
  );
}

/**
 * The Chola tiger flag, standing for Tamil.
 *
 * The published emblem from Wikimedia Commons, served from `public/` rather than
 * redrawn: the leaping tiger is a specific piece of artwork, and a hand-traced
 * approximation of it would be both wrong and worse. Scaled down to 88px wide at
 * build time so the header is not paying for a 600px image to fill 22 of them.
 *
 * Plain `<img>` rather than `next/image` — it is a fixed-size decoration in the
 * masthead on every page, and the optimiser's runtime would cost more than the
 * 5 KB file.
 */
export function TamilFlag({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/flag-chola.png"
      alt=""
      {...BOX}
      className={className}
      aria-hidden
      draggable={false}
      style={{ display: 'block', flexShrink: 0, objectFit: 'cover' }}
    />
  );
}
