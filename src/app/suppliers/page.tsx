import Link from 'next/link';
import { supplierList, type Dir } from '@/lib/queries';
import { Empty, F, SectionHead } from '@/components/ui';
import { Th, sortHref } from '@/components/sort';
import { LazyList, LazyRows } from '@/components/lazy';
import { compactCount, count, inr } from '@/lib/format';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const TYPES = ['Distillery', 'Brewery', 'Winery'] as const;

export default async function Suppliers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; t?: string; s?: string; d?: string }>;
}) {
  const sp = await searchParams;
  const { lang, t, L } = await i18n();
  const search = sp.q?.trim() || undefined;
  const type = sp.t || undefined;
  const sort = sp.s || undefined;
  const dir = (sp.d === 'asc' ? 'asc' : sp.d === 'desc' ? 'desc' : undefined) as Dir | undefined;

  const rows = supplierList({ search, type, sort, dir });

  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: search, t: type, s: sort, d: dir, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/suppliers${p.toString() ? `?${p}` : ''}`;
  };
  const th = sortHref('/suppliers', { q: search, t: type });

  return (
    <section className="pt-8">
      <SectionHead title={t('suppliers.title')} note={t('suppliers.note', { n: count(rows.length) })} />

      <form action="/suppliers" className="row g-2 mb-3">
        <input name="q" defaultValue={search ?? ''} placeholder={t('suppliers.search')} className="field flex-1" type="search" />
        {type ? <input type="hidden" name="t" value={type} /> : null}
        <button className="chip shrink-0" type="submit">{t('common.find')}</button>
      </form>

      <div className="chip-row mb-4">
        <Link href={qs({ t: undefined })} className="chip" data-on={!type}>{t('common.all')}</Link>
        {TYPES.map((ty) => (
          <Link key={ty} href={qs({ t: ty })} className="chip" data-on={type === ty}>{t(`type.${ty}`)}</Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>{t('suppliers.empty')}</Empty>
      ) : (
        <>
          <div className="only-wide wrap-x">
            <table className="ledger">
              <thead>
                <tr>
                  <Th col="supplier" label={t('col.supplier')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                  <Th col="type" label={t('col.type')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                  <Th col="city" label={t('col.city')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                  <Th col="brands" label={t('col.brands')} sort={sort} dir={dir} hrefFor={th} right />
                  <Th col="skus" label={t('col.skus')} sort={sort} dir={dir} hrefFor={th} right />
                  <Th col="bottles" label={t('col.bottles')} sort={sort} dir={dir} hrefFor={th} right />
                  <Th col="value" label={t('col.valueAtMrp')} sort={sort} dir={dir} hrefFor={th} right />
                </tr>
              </thead>
              <tbody>
                <LazyRows colSpan={7} initial={40}>
                  {rows.map((s) => (
                    <tr key={s.supplier_id}>
                      <td>
                        <Link href={`/suppliers/${s.supplier_id}`} className="link-ox t-sm">
                          {L('supplier', s.supplier_id, s.name)}
                        </Link>
                      </td>
                      <td className="label">
                        {s.production_type ? t(`type.${s.production_type as 'Distillery'}`) : t('suppliers.import')}
                      </td>
                      <td className="t-xs dim-2">{s.city ?? '—'}</td>
                      <td className="r num">{count(s.product_lines)}</td>
                      <td className="r num">{count(s.skus)}</td>
                      <td className="r num">{compactCount(s.units, lang)}</td>
                      <td className="r num med">{inr(s.value_paise, { compact: true, lang })}</td>
                    </tr>
                  ))}
                </LazyRows>
              </tbody>
            </table>
          </div>

          <div className="only-narrow">
            <div className="sort-bar mb-3">
              {(['value', 'skus', 'brands', 'supplier'] as const).map((c) => (
                <Link key={c} href={th(c, c === 'supplier' ? 'asc' : 'desc')} className="chip" data-on={sort === c}>
                  {t(c === 'value' ? 'col.valueAtMrp' : c === 'skus' ? 'col.skus' : c === 'brands' ? 'col.brands' : 'col.supplier')}
                </Link>
              ))}
            </div>
            <LazyList initial={30}>
              {rows.map((s) => (
                <Link key={s.supplier_id} href={`/suppliers/${s.supplier_id}`} className="record">
                  <div className="record-head">
                    <span className="record-title">{L('supplier', s.supplier_id, s.name)}</span>
                    <span className="num t-sm med shrink-0">{inr(s.value_paise, { compact: true, lang })}</span>
                  </div>
                  <div className="t-xs dim-2 mt-1">
                    {s.production_type ? t(`type.${s.production_type as 'Distillery'}`) : t('suppliers.import')}
                    {s.city ? ` · ${s.city}` : ''}
                  </div>
                  <div className="record-meta">
                    <F k={t('col.brands')} v={count(s.product_lines)} />
                    <F k={t('col.skus')} v={count(s.skus)} />
                    <F k={t('col.bottles')} v={compactCount(s.units, lang)} />
                  </div>
                </Link>
              ))}
            </LazyList>
          </div>
        </>
      )}
    </section>
  );
}
