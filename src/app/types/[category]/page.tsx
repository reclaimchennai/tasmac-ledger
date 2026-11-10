import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  categories, categoryByDistrict, categoryDaily, categoryDeepestShops,
  categorySales, categoryTopBrands,
} from '@/lib/queries';
import { Bar, Crumb, Empty, F, SectionHead, Stat, Trace } from '@/components/ui';
import { Donut, type Slice } from '@/components/donut';
import { WhenVisible } from '@/components/lazy';
import { categoryColor, compactCount, compactRupees, count, inr } from '@/lib/format';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** Top slices shown individually; the rest fold into one. Part-to-whole stops
    being readable past about six segments. */
const SLICES = 5;

export default async function LiquorType({ params }: { params: Promise<{ category: string }> }) {
  const { category: raw } = await params;
  const { lang, t, L } = await i18n();

  // The URL carries the normalised family code. Checked against the real list
  // rather than trusted, and matched case-insensitively so /types/beer works.
  const category = categories().find((c) => c.toLowerCase() === decodeURIComponent(raw).toLowerCase());
  if (!category) notFound();

  const brands = categoryTopBrands(category, 40);
  const byDistrict = categoryByDistrict(category);
  const daily = categoryDaily(category, 30);
  const deepest = categoryDeepestShops(category, 12);
  const sales = categorySales(category);

  /*
    Derived here rather than in a query of its own: a shop sits in exactly one
    district, so summing the district rows gives the same totals as a second
    full scan of stock_current would, for nothing.
  */
  const units = byDistrict.reduce((a, d) => a + d.units, 0);
  const valuePaise = byDistrict.reduce((a, d) => a + d.value_paise, 0);
  const shops = byDistrict.reduce((a, d) => a + d.shops, 0);
  const skus = brands.reduce((a, b) => a + b.skus, 0);
  if (!units && !sales.units_sold) notFound();

  const name = t(`category.${category}` as 'category.BEER');
  const colour = categoryColor(category);

  const distTotal = Math.max(1, byDistrict.reduce((a, d) => a + d.units, 0));
  const soldDays = daily.filter((d) => d.units_sold > 0);

  /* Share is of the brands that have actually sold, so the ring is a split of
     revenue rather than of an arbitrary top-N. */
  const ranked = brands.filter((b) => b.revenue_paise > 0);
  const shareTotal = ranked.reduce((a, b) => a + b.revenue_paise, 0);
  const head = ranked.slice(0, SLICES);
  const tail = ranked.slice(SLICES);
  const slices: Slice[] = [
    ...head.map((b) => ({ key: String(b.product_line_id), label: L('product_line', b.product_line_id, b.name), value: b.revenue_paise })),
    ...(tail.length
      ? [{ key: 'rest', rest: true, label: t('type.restOfBrands', { n: tail.length }), value: tail.reduce((a, b) => a + b.revenue_paise, 0) }]
      : []),
  ];

  return (
    <>
      <Crumb items={[{ href: '/catalogue', label: t('nav.catalogue') }, { label: name }]} />

      <section className="pb-6">
        <div className="lg-split">
          <div>
            <div className="label ox mb-2">{t('type.kicker')}</div>
            <h1 className="h1" style={{ fontSize: 'clamp(34px, 9vw, 72px)', color: colour }}>{name}</h1>
            <p className="t-md dim measure mt-3">
              {t('type.lede', { lines: count(brands.length), skus: count(skus), shops: count(shops) })}
            </p>
          </div>

          <div className="grid gc-2 rule-t rule-l mt-6">
            <div className="rule-r rule-b">
              <Stat
                label={t('type.statStock')}
                value={'₹' + compactRupees(valuePaise / 100, lang)}
                sub={t('type.statBottles', { n: count(units) })}
                accent={colour}
                delay={60}
              />
            </div>
            <div className="rule-b">
              <Stat
                label={t('type.statSold')}
                value={'₹' + compactRupees(sales.revenue_paise / 100, lang)}
                sub={t('type.statSoldSub', { n: count(sales.units_sold) })}
                delay={120}
              />
            </div>
            <div className="rule-r rule-b">
              <Stat
                label={t('type.statBrands')}
                value={count(brands.length)}
                sub={t('type.statBrandsSub', { n: count(skus) })}
                delay={180}
              />
            </div>
            <div className="rule-b">
              <Stat label={t('type.statShops')} value={count(shops)} sub={t('type.statShopsSub')} delay={240} />
            </div>
          </div>
        </div>
      </section>

      {/* ── sales over time ─────────────────────────────────────── */}
      <section className="section">
        <SectionHead n="01" title={t('type.s1')} note={t('type.s1note', { n: daily.length })} />
        {soldDays.length < 2 ? (
          <Empty>{t('type.noSales')}</Empty>
        ) : (
          <>
            <WhenVisible minHeight={140}>
              <Trace points={daily.map((d) => d.units_sold)} color={colour} />
            </WhenVisible>
            <div className="row between mt-2">
              <span className="label">{daily[0].day}</span>
              <span className="label" style={{ color: colour }}>
                {daily[daily.length - 1].day} · {compactCount(daily[daily.length - 1].units_sold, lang)}
              </span>
            </div>
          </>
        )}
      </section>

      {/* ── market share ────────────────────────────────────────── */}
      {slices.length > 1 && (
        <section className="section">
          <SectionHead n="02" title={t('type.s2')} note={t('type.s2note')} />
          <Donut
            slices={slices}
            category={category}
            total={shareTotal}
            centreValue={count(ranked.length)}
            centreLabel={t('type.s2centre')}
          />
        </section>
      )}

      {/* ── top brands ──────────────────────────────────────────── */}
      <section className="section">
        <SectionHead
          n="03"
          title={t('type.s3')}
          right={
            <Link href={`/brands?c=${encodeURIComponent(category)}`} className="chip">
              {t('type.allBrands', { name })}
            </Link>
          }
        />

        <div className="only-wide wrap-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>{t('col.brand')}</th>
                <th>{t('col.supplier')}</th>
                <th className="r">{t('col.sold')}</th>
                <th className="r">{t('col.estRevenue')}</th>
                <th className="r">{t('col.shops')}</th>
                <th className="r">{t('col.valueAtMrp')}</th>
              </tr>
            </thead>
            <tbody>
              {brands.slice(0, 14).map((b, i) => (
                <tr key={b.product_line_id} className="rise" style={{ animationDelay: `${i * 25}ms` }}>
                  <td>
                    <Link href={`/brands/${b.product_line_id}`} className="link-ox t-sm">
                      {L('product_line', b.product_line_id, b.name)}
                    </Link>
                  </td>
                  <td className="t-xs dim-2 truncate" style={{ maxWidth: 190 }}>{b.supplier_name ?? '—'}</td>
                  <td className="r num">{compactCount(b.units_sold, lang)}</td>
                  <td className="r num med">{inr(b.revenue_paise, { compact: true, lang })}</td>
                  <td className="r num dim-2">{count(b.shops_stocking)}</td>
                  <td className="r num">{inr(b.value_paise, { compact: true, lang })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="only-narrow">
          {brands.slice(0, 14).map((b, i) => (
            <Link key={b.product_line_id} href={`/brands/${b.product_line_id}`} className="record rise" style={{ animationDelay: `${i * 25}ms` }}>
              <div className="record-head">
                <span className="record-title">{L('product_line', b.product_line_id, b.name)}</span>
                <span className="num t-sm med shrink-0">{inr(b.revenue_paise, { compact: true, lang })}</span>
              </div>
              <div className="record-meta">
                <F k={t('col.sold')} v={compactCount(b.units_sold, lang)} />
                <F k={t('col.shops')} v={count(b.shops_stocking)} />
                <F k={t('col.valueAtMrp')} v={inr(b.value_paise, { compact: true, lang })} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── daily movement ──────────────────────────────────────── */}
      <section className="section">
        <SectionHead n="04" title={t('type.s4')} />
        {daily.length === 0 ? (
          <Empty>{t('type.noSales')}</Empty>
        ) : (
          <div className="wrap-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t('col.day')}</th>
                  <th className="r">{t('col.sold')}</th>
                  <th className="r only-wide">{t('col.received')}</th>
                  <th className="r">{t('col.estRevenue')}</th>
                  <th className="r">{t('col.onShelves')}</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((d) => (
                  <tr key={d.day}>
                    <td className="num t-xs">{d.day}</td>
                    <td className="r num" style={{ color: d.units_sold ? colour : 'var(--ink-3)' }}>
                      {compactCount(d.units_sold, lang)}
                    </td>
                    <td className="r num only-wide dim-2">{compactCount(d.units_received, lang)}</td>
                    <td className="r num med">{inr(d.revenue_paise, { compact: true, lang })}</td>
                    <td className="r num dim">{compactCount(d.closing_units, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── where it is ─────────────────────────────────────────── */}
      <section className="section">
        <SectionHead n="05" title={t('type.s5')} note={t('type.s5note')} />
        <div className="only-wide wrap-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>{t('col.district')}</th>
                <th style={{ width: '24%' }}>{t('col.share')}</th>
                <th className="r">{t('col.shops')}</th>
                <th className="r">{t('col.bottles')}</th>
                <th className="r">{t('col.valueAtMrp')}</th>
              </tr>
            </thead>
            <tbody>
              {byDistrict.slice(0, 14).map((d, i) => (
                <tr key={d.district_id} className="rise" style={{ animationDelay: `${i * 20}ms` }}>
                  <td>
                    <Link href={`/districts/${d.district_id}`} className="link-ox t-sm">
                      {L('district', d.district_id, d.district)}
                    </Link>
                  </td>
                  <td><Bar value={d.units} max={distTotal} color={colour} /></td>
                  <td className="r num dim-2">{count(d.shops)}</td>
                  <td className="r num">{compactCount(d.units, lang)}</td>
                  <td className="r num med">{inr(d.value_paise, { compact: true, lang })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="only-narrow">
          {byDistrict.slice(0, 14).map((d, i) => (
            <Link key={d.district_id} href={`/districts/${d.district_id}`} className="record rise" style={{ animationDelay: `${i * 20}ms` }}>
              <div className="record-head">
                <span className="record-title">{L('district', d.district_id, d.district)}</span>
                <span className="num t-sm med shrink-0">{compactCount(d.units, lang)}</span>
              </div>
              <div className="mt-2"><Bar value={d.units} max={distTotal} color={colour} /></div>
              <div className="record-meta">
                <F k={t('col.shops')} v={count(d.shops)} />
                <F k={t('col.valueAtMrp')} v={inr(d.value_paise, { compact: true, lang })} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── deepest stock ───────────────────────────────────────── */}
      <section className="section">
        <SectionHead n="06" title={t('type.s6')} note={t('type.s6note')} />
        <div className="wrap-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>{t('col.shop')}</th>
                <th className="only-wide">{t('col.taluk')}</th>
                <th className="only-wide">{t('col.district')}</th>
                <th className="r">{t('col.skus')}</th>
                <th className="r">{t('col.bottles')}</th>
                <th className="r">{t('col.valueAtMrp')}</th>
              </tr>
            </thead>
            <tbody>
              {deepest.map((s) => (
                <tr key={s.shop_no}>
                  <td>
                    <Link href={`/shops/${s.shop_no}`} className="link-ox t-sm num">#{s.shop_no}</Link>
                  </td>
                  <td className="t-xs dim-2 only-wide">{L('taluk', s.taluk_id, s.taluk)}</td>
                  <td className="t-xs dim-2 only-wide">{L('district', s.district_id, s.district)}</td>
                  <td className="r num dim-2">{s.skus}</td>
                  <td className="r num">{count(s.units)}</td>
                  <td className="r num med">{inr(s.value_paise, { compact: true, lang })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
