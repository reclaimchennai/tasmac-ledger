import Link from 'next/link';
import { districts, totals, type Dir } from '@/lib/queries';
import { Bar, F, SectionHead } from '@/components/ui';
import { Th, sortHref } from '@/components/sort';
import { LazyList, LazyRows } from '@/components/lazy';
import { compactCount, count, inr, stamp } from '@/lib/format';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function Districts({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; d?: string }>;
}) {
  const sp = await searchParams;
  const { lang, t, L } = await i18n();
  const sort = sp.s || undefined;
  const dir = (sp.d === 'asc' ? 'asc' : sp.d === 'desc' ? 'desc' : undefined) as Dir | undefined;

  const rows = districts(sort, dir);
  const tot = totals();
  // Share of the state, not share of the biggest district: scaling to the max
  // pinned the leader's bar at 100% and made every other bar a ratio against it,
  // which is a different quantity from the one the column claims to show.
  const max = Math.max(1, rows.reduce((s, d) => s + d.value_paise, 0));
  const th = sortHref('/districts', {});

  return (
    <section className="pt-8">
      <SectionHead
        title={t('districts.title')}
        note={t('districts.note', { n: rows.length, value: inr(tot.value_paise, { compact: true, lang }) })}
      />

      <div className="only-wide wrap-x">
        <table className="ledger">
          <thead>
            <tr>
              <Th col="district" label={t('col.district')} sort={sort} dir={dir} hrefFor={th} defaultDir="asc" />
              <Th col="share" label={t('col.shareOfState')} sort={sort} dir={dir} hrefFor={th} style={{ width: '26%' }} />
              <Th col="reporting" label={t('col.shopsReporting')} sort={sort} dir={dir} hrefFor={th} right />
              <Th col="bottles" label={t('col.bottles')} sort={sort} dir={dir} hrefFor={th} right />
              <Th col="value" label={t('col.valueAtMrp')} sort={sort} dir={dir} hrefFor={th} right />
              <Th col="per_shop" label={t('col.perShop')} sort={sort} dir={dir} hrefFor={th} right />
              <Th col="counted" label={t('col.counted')} sort={sort} dir={dir} hrefFor={th} right />
            </tr>
          </thead>
          <tbody>
            <LazyRows colSpan={7} initial={40}>
              {rows.map((d) => (
                <tr key={d.district_id}>
                  <td>
                    <Link href={`/districts/${d.district_id}`} className="link-ox t-sm">
                      {L('district', d.district_id, d.district)}
                    </Link>
                  </td>
                  <td><Bar value={d.value_paise} max={max} /></td>
                  <td className="r num">{d.shops_reporting}<span className="dim-2">/{d.shops_registered}</span></td>
                  <td className="r num">{compactCount(d.units, lang)}</td>
                  <td className="r num med">{inr(d.value_paise, { compact: true, lang })}</td>
                  <td className="r num dim">{d.per_shop_paise != null ? inr(d.per_shop_paise, { compact: true, lang }) : '—'}</td>
                  <td className="r num t-xs dim-2">{stamp(d.reported_at, { withDate: false, lang })}</td>
                </tr>
              ))}
            </LazyRows>
          </tbody>
        </table>
      </div>

      <div className="only-narrow">
        <div className="sort-bar mb-3">
          {(['value', 'bottles', 'reporting', 'district'] as const).map((c) => (
            <Link key={c} href={th(c, c === 'district' ? 'asc' : 'desc')} className="chip" data-on={sort === c}>
              {t(c === 'value' ? 'col.valueAtMrp' : c === 'bottles' ? 'col.bottles' : c === 'reporting' ? 'col.shopsReporting' : 'col.district')}
            </Link>
          ))}
        </div>
        <LazyList initial={30}>
          {rows.map((d) => (
            <Link key={d.district_id} href={`/districts/${d.district_id}`} className="record">
              <div className="record-head">
                <span className="record-title">{L('district', d.district_id, d.district)}</span>
                <span className="num t-sm med shrink-0">{inr(d.value_paise, { compact: true, lang })}</span>
              </div>
              <div className="mt-2"><Bar value={d.value_paise} max={max} /></div>
              <div className="record-meta">
                <F k={t('col.shops')} v={`${d.shops_reporting}/${d.shops_registered}`} />
                <F k={t('col.bottles')} v={compactCount(d.units, lang)} />
                <F k={t('col.perShop')} v={d.per_shop_paise != null ? inr(d.per_shop_paise, { compact: true, lang }) : '—'} />
              </div>
            </Link>
          ))}
        </LazyList>
      </div>
    </section>
  );
}
