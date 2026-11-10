import Link from 'next/link';
import { notFound } from 'next/navigation';
import { brand, skuList, type Dir } from '@/lib/queries';
import { CategoryTag, Crumb, Empty, F, SectionHead, Stat } from '@/components/ui';
import { Th, sortHref } from '@/components/sort';
import { compactCount, count, inr, size } from '@/lib/format';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function BrandPage({
  params, searchParams,
}: {
  params: Promise<{ lineId: string }>;
  searchParams: Promise<{ s?: string; d?: string }>;
}) {
  const { lineId: raw } = await params;
  const sp = await searchParams;
  const { lang, t, L } = await i18n();
  const lineId = Number(raw);
  if (!Number.isFinite(lineId)) notFound();

  const b = brand(lineId);
  if (!b) notFound();

  const sort = sp.s || 'size';
  const dir = (sp.d === 'asc' ? 'asc' : sp.d === 'desc' ? 'desc' : sp.s ? undefined : 'asc') as Dir | undefined;
  const { rows: variants } = skuList({ productLineId: lineId, sort, dir, limit: 200 });
  const th = sortHref(`/brands/${lineId}`, {});

  const name = L('product_line', lineId, b.name);
  const cat = (c: string | null) => (c ? t(`category.${c}` as 'category.BEER') : null);

  return (
    <>
      <Crumb items={[{ href: '/brands', label: t('nav.brands') }, { label: name }]} />

      <section className="pb-6">
        <div className="lg-split">
          <div>
            <div className="label ox mb-2">{b.categories ? b.categories.split(',').map((c) => t(`category.${c.trim()}` as 'category.BEER')).join(', ') : t('col.brand')}</div>
            <h1 className="h1" style={{ fontSize: 'clamp(30px, 8vw, 64px)' }}>{name}</h1>
            {b.supplier_id ? (
              <p className="t-md dim mt-3">
                {t('brand.madeByPrefix')}
                <Link href={`/suppliers/${b.supplier_id}`} className="link-ox">
                  {L('supplier', b.supplier_id, b.supplier_name)}
                </Link>
                {b.production_type ? <span className="dim-2"> · {t(`type.${b.production_type as 'Distillery'}`)}</span> : null}
              </p>
            ) : null}
            <p className="t-sm dim-2 measure mt-3">{t('brand.lede')}</p>
          </div>

          <div className="grid gc-2 rule-t rule-l mt-6">
            <div className="rule-r rule-b">
              <Stat label={t('brand.statSizes')} value={count(b.variants)} sub={t('brand.statSizesSub')} accent="var(--oxblood)" />
            </div>
            <div className="rule-b">
              <Stat
                label={t('col.priceRange')}
                value={b.min_mrp === b.max_mrp ? `₹${b.min_mrp}` : `₹${b.min_mrp}–${b.max_mrp}`}
                sub={t('brand.statPriceSub')}
              />
            </div>
            <div className="rule-r rule-b">
              <Stat
                label={t('brand.statStock')}
                value={compactCount(b.units, lang)}
                sub={t('brand.statAtMrp', { v: inr(b.value_paise, { compact: true, lang }) })}
              />
            </div>
            <div className="rule-b">
              <Stat label={t('brand.statReach')} value={count(b.shops_stocking)} sub={t('brand.statReachSub')} />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="01" title={t('brand.s1')} note={t('brand.s1note')} />
        {variants.length === 0 ? (
          <Empty>{t('brand.empty')}</Empty>
        ) : (
          <>
            <div className="only-wide wrap-x">
              <table className="ledger">
                <thead>
                  <tr>
                    <Th col="size" label={t('col.size')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                    <Th col="category" label={t('col.category')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                    <th className="r">{t('col.case')}</th>
                    <Th col="mrp" label={t('col.mrp')} sort={sort} dir={dir} hrefFor={th} right />
                    <th className="r">{t('col.perLitre')}</th>
                    <Th col="shops" label={t('col.shops')} sort={sort} dir={dir} hrefFor={th} right />
                    <Th col="bottles" label={t('col.bottles')} sort={sort} dir={dir} hrefFor={th} right />
                    <Th col="value" label={t('col.value')} sort={sort} dir={dir} hrefFor={th} right />
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.sku_id}>
                      <td><Link href={`/catalogue/${v.sku_id}`} className="link-ox num med">{size(v.unit_name, lang)}</Link></td>
                      <td><CategoryTag category={v.category} label={cat(v.category)} /></td>
                      <td className="r num dim-2">{v.pack_size ?? '—'}</td>
                      <td className="r num med">{v.mrp ? `₹${v.mrp}` : '—'}</td>
                      <td className="r num dim">
                        {v.mrp && v.volume_ml ? `₹${Math.round((v.mrp / v.volume_ml) * 1000)}` : '—'}
                      </td>
                      <td className="r num">{count(v.shops_stocking)}</td>
                      <td className="r num">{compactCount(v.units, lang)}</td>
                      <td className="r num dim">{inr(v.value_paise, { compact: true, lang })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="only-narrow">
              {variants.map((v) => (
                <Link key={v.sku_id} href={`/catalogue/${v.sku_id}`} className="record">
                  <div className="record-head">
                    <span className="record-title num med">{size(v.unit_name, lang)}</span>
                    <span className="num t-sm med shrink-0">{v.mrp ? `₹${v.mrp}` : '—'}</span>
                  </div>
                  <div className="record-meta">
                    <F k={t('col.perL')} v={v.mrp && v.volume_ml ? `₹${Math.round((v.mrp / v.volume_ml) * 1000)}` : '—'} />
                    <F k={t('col.shops')} v={count(v.shops_stocking)} />
                    <F k={t('col.bottles')} v={compactCount(v.units, lang)} />
                  </div>
                </Link>
              ))}
            </div>
            <p className="label mt-3">{t('brand.perLitreNote')}</p>
          </>
        )}
      </section>
    </>
  );
}
