import Link from 'next/link';
import { notFound } from 'next/navigation';
import { districts, shopList, type Dir } from '@/lib/queries';
import { Crumb, Empty, F, SectionHead, Stat } from '@/components/ui';
import { Th, sortHref } from '@/components/sort';
import { LazyList, LazyRows } from '@/components/lazy';
import { compactCount, count, inr, stamp } from '@/lib/format';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const PAGE = 120;

export default async function DistrictPage({
  params, searchParams,
}: {
  params: Promise<{ districtId: string }>;
  searchParams: Promise<{ p?: string; s?: string; d?: string }>;
}) {
  const { districtId: raw } = await params;
  const sp = await searchParams;
  const { lang, t, L } = await i18n();
  const districtId = Number(raw);
  if (!Number.isFinite(districtId)) notFound();

  const d = districts().find((x) => x.district_id === districtId);
  if (!d) notFound();

  const pageNo = Math.max(0, Number(sp.p ?? 0) || 0);
  const sort = sp.s || undefined;
  const dir = (sp.d === 'asc' ? 'asc' : sp.d === 'desc' ? 'desc' : undefined) as Dir | undefined;
  const { rows, total } = shopList({ districtId, sort, dir, limit: PAGE, offset: pageNo * PAGE });
  const th = sortHref(`/districts/${districtId}`, {});

  const name = L('district', districtId, d.district);
  const qs = (p: number) => `/districts/${districtId}?${new URLSearchParams({
    ...(p ? { p: String(p) } : {}), ...(sort ? { s: sort } : {}), ...(dir ? { d: dir } : {}),
  })}`;

  return (
    <>
      <Crumb items={[{ href: '/districts', label: t('nav.districts') }, { label: name }]} />

      <section className="pb-6">
        <div className="lg-split">
          <div>
            <div className="label ox mb-2">{t('district.kicker')}</div>
            <h1 className="h1" style={{ fontSize: 'clamp(34px, 9vw, 72px)' }}>{name}</h1>
            <p className="t-md dim measure mt-3">
              {t('district.lede', {
                reporting: count(d.shops_reporting),
                registered: count(d.shops_registered),
                at: stamp(d.reported_at, { lang }),
              })}
            </p>
          </div>
          <div className="grid gc-2 rule-t rule-l mt-6">
            <div className="rule-r rule-b">
              <Stat
                label={t('district.statStock')}
                value={inr(d.value_paise, { compact: true, lang })}
                sub={t('district.statBottles', { n: count(d.units) })}
                accent="var(--oxblood)"
              />
            </div>
            <div className="rule-b">
              <Stat
                label={t('col.shopsReporting')}
                value={count(d.shops_reporting)}
                sub={t('district.statOf', { n: count(d.shops_registered) })}
              />
            </div>
            <div className="rule-r rule-b">
              <Stat
                label={t('district.statAverage')}
                value={d.per_shop_paise != null ? inr(d.per_shop_paise, { compact: true, lang }) : '—'}
                sub={t('district.statAverageSub')}
              />
            </div>
            <div className="rule-b">
              <Stat
                label={t('district.statCounted')}
                value={stamp(d.reported_at, { withDate: false, lang })}
                sub={t('district.statCountedSub')}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="01" title={t('shops.title')} note={t('district.s1note', { n: count(total) })} />
        {rows.length === 0 ? <Empty>{t('district.empty')}</Empty> : (
          <>
            <div className="only-wide wrap-x">
              <table className="ledger">
                <thead>
                  <tr>
                    <Th col="shop" label={t('col.shop')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                    <Th col="where" label={t('col.taluk')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                    <Th col="address" label={t('col.address')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
                    <Th col="skus" label={t('col.skus')} sort={sort} dir={dir} hrefFor={th} right />
                    <Th col="bottles" label={t('col.bottles')} sort={sort} dir={dir} hrefFor={th} right />
                    <Th col="value" label={t('col.valueAtMrp')} sort={sort} dir={dir} hrefFor={th} right />
                  </tr>
                </thead>
                <tbody>
                  <LazyRows colSpan={6} initial={50}>
                    {rows.map((s) => (
                      <tr key={s.shop_no}>
                        <td><Link href={`/shops/${s.shop_no}`} className="link-ox num">#{s.shop_no}</Link></td>
                        <td className="t-sm">{L('taluk', s.taluk_id, s.taluk)}</td>
                        <td className="t-xs dim-2 truncate" style={{ maxWidth: 300 }}>{s.address ?? '—'}</td>
                        <td className="r num">{s.sku_count ?? '—'}</td>
                        <td className="r num">{s.units != null ? compactCount(s.units, lang) : '—'}</td>
                        <td className="r num med">{s.value_paise != null ? inr(s.value_paise, { compact: true, lang }) : '—'}</td>
                      </tr>
                    ))}
                  </LazyRows>
                </tbody>
              </table>
            </div>
            <div className="only-narrow">
              <div className="sort-bar mb-3">
                {(['shop', 'value', 'bottles', 'skus'] as const).map((c) => (
                  <Link key={c} href={th(c, c === 'shop' ? 'asc' : 'desc')} className="chip" data-on={sort === c}>
                    {t(c === 'shop' ? 'col.shop' : c === 'value' ? 'col.valueAtMrp' : c === 'bottles' ? 'col.bottles' : 'col.skus')}
                  </Link>
                ))}
              </div>
              <LazyList initial={30}>
                {rows.map((s) => (
                  <Link key={s.shop_no} href={`/shops/${s.shop_no}`} className="record">
                    <div className="record-head">
                      <span className="record-title">
                        <span className="num ox">#{s.shop_no}</span> {L('taluk', s.taluk_id, s.taluk)}
                      </span>
                      <span className="num t-sm med shrink-0">
                        {s.value_paise != null ? inr(s.value_paise, { compact: true, lang }) : '—'}
                      </span>
                    </div>
                    <div className="t-xs dim-2 truncate mt-1">{s.address ?? ''}</div>
                    <div className="record-meta">
                      <F k={t('col.skus')} v={s.sku_count ?? '—'} />
                      <F k={t('col.bottles')} v={s.units != null ? compactCount(s.units, lang) : '—'} />
                    </div>
                  </Link>
                ))}
              </LazyList>
            </div>
            <div className="row between mt-6">
              {pageNo > 0 ? <Link href={qs(pageNo - 1)} className="chip">{t('common.previous')}</Link> : <span />}
              <span className="label">
                {t('common.range', { from: pageNo * PAGE + 1, to: Math.min(total, (pageNo + 1) * PAGE), total: count(total) })}
              </span>
              {(pageNo + 1) * PAGE < total ? <Link href={qs(pageNo + 1)} className="chip">{t('common.next')}</Link> : <span />}
            </div>
          </>
        )}
      </section>
    </>
  );
}
