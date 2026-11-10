'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LANGS, type Lang } from '@/lib/i18n-shared';
import { TamilFlag, UnionFlag } from './flags';

/**
 * Language toggle.
 *
 * Two languages, so it is a toggle rather than a menu — one tap, no picker.
 * The choice is a cookie because every page here is server-rendered against the
 * database: putting the language in the URL would double every route and split
 * the shareable link for a shop between two addresses, and the pages are
 * `force-dynamic` already, so a cookie costs nothing.
 */
export function LangSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const other = LANGS.find((l) => l.code !== lang)!;

  return (
    <button
      className="chip lang-chip shrink-0"
      onClick={() =>
        start(() => {
          // One year, site-wide, and SameSite=Lax so it survives an ordinary
          // link in from elsewhere.
          document.cookie = `tasmac-lang=${other.code}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        })
      }
      /*
        The flag is decoration; the label is the button. Without this the control
        announces as nothing at all, and a flag is a poor name for a language
        even when you can see it.
      */
      aria-label={other.label}
      title={other.label}
      data-pending={pending || undefined}
    >
      {other.code === 'en' ? <UnionFlag /> : <TamilFlag />}
    </button>
  );
}
