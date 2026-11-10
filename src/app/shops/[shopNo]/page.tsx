import Link from 'next/link';
import { notFound } from 'next/navigation';
import { shop, shopActivity, shopDaily, shopSalesByCategory, shopSeries, shopStock, type Dir } from '@/lib/queries';
import { Bar, CategoryTag, Crumb, Delta, Empty, F, Ring, SectionHead, Stat, Trace } from '@/components/ui';
import { Th, sortHref } from '@/components/sort';
import { LazyList, LazyRows, WhenVisible } from '@/components/lazy';
import { categoryColor, compactCount, count, dayLabel, inr, size, stamp } from '@/lib/format';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** Window the sales mix is measured over — long enough to be representative of a
 *  shop's trade, short enough to reflect what it sells now. */
const MIX_DAYS = 30;

export default async function ShopPage({
  params, searchParams,
}: {
  params: Promise<{ shopNo: string }>;
  searchParams: Promise<{ s?: string; d?: string }>;
}) {
  const { shopNo: raw } = await params;
  const sp = await searchParams;
  const { lang, t, L } = await i18n();
  const shopNo = Number(raw);
  if (!Number.isFinite(shopNo)) notFound();

  const s = shop(shopNo);
  if (!s) notFound();

  const sort = sp.s || undefined;
  const dir = (sp.d === 'asc' ? 'asc' : sp.d === 'desc' ? 'desc' : undefined) as Dir | undefined;
  const stock = shopStock(shopNo, sort, dir);
  const daily = shopDaily(shopNo, 21);
  const activity = shopActivity(shopNo, 40);
  const series = shopSeries(shopNo, 96);
  const mix = shopSalesByCategory(shopNo, MIX_DAYS);
  const mixTotal = mix.reduce((a, m) => a + m.revenue_paise, 0);
  const mixUnits = mix.reduce((a, m) => a + m.units, 0);
  const th = sortHref(`/shops/${shopNo}`, {});

  // Share of the shop's shelf value, not a ratio against its biggest line.
  const totalValue = Math.max(1, stock.reduce((a, r) => a + r.value_paise, 0));
  const today = daily[daily.length - 1];
  const mapUrl =
    s.latitude != null && s.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`
      : null;

  const taluk = L('taluk', s.taluk_id, s.taluk);
  const district = L('district', s.district_id, s.district);
  const cat = (c: string | null) => (c ? t(`category.${c}` as 'category.BEER') : null);

  return (
    <>
      <Crumb
        items={[
          { href: '/shops', label: t('nav.shops') },
          ...(s.district_id ? [{ href: `/districts/${s.district_id}`, label: district }] : []),
          { label: `#${shopNo}` },
        ]}
      />

      <section className="pb-6">
        <div className="lg-split">
          <div>
            <div className="label ox mb-2">
              {t('shop.kicker')} #{shopNo}
              {s.is_mall_shop ? ` · ${t('shop.mall')}` : ''}
              {s.dm_office ? ` · ${t('shop.dm', { office: s.dm_office })}` : ''}
            </div>
            <h1 className="h1" style={{ fontSize: 'clamp(32px, 9vw, 68px)' }}>
              {s.taluk ? taluk : t('shop.kicker')}
              {s.district && s.district !== s.taluk ? <><br /><span className="ox">{district}</span></> : null}
            </h1>
            {s.address ? <p className="t-md dim measure mt-3">{s.address}</p> : null}
            {mapUrl ? (
              <a href={mapUrl} target="_blank" rel="noreferrer noopener" className="chip mt-3" style={{ display: 'inline-flex' }}>
                {t('shop.openInMaps')}
              </a>
            ) : null}
          </div>

          <div className="grid gc-2 rule-t rule-l mt-6">
            <div className="rule-r rule-b">
              <Stat
                label={t('shop.statValue')}
                value={inr(s.value_paise ?? 0, { compact: true, lang })}
                sub={t('district.statBottles', { n: count(s.units ?? 0) })}
                accent="var(--oxblood)"
              />
            </div>
            <div className="rule-b">
              <Stat label={t('shop.statLines')} value={count(s.sku_count ?? 0)} sub={t('shop.statLinesSub')} />
            </div>
            <div className="rule-r rule-b">
              <Stat
                label={t('sku.statSold')}
                value={today ? compactCount(today.units_sold, lang) : '—'}
                sub={today ? t('sku.statSoldSub', { v: inr(today.revenue_paise, { compact: true, lang }) }) : t('sku.statAwaiting')}
              />
            </div>
            <div className="rule-b">
              <Stat
                label={t('shop.statCounted')}
                value={stamp(s.reported_at, { withDate: false, lang })}
                sub={stamp(s.reported_at, { lang })?.split(',')[0]}
              />
            </div>
          </div>
        </div>
      </section>

      {/*
        The mix comes before the time series: "what does this shop actually
        sell" is the question a reader arrives with, and it is answerable from
        far less data than a trace needs.
      */}
      <section className="section">
        <SectionHead n="01" title={t('shop.mix')} note={t('shop.mixNote', { n: MIX_DAYS })} />
        {mix.length === 0 ? (
          <Empty>{t('shop.mixEmpty')}</Empty>
        ) : (
          <Ring
            slices={mix.map((m) => ({
              key: m.category ?? 'OTHER',
              label: m.category ? t(`category.${m.category}` as 'category.BEER') : t('category.OTHER'),
              value: m.revenue_paise,
              color: categoryColor(m.category),
            }))}
            total={inr(mixTotal, { compact: true, lang })}
            caption={t('shop.mixBottles', { n: count(mixUnits) })}
          />
        )}
      </section>

      {series.length > 2 && (
        <section className="section">
          <SectionHead n="02" title={t('shop.s1')} note={t('sku.s1note', { n: series.length })} />
          <WhenVisible minHeight={110}>
            <Trace points={series.map((p) => p.value_paise)} height={110} />
          </WhenVisible>
          <div className="row between mt-2">
            <span className="label">{stamp(series[0].at, { lang })}</span>
            <span className="label ox">{inr(series[series.length - 1].value_paise, { compact: true, lang })}</span>
          </div>
        </section>
      )}

      {daily.length > 0 && (
        <section className="section">
          <SectionHead n="03" title={t('shop.s2')} note={t('shop.s2note')} />
          <div className="wrap-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t('col.day')}</th>
                  <th className="r">{t('col.opening')}</th>
                  <th className="r">{t('col.closing')}</th>
                  <th className="r">{t('col.sold')}</th>
                  <th className="r only-wide">{t('col.received')}</th>
                  <th className="r">{t('col.estRevenue')}</th>
                  <th className="r only-wide">{t('col.stockouts')}</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((d) => (
                  <tr key={d.day}>
                    <td className="num t-sm">{dayLabel(d.day, lang)}</td>
                    <td className="r num dim">{compactCount(d.opening_units, lang)}</td>
                    <td className="r num">{compactCount(d.closing_units, lang)}</td>
                    <td className="r num ox">{compactCount(d.units_sold, lang)}</td>
                    <td className="r num vd only-wide">{compactCount(d.units_received, lang)}</td>
                    <td className="r num med">{inr(d.revenue_paise, { compact: true, lang })}</td>
                    <td className="r num dim-2 only-wide">{d.stockouts || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="label mt-3">{t('shop.s2foot')}</p>
        </section>
      )}

      {activity.length > 0 && (
        <section className="section">
          <SectionHead n="04" title={t('shop.s3')} note={t('shop.s3note')} />
          <div className="only-wide wrap-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t('col.when')}</th>
                  <th>{t('col.product')}</th>
                  <th className="r">{t('col.was')}</th>
                  <th className="r">{t('col.now')}</th>
                  <th className="r">{t('col.change')}</th>
                  <th className="r">{t('col.atMrp')}</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a, i) => (
                  <tr key={i}>
                    <td className="num t-xs dim-2">{stamp(a.observed_at, { lang })}</td>
                    <td>
                      <Link href={`/catalogue/${a.sku_id}`} className="link-ox t-sm">
                        {L('sku', a.sku_id, a.product_name)}
                      </Link>
                      <span className="num br t-xs" style={{ marginLeft: 6 }}>{size(a.unit_name, lang)}</span>
                    </td>
                    <td className="r num dim-2">{count(a.prev_qty ?? 0)}</td>
                    <td className="r num">{count(a.qty)}</td>
                    <td className="r"><Delta value={a.delta} /></td>
                    <td className="r num dim">
                      {a.delta != null && a.mrp ? inr(Math.abs(a.delta) * a.mrp * 100, { compact: true, lang }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="only-narrow">
            {activity.map((a, i) => (
              <div key={i} className="record">
                <div className="record-head">
                  <span className="record-title">
                    {L('sku', a.sku_id, a.product_name)} <span className="num br t-xs">{size(a.unit_name, lang)}</span>
                  </span>
                  <span className="shrink-0"><Delta value={a.delta} /></span>
                </div>
                <div className="record-meta">
                  <F k={t('col.was')} v={count(a.prev_qty ?? 0)} />
                  <F k={t('col.now')} v={count(a.qty)} />
                  <F k={t('col.at')} v={stamp(a.observed_at, { withDate: false, lang })} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead n="05" title={t('shop.s4')} note={t('shop.s4note', { n: count(stock.length) })} />
        {stock.length === 0 ? (
          <Empty>{t('shop.s4empty')}</Empty>
        ) : (
          <>
            <div className="only-wide wrap-x">
              <table className="ledger">
                <thead>
                  <tr>
                    <Th col="product" label={t('col.product')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                    <Th col="category" label={t('col.category')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                    <Th col="supplier" label={t('col.supplier')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                    <Th col="mrp" label={t('col.mrp')} sort={sort} dir={dir} hrefFor={th} right />
                    <Th col="bottles" label={t('col.bottles')} sort={sort} dir={dir} hrefFor={th} right />
                    <th style={{ width: '14%' }}>{t('col.weight')}</th>
                    <Th col="value" label={t('col.value')} sort={sort} dir={dir} hrefFor={th} right />
                  </tr>
                </thead>
                <tbody>
                  <LazyRows colSpan={7} initial={50}>
                    {stock.map((r) => (
                      <tr key={r.sku_id}>
                        <td>
                          <Link href={`/catalogue/${r.sku_id}`} className="link-ox t-sm">
                            {L('sku', r.sku_id, r.product_name)}
                          </Link>
                          <span className="num br t-xs" style={{ marginLeft: 6 }}>{size(r.unit_name, lang)}</span>
                        </td>
                        <td><CategoryTag category={r.category} label={cat(r.category)} /></td>
                        <td className="t-xs dim-2 truncate" style={{ maxWidth: 190 }}>{r.supplier_name}</td>
                        <td className="r num">{r.mrp ? `₹${r.mrp}` : '—'}</td>
                        <td className="r num">{count(r.qty)}</td>
                        <td><Bar value={r.value_paise} max={totalValue} /></td>
                        <td className="r num med">{inr(r.value_paise, { compact: true, lang })}</td>
                      </tr>
                    ))}
                  </LazyRows>
                </tbody>
              </table>
            </div>
            <div className="only-narrow">
              <div className="sort-bar mb-3">
                {(['value', 'bottles', 'mrp', 'product'] as const).map((c) => (
                  <Link key={c} href={th(c, c === 'product' ? 'asc' : 'desc')} className="chip" data-on={sort === c}>
                    {t(c === 'value' ? 'col.value' : c === 'bottles' ? 'col.bottles' : c === 'mrp' ? 'col.mrp' : 'col.product')}
                  </Link>
                ))}
              </div>
              <LazyList initial={30}>
                {stock.map((r) => (
                  <Link key={r.sku_id} href={`/catalogue/${r.sku_id}`} className="record">
                    <div className="record-head">
                      <span className="record-title">
                        {L('sku', r.sku_id, r.product_name)} <span className="num br t-xs">{size(r.unit_name, lang)}</span>
                      </span>
                      <span className="num t-sm med shrink-0">{inr(r.value_paise, { compact: true, lang })}</span>
                    </div>
                    <div className="record-meta">
                      <F k={t('col.stock')} v={count(r.qty)} />
                      <F k={t('col.mrp')} v={r.mrp ? `₹${r.mrp}` : '—'} />
                    </div>
                    <div className="mt-2"><CategoryTag category={r.category} label={cat(r.category)} /></div>
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
