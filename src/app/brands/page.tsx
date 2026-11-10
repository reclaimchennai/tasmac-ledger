import Link from 'next/link';
import { brandList, categories, type Dir } from '@/lib/queries';
import { Empty, SectionHead } from '@/components/ui';
import { BrandLedger } from '@/components/ledger';
import { toBrandDto } from '@/lib/list-dto';
import { count } from '@/lib/format';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const PAGE = 100;

export default async function Brands({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; c?: string; p?: string; s?: string; d?: string }>;
}) {
  const sp = await searchParams;
  const { lang, t, L } = await i18n();
  const search = sp.q?.trim() || undefined;
  const category = sp.c || undefined;
  const sort = sp.s || undefined;
  const dir = (sp.d === 'asc' ? 'asc' : sp.d === 'desc' ? 'desc' : undefined) as Dir | undefined;
  const pageNo = Math.max(0, Number(sp.p ?? 0) || 0);

  const { rows, total } = brandList({ search, category, sort, dir, limit: PAGE, offset: pageNo * PAGE });
  const cats = categories();
  const ctx = { lang, t: t as unknown as (k: string, v?: Record<string, string | number>) => string, L: L as unknown as (e: string, id: number | null | undefined, f: string | null) => string };

  const qs = (next: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = { q: search, c: category, s: sort, d: dir, ...next };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '' && v !== 0) p.set(k, String(v));
    return `/brands${p.toString() ? `?${p}` : ''}`;
  };

  const fp = new URLSearchParams({ kind: 'brands' });
  if (search) fp.set('q', search);
  if (category) fp.set('c', category);
  if (sort) fp.set('s', sort);
  if (dir) fp.set('d', dir);
  const sortParams = { q: search, c: category };

  return (
    <section className="pt-8">
      <SectionHead title={t('brands.title')} note={t('brands.note', { n: count(total) })} />

      <form action="/brands" className="row g-2 mb-3">
        <input name="q" defaultValue={search ?? ''} placeholder={t('brands.search')} className="field flex-1" type="search" />
        {category ? <input type="hidden" name="c" value={category} /> : null}
        <button className="chip shrink-0" type="submit">{t('common.find')}</button>
      </form>

      <div className="chip-row mb-4">
        <Link href={qs({ c: undefined, p: undefined })} className="chip" data-on={!category}>{t('common.all')}</Link>
        {cats.map((c) => (
          <Link key={c} href={qs({ c, p: undefined })} className="chip" data-on={category === c}>
            {t(`category.${c}` as 'category.BEER') ?? c}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>{t('brands.empty')}</Empty>
      ) : (
        <BrandLedger
          initial={rows.map((b) => toBrandDto(b, ctx))}
          total={total}
          query={fp.toString()}
          sortParams={sortParams}
          sort={sort}
          dir={dir}
          labels={{
            brand: t('col.brand'), types: t('col.types'), sizes: t('col.sizes'),
            madeBy: t('col.madeBy'), price: t('col.priceRange'), shops: t('col.shops'),
            value: t('col.value'), bottles: t('col.bottles'), more: t('common.more', { n: '{n}' }),
          }}
          sortBarLabels={{ value: t('col.value'), shops: t('col.shops'), price: t('col.priceRange'), brand: t('col.brand') }}
        />
      )}

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
