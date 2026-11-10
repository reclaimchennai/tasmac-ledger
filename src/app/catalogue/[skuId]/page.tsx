import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sku, skuByDistrict, skuDaily, skuPriceHistory, skuSeries, skuSiblings, skuTopShops } from '@/lib/queries';
import { Bar, CategoryTag, Crumb, Empty, SectionHead, Stat, Trace } from '@/components/ui';
import { WhenVisible } from '@/components/lazy';
import { compactCount, count, dayLabel, inr, size, stamp } from '@/lib/format';
import { breakdown } from '@/lib/costs';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function SkuPage({ params }: { params: Promise<{ skuId: string }> }) {
  const { skuId: raw } = await params;
  const { lang, t, L } = await i18n();
  const skuId = Number(raw);
  if (!Number.isFinite(skuId)) notFound();

  const s = sku(skuId);
  if (!s) notFound();

  const siblings = skuSiblings(s.product_line_id).filter((x) => x.sku_id !== skuId);
  const prices = skuPriceHistory(skuId);
  const daily = skuDaily(skuId, 21);
  const byDistrict = skuByDistrict(skuId);
  const topShops = skuTopShops(skuId, 12);
  const series = skuSeries(skuId, 96);

  // Ranked distribution across ~38 districts: scale each bar to the leading
  // district, not the grand total. Share-of-total would pin the biggest at ~7%
  // and leave every bar an indistinguishable sliver; scaling to the max keeps
  // the relative lengths exact (they read against each other) and uses the
  // whole column. The exact bottle counts sit in the column beside it.
  const distMax = Math.max(1, ...byDistrict.map((d) => d.units));
  const today = daily[daily.length - 1];
  const name = L('sku', skuId, s.product_name);

  return (
    <>
      <Crumb
        items={[
          { href: '/catalogue', label: t('nav.catalogue') },
          { href: `/brands/${s.product_line_id}`, label: L('product_line', s.product_line_id, s.product_line) },
          { label: s.unit_name ? size(s.unit_name, lang) : String(skuId) },
        ]}
      />

      <section className="pb-6">
        <div className="lg-split">
          <div>
            <div className="row g-3 wrap mb-3">
              <CategoryTag category={s.category} label={s.category ? t(`category.${s.category}` as 'category.BEER') : null} />
              {s.is_premium ? <span className="label br">{t('sku.elite')}</span> : null}
              {s.supplier_type ? <span className="label">{s.supplier_type}</span> : null}
              {s.delisted ? <span className="label br" style={{ color: 'var(--oxblood)' }}>{t('sku.delisted')}</span> : null}
              {s.registered ? <span className="label br" style={{ color: 'var(--brass, #a8842c)' }}>{t('sku.registered')}</span> : null}
            </div>
            <h1 className="h1" style={{ fontSize: 'clamp(28px, 7.5vw, 60px)' }}>{name}</h1>
            <div className="row-b g-3 mt-3 wrap">
              <span className="num h3 br">{size(s.unit_name, lang)}</span>
              {s.pack_size ? <span className="label">{t('sku.perCase', { n: s.pack_size })}</span> : null}
            </div>
            {s.supplier_id ? (
              <p className="t-md dim mt-3">
                {t('brand.madeByPrefix')}
                <Link href={`/suppliers/${s.supplier_id}`} className="link-ox">
                  {L('supplier', s.supplier_id, s.supplier_name)}
                </Link>
                {s.production_type ? <span className="dim-2"> · {t(`type.${s.production_type as 'Distillery'}`)}</span> : null}
                {s.supplier_city ? <span className="dim-2"> · {s.supplier_city}</span> : null}
              </p>
            ) : null}

            {siblings.length > 0 && (
              <div className="mt-4">
                <div className="label mb-2">{t('sku.otherSizes')}</div>
                <div className="row g-2 wrap">
                  {siblings.map((v) => (
                    <Link key={v.sku_id} href={`/catalogue/${v.sku_id}`} className="chip">
                      {size(v.unit_name, lang)} · ₹{v.mrp}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid gc-2 rule-t rule-l mt-6">
            <div className="rule-r rule-b">
              <Stat
                label={t('sku.statMrp')}
                value={s.mrp ? `₹${s.mrp}` : '—'}
                sub={s.pack_size ? t('sku.statCase', { v: ((s.mrp ?? 0) * s.pack_size).toLocaleString('en-IN') }) : undefined}
                accent="var(--oxblood)"
              />
            </div>
            <div className="rule-b">
              <Stat label={t('sku.statShops')} value={count(s.shops_stocking)} sub={t('sku.statDistricts', { n: byDistrict.length })} />
            </div>
            <div className="rule-r rule-b">
              <Stat
                label={t('supplier.statBottles')}
                value={compactCount(s.units, lang)}
                sub={t('brand.statAtMrp', { v: inr(s.value_paise, { compact: true, lang }) })}
              />
            </div>
            <div className="rule-b">
              <Stat
                label={t('sku.statSold')}
                value={today ? compactCount(today.units_sold, lang) : '—'}
                sub={today ? t('sku.statSoldSub', { v: inr(today.revenue_paise, { compact: true, lang }) }) : t('sku.statAwaiting')}
              />
            </div>
          </div>
        </div>
      </section>

      {series.length > 2 && (
        <section className="section">
          <SectionHead n="01" title={t('sku.s1')} note={t('sku.s1note', { n: series.length })} />
          <WhenVisible minHeight={110}>
            <Trace points={series.map((p) => p.units)} height={110} />
          </WhenVisible>
        </section>
      )}

      {daily.length > 0 && (
        <section className="section">
          <SectionHead n="02" title={t('sku.s2')} note={t('sku.s2note')} />
          <div className="wrap-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t('col.day')}</th>
                  <th className="r">{t('col.sold')}</th>
                  <th className="r">{t('col.received')}</th>
                  <th className="r">{t('col.estRevenue')}</th>
                  <th className="r only-wide">{t('col.shopsOut')}</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((d) => (
                  <tr key={d.day}>
                    <td className="num t-sm">{dayLabel(d.day, lang)}</td>
                    <td className="r num ox">{compactCount(d.units_sold, lang)}</td>
                    <td className="r num vd">{compactCount(d.units_received, lang)}</td>
                    <td className="r num med">{inr(d.revenue_paise, { compact: true, lang })}</td>
                    <td className="r num dim-2 only-wide">{d.shops_stocked_out || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead n="03" title={t('sku.s3')} note={t('sku.s3note')} />
        {byDistrict.length === 0 ? (
          <Empty>{t('sku.s3empty')}</Empty>
        ) : (
          <div className="wrap-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t('col.district')}</th>
                  <th style={{ width: '34%' }}>{t('col.share')}</th>
                  <th className="r">{t('col.shops')}</th>
                  <th className="r">{t('col.bottles')}</th>
                </tr>
              </thead>
              <tbody>
                {byDistrict.map((d) => (
                  <tr key={d.district_id}>
                    <td>
                      <Link href={`/districts/${d.district_id}`} className="link-ox t-sm">
                        {L('district', d.district_id, d.district)}
                      </Link>
                    </td>
                    <td><Bar value={d.units} max={distMax} /></td>
                    <td className="r num">{d.shops}</td>
                    <td className="r num med">{count(d.units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {topShops.length > 0 && (
        <section className="section">
          <SectionHead n="04" title={t('sku.s4')} note={t('sku.s4note')} />
          <div className="only-wide wrap-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t('col.shop')}</th>
                  <th>{t('col.where')}</th>
                  <th className="r">{t('col.bottles')}</th>
                  <th className="r">{t('col.atMrp')}</th>
                </tr>
              </thead>
              <tbody>
                {topShops.map((sh) => (
                  <tr key={sh.shop_no}>
                    <td><Link href={`/shops/${sh.shop_no}`} className="link-ox num">#{sh.shop_no}</Link></td>
                    <td className="t-sm">{sh.taluk ?? '—'}<span className="dim-2">, {sh.district ?? '—'}</span></td>
                    <td className="r num">{count(sh.qty)}</td>
                    <td className="r num dim">{inr(sh.qty * (s.mrp ?? 0) * 100, { compact: true, lang })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="only-narrow">
            {topShops.map((sh) => (
              <Link key={sh.shop_no} href={`/shops/${sh.shop_no}`} className="record">
                <div className="record-head">
                  <span className="record-title"><span className="num ox">#{sh.shop_no}</span> {sh.taluk}</span>
                  <span className="num t-sm med shrink-0">{count(sh.qty)}</span>
                </div>
                <div className="t-xs dim-2 mt-1">{sh.district}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead n="05" title={t('sku.s5')} note={t('sku.s5note')} />
        <div className="wrap-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>{t('col.from')}</th>
                <th>{t('col.until')}</th>
                <th className="r">{t('col.mrp')}</th>
                <th className="r only-wide">{t('col.buyback')}</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p, i) => (
                <tr key={i}>
                  <td className="num t-sm">
                    {stamp(p.observed_from, { lang })}
                    {p.source ? (
                      <abbr className="dim-2" title={`${t('sku.priceListed')} — ${p.source}`} style={{ marginLeft: 4, textDecoration: 'none', cursor: 'help' }}>‡</abbr>
                    ) : null}
                  </td>
                  <td className="num t-sm dim-2">{p.observed_to ? stamp(p.observed_to, { lang }) : t(s.delisted || s.registered ? 'sku.lastListed' : 'common.current')}</td>
                  <td className="r num med">₹{p.mrp}</td>
                  <td className="r num dim-2 only-wide">{p.buyback_amt ? `₹${p.buyback_amt}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {prices.length === 1 ? <p className="label mt-3">{t('sku.onePrice')}</p> : null}
        {prices.some((p) => p.source) ? <p className="label mt-3">{t('sku.priceGap')}</p> : null}
      </section>

      {s.mrp ? (() => {
        const b = breakdown(s.mrp, s.volume_ml, s.category, s.liquor_type, s.is_premium, new Date().toISOString().slice(0, 10));
        const seg = [
          { k: 'vat', label: t('cost.vat'), val: b.vat, pct: b.vatPct, color: 'var(--oxblood)' },
          { k: 'ex', label: b.exciseLabel === 'Import special fee' ? t('cost.importFee') : t('cost.excise'), val: b.excise, pct: b.excisePct, color: 'var(--brass, #a8842c)' },
          { k: 'base', label: t('cost.base'), val: b.base, pct: b.basePct, color: 'var(--rule)' },
        ];
        return (
          <section className="section">
            <SectionHead n="06" title={t('sku.s6')} note={t('sku.s6note')} />
            <p className="h3" style={{ fontWeight: 400, marginBottom: 14 }}>
              {t('cost.taxShare', { p: Math.round(b.vatPct + (b.cls === 'foreign' ? 0 : 0)) })}
            </p>
            <div className="cost-bar">
              {seg.map((sg) => sg.pct > 0 ? (
                <div key={sg.k} className="cost-seg" style={{ width: `${sg.pct}%`, background: sg.color }} title={`${sg.label} ₹${sg.val}`} />
              ) : null)}
            </div>
            <ul className="cost-key mt-3">
              {seg.map((sg) => (
                <li key={sg.k}>
                  <span className="cost-chip" style={{ background: sg.color }} />
                  <span className="cost-name">{sg.label}</span>
                  <span className="num med">₹{sg.val}</span>
                  <span className="num dim-2 t-xs">{sg.pct.toFixed(0)}%</span>
                </li>
              ))}
            </ul>
            <p className="label mt-3">{b.cls === 'foreign' ? t('cost.foreignNote') : t('cost.spiritNote')}</p>
          </section>
        );
      })() : null}
    </>
  );
}
