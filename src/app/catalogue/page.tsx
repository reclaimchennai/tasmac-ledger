import Link from 'next/link';
import { categories, skuList, type Dir } from '@/lib/queries';
import { Empty, SectionHead } from '@/components/ui';
import { CatalogueLedger } from '@/components/ledger';
import { toCatDto } from '@/lib/list-dto';
import { count } from '@/lib/format';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const PAGE = 120;

export default async function Catalogue({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; c?: string; s?: string; d?: string; sort?: string; p?: string; stocked?: string }>;
}) {
  const sp = await searchParams;
  const { lang, t, L } = await i18n();
  const search = sp.q?.trim() || undefined;
  const category = sp.c || undefined;
  // `?sort=` was the old intent-named parameter (value/reach/price/name); it
  // still works, and `?s=`/`?d=` are the column-and-direction pair the headings use.
  const sort = sp.s || sp.sort || undefined;
  const dir = (sp.d === 'asc' ? 'asc' : sp.d === 'desc' ? 'desc' : undefined) as Dir | undefined;
  const inStockOnly = sp.stocked !== '0';
  const pageNo = Math.max(0, Number(sp.p ?? 0) || 0);

  const { rows, total } = skuList({
    search, category, sort, dir, inStockOnly, limit: PAGE, offset: pageNo * PAGE,
  });
  const cats = categories();
  const ctx = { lang, t: t as unknown as (k: string, v?: Record<string, string | number>) => string, L: L as unknown as (e: string, id: number | null | undefined, f: string | null) => string };

  const qs = (next: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, unknown> = {
      q: search, c: category, s: sort, d: dir,
      stocked: inStockOnly ? undefined : '0', ...next,
    };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '' && v !== 0) p.set(k, String(v));
    return `/catalogue${p.toString() ? `?${p}` : ''}`;
  };

  // Filters the /api/list batches carry (everything but the page index).
  const fp = new URLSearchParams({ kind: 'catalogue' });
  if (search) fp.set('q', search);
  if (category) fp.set('c', category);
  if (sort) fp.set('s', sort);
  if (dir) fp.set('d', dir);
  if (!inStockOnly) fp.set('stocked', '0');
  const sortParams = { q: search, c: category, stocked: inStockOnly ? undefined : '0' };

  return (
    <section className="pt-8">
      <SectionHead title={t('catalogue.title')} note={t('catalogue.note', { n: count(total) })} />

      <form action="/catalogue" className="row g-2 mb-3">
        <input name="q" defaultValue={search ?? ''} placeholder={t('catalogue.search')} className="field flex-1" type="search" />
        {category ? <input type="hidden" name="c" value={category} /> : null}
        <button className="chip shrink-0" type="submit">{t('common.find')}</button>
      </form>

      <div className="chip-row mb-2">
        <Link href={qs({ c: undefined, p: undefined })} className="chip" data-on={!category}>{t('common.all')}</Link>
        {cats.map((c) => (
          <Link key={c} href={qs({ c, p: undefined })} className="chip" data-on={category === c}>
            {t(`category.${c}` as 'category.BEER') ?? c}
          </Link>
        ))}
      </div>

      <div className="chip-row mb-4">
        <Link href={qs({ stocked: inStockOnly ? '0' : undefined, p: undefined })} className="chip" data-on={inStockOnly}>
          {t('catalogue.inStockOnly')}
        </Link>
      </div>

      {rows.length === 0 ? (
        <Empty>{t('catalogue.empty')}</Empty>
      ) : (
        <CatalogueLedger
          initial={rows.map((r) => toCatDto(r, ctx))}
          total={total}
          query={fp.toString()}
          sortParams={sortParams}
          sort={sort}
          dir={dir}
          labels={{
            product: t('col.product'), size: t('col.size'), category: t('col.category'),
            supplier: t('col.supplier'), mrp: t('col.mrp'), shops: t('col.shops'),
            bottles: t('col.bottles'), value: t('col.value'), more: t('common.more', { n: '{n}' }),
            delisted: t('sku.delisted'), registered: t('list.registered'),
          }}
          sortBarLabels={{ value: t('col.value'), shops: t('col.shops'), mrp: t('col.mrp'), product: t('col.product') }}
        />
      )}

      {/* Without JavaScript the sentinel never fires, so keep classic paging as a fallback. */}
      {rows.length > 0 ? (
        <noscript>
          <div className="row between mt-6">
            {pageNo > 0 ? <a href={qs({ p: pageNo - 1 })} className="chip">{t('common.previous')}</a> : <span />}
            {(pageNo + 1) * PAGE < total ? <a href={qs({ p: pageNo + 1 })} className="chip">{t('common.next')}</a> : <span />}
          </div>
        </noscript>
      ) : null}
    </section>
  );
}
