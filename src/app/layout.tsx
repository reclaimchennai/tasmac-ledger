import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_Tamil } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { Masthead, TabBar, type NavLabels } from '@/components/masthead';
import { Helpline } from '@/components/ui';
import { HTML_LANG, page, splitAt } from '@/lib/i18n';

const display = Instrument_Serif({ weight: '400', subsets: ['latin'], variable: '--font-display-src', display: 'swap' });
const sans = IBM_Plex_Sans({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-sans-src', display: 'swap' });
const mono = IBM_Plex_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-mono-src', display: 'swap' });

/*
  IBM Plex has no Tamil, so Tamil text would otherwise fall back to whatever the
  device happens to have — which on a lot of Android handsets is nothing, and
  renders as boxes. Noto Sans Tamil is listed after the Latin faces in the stack,
  so it only ever supplies the glyphs the others lack; Latin keeps Plex.
*/
const tamil = Noto_Sans_Tamil({
  weight: ['400', '500'],
  subsets: ['tamil'],
  variable: '--font-tamil-src',
  display: 'swap',
});

/**
 * Title and description follow the reader's language too — they are the first
 * Tamil a search result or a shared link shows, and leaving them in English
 * undercut the rest of the translation.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await page();
  return { title: t('meta.title'), description: t('meta.description') };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2ede1' },
    { media: '(prefers-color-scheme: dark)', color: '#12100c' },
  ],
};

// Set the theme before first paint so a dark-mode reader never sees a flash of paper.
const THEME_BOOT = `(()=>{try{const t=localStorage.getItem('tasmac-theme');
if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))
document.documentElement.dataset.theme='dark';}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await page();

  const labels: NavLabels = {
    ledger: t('nav.ledger'),
    shops: t('nav.shops'),
    catalogue: t('nav.catalogue'),
    brands: t('nav.brands'),
    districts: t('nav.districts'),
    suppliers: t('nav.suppliers'),
    db: t('nav.db'),
    shortDb: t('nav.short.db'),
    shortCatalogue: t('nav.short.catalogue'),
    shortDistricts: t('nav.short.districts'),
    mark: t('masthead.mark'),
    searchPlaceholders: [t('search.placeholder'), t('search.placeholderMedium'), t('search.placeholderShort')],
    searchAria: t('search.aria'),
    toDark: t('theme.toDark'),
    toLight: t('theme.toLight'),
  };

  return (
    <html
      lang={HTML_LANG[lang]}
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable} ${tamil.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {/* The tile host, warmed up before the shops page asks it for anything. */}
        <link rel="preconnect" href="https://mt0.google.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://mt1.google.com" />
      </head>
      <body className="has-tabbar">
        <Masthead labels={labels} lang={lang} />
        <main className="container">{children}</main>
        <Footer />
        <TabBar labels={labels} />
      </body>
    </html>
  );
}

async function Footer() {
  const { t } = await page();
  const [alertBefore, alertAfter] = splitAt(t('footer.alertText'), 'phone');
  return (
    <footer className="container pb-8">
      <div className="rule-double pt-6 lg-side g-6">
        <div>
          <div className="h3 mb-2">{t('footer.title')}</div>
          <p className="t-sm dim measure">{t('footer.blurb')}</p>
        </div>
        <div>
          <div className="label mb-2">{t('footer.method')}</div>
          <ul className="t-sm dim col g-1">
            <li>{t('footer.m1')}</li>
            <li>{t('footer.m2')}</li>
            <li>{t('footer.m3')}</li>
          </ul>
          <Link href="/method" className="link-ox t-sm mt-2" style={{ display: 'inline-block' }}>
            {t('footer.howBuilt')}
          </Link>
        </div>
        <div>
          <div className="label mb-2">{t('footer.alert')}</div>
          <p className="t-sm dim">
            {alertBefore}
            <Helpline />
            {alertAfter}
          </p>
        </div>
      </div>
    </footer>
  );
}
