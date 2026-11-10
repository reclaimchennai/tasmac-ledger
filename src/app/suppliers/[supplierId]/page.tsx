import Link from 'next/link';
import { notFound } from 'next/navigation';
import { skuList, supplier, supplierByCategory, supplierDaily } from '@/lib/queries';
import { CategoryTag, Crumb, Empty, F, Ring, SectionHead, Stat, Trace } from '@/components/ui';
import { LazyList, LazyRows } from '@/components/lazy';
import { categoryColor, compactCount, count, dayLabel, inr } from '@/lib/format';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** Which column the portfolio is ordered by, and how to read it off a row. */
const PORTFOLIO_SORTS = {
  brand: (b: Line) => b.name,
  sizes: (b: Line) => b.skus,
  bottles: (b: Line) => b.units,
  value: (b: Line) => b.value,
} as const;

type SortKey = keyof typeof PORTFOLIO_SORTS;
interface Line { id: number; name: string; skus: number; units: number; value: number }

export default async function SupplierPage({
  params, searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ s?: string; d?: string }>;
}) {
  const { supplierId: raw } = await params;
  const sp = await searchParams;
  const { lang, t, L } = await i18n();
  const supplierId = Number(raw);
  if (!Number.isFinite(supplierId)) notFound();

  const s = supplier(supplierId);
  if (!s) notFound();

  // Sales split by liquor type (pie) and total daily sales in rupees (trace).
  const byCat = supplierByCategory(supplierId);
  const catTotalRev = byCat.reduce((a, c) => a + c.revenue_paise, 0);
  const catSlices = byCat
    .filter((c) => c.category)
    .map((c) => ({
      key: c.category as string,
      label: t(`category.${c.category}` as 'category.BEER'),
      value: c.revenue_paise,
      color: categoryColor(c.category),
    }));

  const daily = supplierDaily(supplierId, 90);
  const dailyPoints = daily.map((d) => d.revenue_paise);
  const peakDay = daily.length
    ? daily.reduce((m, d) => (d.revenue_paise > m.revenue_paise ? d : m), daily[0])
    : null;

  // The portfolio is a roll-up of this supplier's SKUs by product line, so it is
  // grouped and ordered here rather than in SQL.
  const { rows: skus } = skuList({ supplierId, sort: 'value', limit: 400 });
  const lines = new Map<number, Line>();
  for (const k of skus) {
    const cur = lines.get(k.product_line_id)
      ?? { id: k.product_line_id, name: L('product_line', k.product_line_id, k.product_line), skus: 0, units: 0, value: 0 };
    cur.skus++; cur.units += k.units; cur.value += k.value_paise;
    lines.set(k.product_line_id, cur);
  }

  const sort = (sp.s && sp.s in PORTFOLIO_SORTS ? sp.s : 'value') as SortKey;
  const dir = sp.d === 'asc' ? 'asc' : sp.d === 'desc' ? 'desc' : sort === 'brand' ? 'asc' : 'desc';
  const read = PORTFOLIO_SORTS[sort];
  const sign = dir === 'asc' ? 1 : -1;
  const brands = [...lines.values()].sort((a, b) => {
    const av = read(a);
    const bv = read(b);
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return cmp * sign;
  });

  const th = (col: SortKey, dirNext: 'asc' | 'desc') =>
    `/suppliers/${supplierId}?s=${col}&d=${sort === col ? (dir === 'asc' ? 'desc' : 'asc') : dirNext}`;

  const head = (col: SortKey, label: string, right?: boolean, defaultDir: 'asc' | 'desc' = 'desc') => (
    <th className={right ? 'r' : undefined} aria-sort={sort === col ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link href={th(col, defaultDir)} className="th-sort" data-on={sort === col || undefined} scroll={false}>
        <span>{label}</span>
        <span className="th-arrow" aria-hidden>{sort === col ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </Link>
    </th>
  );

  const name = L('supplier', supplierId, s.name);
  const address = [s.address, s.city].filter(Boolean).join(', ');
  const kind = s.production_type ? t(`type.${s.production_type as 'Distillery'}`) : t('supplier.importer');

  return (
    <>
      <Crumb items={[{ href: '/suppliers', label: t('nav.suppliers') }, { label: name }]} />

      <section className="pb-6">
        <div className="lg-split">
          <div>
            <div className="label ox mb-2">
              {kind}{s.supplier_code ? ` · ${t('supplier.code', { c: s.supplier_code })}` : ''}
            </div>
            <h1 className="h1" style={{ fontSize: 'clamp(26px, 6.5vw, 54px)' }}>{name}</h1>
            {address ? <p className="t-md dim measure mt-3">{address}</p> : null}
            {s.categories ? (
              <div className="row g-2 wrap mt-3">
                {s.categories.split(',').map((c) => (
                  <CategoryTag key={c} category={c} label={t(`category.${c}` as 'category.BEER')} />
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gc-2 rule-t rule-l mt-6">
            <div className="rule-r rule-b">
              <Stat label={t('col.brands')} value={count(s.product_lines)} sub={t('supplier.statBrandsSub')} accent="var(--oxblood)" />
            </div>
            <div className="rule-b">
              <Stat label={t('col.skus')} value={count(s.skus)} sub={t('supplier.statSkusSub')} />
            </div>
            <div className="rule-r rule-b">
              <Stat label={t('supplier.statBottles')} value={compactCount(s.units, lang)} sub={t('method.statStatewide')} />
            </div>
            <div className="rule-b">
              <Stat label={t('col.valueAtMrp')} value={inr(s.value_paise, { compact: true, lang })} sub={t('supplier.statValueSub')} />
            </div>
          </div>
        </div>
      </section>

      {catSlices.length > 0 ? (
        <section className="section">
          <SectionHead n="01" title={t('supplier.s2')} note={t('supplier.s2note')} />
          <Ring
            slices={catSlices}
            total={inr(catTotalRev, { compact: true, lang })}
            caption={t('supplier.s2cap')}
          />
        </section>
      ) : null}

      {dailyPoints.length >= 2 ? (
        <section className="section">
          <SectionHead
            n="02"
            title={t('supplier.s3d')}
            note={t('supplier.s3dnote')}
            right={peakDay ? (
              <span className="label">
                {t('supplier.s3peak', { d: dayLabel(peakDay.day, lang), v: inr(peakDay.revenue_paise, { compact: true, lang }) })}
              </span>
            ) : undefined}
          />
          <Trace points={dailyPoints} height={160} />
        </section>
      ) : null}

      <section className="section">
        <SectionHead n="03" title={t('supplier.s1')} note={t('supplier.s1note', { n: brands.length })} />
        {brands.length === 0 ? <Empty>{t('supplier.empty')}</Empty> : (
          <>
            <div className="only-wide wrap-x">
              <table className="ledger">
                <thead>
                  <tr>
                    {head('brand', t('col.brand'), false, 'asc')}
                    {head('sizes', t('col.sizes'), true)}
                    {head('bottles', t('col.bottles'), true)}
                    {head('value', t('col.valueAtMrp'), true)}
                  </tr>
                </thead>
                <tbody>
                  <LazyRows colSpan={4} initial={50}>
                    {brands.map((b) => (
                      <tr key={b.id}>
                        <td><Link href={`/brands/${b.id}`} className="link-ox t-sm">{b.name}</Link></td>
                        <td className="r num">{b.skus}</td>
                        <td className="r num">{compactCount(b.units, lang)}</td>
                        <td className="r num med">{inr(b.value, { compact: true, lang })}</td>
                      </tr>
                    ))}
                  </LazyRows>
                </tbody>
              </table>
            </div>
            <div className="only-narrow">
              <div className="sort-bar mb-3">
                {(['value', 'bottles', 'sizes', 'brand'] as const).map((c) => (
                  <Link key={c} href={th(c, c === 'brand' ? 'asc' : 'desc')} className="chip" data-on={sort === c}>
                    {t(c === 'value' ? 'col.valueAtMrp' : c === 'bottles' ? 'col.bottles' : c === 'sizes' ? 'col.sizes' : 'col.brand')}
                  </Link>
                ))}
              </div>
              <LazyList initial={30}>
                {brands.map((b) => (
                  <Link key={b.id} href={`/brands/${b.id}`} className="record">
                    <div className="record-head">
                      <span className="record-title">{b.name}</span>
                      <span className="num t-sm med shrink-0">{inr(b.value, { compact: true, lang })}</span>
                    </div>
                    <div className="record-meta">
                      <F k={t('col.sizes')} v={b.skus} />
                      <F k={t('col.bottles')} v={compactCount(b.units, lang)} />
                    </div>
                  </Link>
                ))}
              </LazyList>
            </div>
          </>
        )}
      </section>
    </>
  );
}
