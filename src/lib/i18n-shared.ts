/**
 * The parts of the language setup both sides of the render need.
 *
 * Kept out of `i18n.ts` because that file is `server-only` — it reaches for
 * cookies and the database — while the language toggle is a client component and
 * still needs to know what the languages are.
 */

export type Lang = 'en' | 'ta';

export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ta', label: 'தமிழ்', native: 'தமிழ்' },
];

export const LANG_COOKIE = 'tasmac-lang';

export function isLang(v: string | undefined): v is Lang {
  return v === 'en' || v === 'ta';
}

/** `lang` attribute for the document, so screen readers and hyphenation follow. */
export const HTML_LANG: Record<Lang, string> = { en: 'en', ta: 'ta' };
