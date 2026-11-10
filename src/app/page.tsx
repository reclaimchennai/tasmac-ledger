import Link from 'next/link';
import {
  byCategory, districtNames, districts, snapshots, taluks,
  topByPresence, topMovers, totals, valueSeries,
} from '@/lib/queries';
import { Bar, CategoryTag, Empty, F, SectionHead, Stat, Trace } from '@/components/ui';
import { WhenVisible } from '@/components/lazy';
import { DistrictScope, DistrictSelect, ScopeFade } from '@/components/district-scope';
import { ago, categoryColor, compactCount, compactRupees, count, inr, longDate, size, stamp } from '@/lib/format';
import { istStamp } from '@/lib/normalise';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { lang, t, L } = await i18n();
  const sp = await searchParams;

  /*
    The scope comes off the query string, so it is checked against the district
    table rather than trusted: anything that is not a real district id reads as
    no scope at all, and the page is statewide again.
  */
  const allDistricts = districtNames();
  const asked = Number(sp.d);
  const districtId = allDistricts.some((x) => x.district_id === asked) ? asked : null;
  const scoped = districtId != null;
  const scopeName = scoped
    ? L('district', districtId, allDistricts.find((x) => x.district_id === districtId)!.name)
    : null;

  const tot = totals(districtId ?? undefined);
  const cats = byCategory(districtId ?? undefined);
  const movers = topMovers(14, undefined, districtId ?? undefined);
  const presence = topByPresence(14, districtId ?? undefined);
  const series = valueSeries(80, districtId ?? undefined);
  const snaps = snapshots(8);
  const now = istStamp();

  /*
    Section 04 drills rather than repeats: statewide it ranks districts, and
    inside a district it ranks that district's taluks. Both are normalised to
    one row shape so the ledger below is written once.
  */
  const areas = scoped
    ? taluks(districtId).map((k) => ({
        key: `t${k.taluk_id}`, name: L('taluk', k.taluk_id, k.taluk), href: null,
        units: k.units, value_paise: k.value_paise, reported_at: k.reported_at,
        shops_reporting: k.shops_reporting, shops_registered: k.shops_registered,
      }))
    : districts().map((d) => ({
        key: `d${d.district_id}`, name: L('district', d.district_id, d.district), href: `/districts/${d.district_id}`,
        units: d.units, value_paise: d.value_paise, reported_at: d.reported_at,
        shops_reporting: d.shops_reporting, shops_registered: d.shops_registered,
      }));

  // Alphabetical in the reader's own script, so the Tamil list is ordered the
  // way a Tamil reader would expect rather than by its romanisation.
  const options = allDistricts
    .map((x) => ({ district_id: x.district_id, name: L('district', x.district_id, x.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
  const chennaiId = allDistricts.find((x) => x.name === 'Chennai')?.district_id ?? null;

  // `tot.value_paise` is scoped to only the latest snapshot's shops (a partial
  // read most cycles), while `cats` sums stock_current across every shop's
  // latest known stock — a bigger, more complete number. Sharing that
  // mismatched denominator makes every row's percentage overstate its share
  // (they stopped summing to 100%), so "share of value" here is relative to
  // the category rows actually shown, not the page-level total.
  //
  // These are also what the bars are drawn against. Scaling a bar to the
  // largest row instead pins the leader at 100% and turns every other bar into
  // a ratio against the leader — which is not the share the column prints
  // beside it (brandy read 60.5% next to a full-width bar).
  const catTotal = Math.max(1, cats.reduce((s, c) => s + c.value_paise, 0));
  const hasFlow = movers.length > 0;
  const flowRows = hasFlow ? movers : presence;
  const cat = (c: string | null) => (c ? t(`category.${c}` as 'category.BEER') : null);
  const typeHref = (c: string | null) => (c ? `/types/${encodeURIComponent(c)}` : undefined);

  return (
    <DistrictScope>
      {/* ── opening figure ──────────────────────────────────────── */}
      <section className="pt-8 pb-6">
        <div className="lg-split">
          <div>
            <div className="label ox mb-3">
              {t('home.kickerPrefix')}{' · '}
              <DistrictSelect
                options={options}
                value={districtId}
                focusId={chennaiId}
                allLabel={t('home.kickerAll', { n: tot.districts })}
                ariaLabel={t('home.scopeAria')}
              />
            </div>
            <h1 className="h1 rise">
              {t('home.h1a')}
              <br />
              {t('home.h1b')}
              <br />
              <span className="ox">{t('home.h1c')}</span>
            </h1>
            <p className="t-md dim measure mt-4 rise" style={{ animationDelay: '120ms' }}>
              {t('home.lede')}
            </p>
          </div>

          <ScopeFade className="grid gc-2 rule-t rule-l mt-6">
            <div className="rule-r rule-b">
              <Stat
                label={t('home.statInventory')}
                value={'₹' + compactRupees(tot.value_paise / 100, lang)}
                sub={t('home.statBottles', { n: count(tot.units) })}
                accent="var(--oxblood)"
                delay={60}
              />
            </div>
            <div className="rule-b">
              <Stat
                label={t('home.statReporting')}
                value={count(tot.shops_reporting)}
                sub={t('home.statRegistered', { n: count(tot.shops_registered) })}
                delay={120}
              />
            </div>
            <div className="rule-r rule-b">
              <Stat label={t('home.statSkus')} value={count(tot.skus_live)} sub={t('home.statDistinct')} delay={180} />
            </div>
            <div className="rule-b">
              {/*
                Two different clocks, and the distinction matters: the date and
                time are TASMAC's — when the shops were last counted — while the
                line underneath is ours, when we last read the feed. They drift
                apart whenever upstream stops recounting, and that gap is the
                most useful thing on this card.
              */}
              <Stat
                label={t('home.statClock')}
                over={longDate(tot.reported_at, lang)}
                value={stamp(tot.reported_at, { withDate: false, lang })}
                sub={t('home.statRead', { ago: ago(tot.snapshot_at, now, lang) })}
                delay={240}
              />
            </div>
          </ScopeFade>
        </div>
      </section>

      <ScopeFade>
      {/* ── statewide trace ─────────────────────────────────────── */}
      {series.length > 2 && (
        <section className="section">
          <SectionHead
            n="01"
            title={scoped ? t('home.s1in', { name: scopeName! }) : t('home.s1')}
            note={t('home.s1note', { n: series.length })}
          />
          {/* Below the fold on most screens, and a 80-point path is real layout
              work — drawn when it is about to be looked at. */}
          <WhenVisible minHeight={140}>
            <Trace points={series.map((s) => s.value_paise)} />
          </WhenVisible>
          <div className="row between mt-2">
            <span className="label">{stamp(series[0].at, { lang })}</span>
            <span className="label ox">
              {stamp(series[series.length - 1].at, { lang })} · {inr(series[series.length - 1].value_paise, { compact: true, lang })}
            </span>
          </div>
        </section>
      )}

      {/* ── categories ──────────────────────────────────────────── */}
      <section className="section">
        <SectionHead
          n="02"
          title={scoped ? t('home.s2in', { name: scopeName! }) : t('home.s2')}
          note={t('home.s2note')}
        />

        <div className="only-wide wrap-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>{t('col.category')}</th>
                <th style={{ width: '36%' }}>{t('col.shareOfValue')}</th>
                <th className="r">{t('col.bottles')}</th>
                <th className="r">{t('col.skus')}</th>
                <th className="r">{t('col.valueAtMrp')}</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c, i) => (
                <tr key={c.category ?? i} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
                  <td><CategoryTag category={c.category} label={cat(c.category)} href={typeHref(c.category)} /></td>
                  <td>
                    <div className="row g-3">
                      <div className="flex-1"><Bar value={c.value_paise} max={catTotal} color={categoryColor(c.category)} /></div>
                      <span className="num t-xs dim-2 tab-r" style={{ width: 44 }}>
                        {((c.value_paise / catTotal) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="r num">{compactCount(c.units, lang)}</td>
                  <td className="r num dim-2">{c.skus}</td>
                  <td className="r num med">{inr(c.value_paise, { compact: true, lang })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="only-narrow">
          {cats.map((c, i) => (
            <div key={c.category ?? i} className="record rise" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="record-head">
                <CategoryTag category={c.category} label={cat(c.category)} href={typeHref(c.category)} />
                <span className="num t-sm med">{inr(c.value_paise, { compact: true, lang })}</span>
              </div>
              <div className="mt-2"><Bar value={c.value_paise} max={catTotal} color={categoryColor(c.category)} /></div>
              <div className="record-meta">
                <F k={t('col.bottles')} v={compactCount(c.units, lang)} />
                <F k={t('col.skus')} v={c.skus} />
                <F k={t('col.share')} v={`${((c.value_paise / catTotal) * 100).toFixed(1)}%`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── movement ────────────────────────────────────────────── */}
      <section className="section">
        <SectionHead
          n="03"
          title={hasFlow ? t('home.s3flow') : t('home.s3presence')}
          note={hasFlow ? t('home.s3flowNote') : t('home.s3presenceNote')}
          right={<Link href="/catalogue" className="chip">{t('nav.catalogue')}</Link>}
        />

        <div className="only-wide wrap-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>{t('col.product')}</th>
                <th>{t('col.category')}</th>
                <th>{t('col.supplier')}</th>
                <th className="r">{t('col.mrp')}</th>
                <th className="r">{hasFlow ? t('col.sold') : t('col.inStock')}</th>
                <th className="r">{t('col.shops')}</th>
                <th className="r">{hasFlow ? t('col.estRevenue') : t('col.value')}</th>
              </tr>
            </thead>
            <tbody>
              {flowRows.map((m, i) => (
                <tr key={m.sku_id} className="rise" style={{ animationDelay: `${i * 25}ms` }}>
                  <td>
                    <Link href={`/catalogue/${m.sku_id}`} className="link-ox t-sm">
                      {L('sku', m.sku_id, m.product_name)}
                    </Link>
                    <span className="num br t-xs" style={{ marginLeft: 8 }}>{size(m.unit_name, lang)}</span>
                  </td>
                  <td><CategoryTag category={m.category} label={cat(m.category)} /></td>
                  <td className="t-xs dim-2 truncate" style={{ maxWidth: 200 }}>{m.supplier_name}</td>
                  <td className="r num">{m.mrp ? `₹${m.mrp}` : '—'}</td>
                  <td className="r num">{compactCount(hasFlow ? m.units_sold : m.closing_units, lang)}</td>
                  <td className="r num dim-2">{count(m.shops_stocking)}</td>
                  <td className="r num med">
                    {hasFlow ? inr(m.revenue_paise, { compact: true, lang }) : inr(m.closing_units * (m.mrp ?? 0) * 100, { compact: true, lang })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="only-narrow">
          {flowRows.map((m, i) => (
            <Link key={m.sku_id} href={`/catalogue/${m.sku_id}`} className="record rise" style={{ animationDelay: `${i * 25}ms` }}>
              <div className="record-head">
                <span className="record-title">
                  {L('sku', m.sku_id, m.product_name)} <span className="num br t-xs">{size(m.unit_name, lang)}</span>
                </span>
                <span className="num t-sm med shrink-0">
                  {hasFlow ? inr(m.revenue_paise, { compact: true, lang }) : inr(m.closing_units * (m.mrp ?? 0) * 100, { compact: true, lang })}
                </span>
              </div>
              <div className="record-meta">
                <F k={hasFlow ? t('col.sold') : t('col.stock')} v={compactCount(hasFlow ? m.units_sold : m.closing_units, lang)} />
                <F k={t('col.mrp')} v={m.mrp ? `₹${m.mrp}` : '—'} />
                <F k={t('col.shops')} v={count(m.shops_stocking)} />
              </div>
              <div className="mt-2"><CategoryTag category={m.category} label={cat(m.category)} /></div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── districts, or the scoped district's taluks ──────────── */}
      <section className="section">
        <SectionHead
          n="04"
          title={scoped ? t('home.s4in') : t('home.s4')}
          note={scoped ? t('home.s4inNote', { name: scopeName! }) : undefined}
          right={
            scoped
              ? <Link href={`/districts/${districtId}`} className="chip">{t('nav.districts')}</Link>
              : <Link href="/districts" className="chip">{t('home.allDistricts', { n: areas.length })}</Link>
          }
        />

        <div className="only-wide wrap-x">
          <table className="ledger">
            <thead>
              <tr>
                <th>{scoped ? t('col.taluk') : t('col.district')}</th>
                {/* The bar is the reporting gap, not the value share: value is
                    already the last column, and what is not otherwise on the
                    row is how much of the district is missing from the count. */}
                <th style={{ width: '24%' }}>{t('col.notReporting')}</th>
                <th className="r">{t('col.shops')}</th>
                <th className="r">{t('col.bottles')}</th>
                <th className="r">{t('col.valueAtMrp')}</th>
                <th className="r">{t('col.lastCount')}</th>
              </tr>
            </thead>
            <tbody>
              {areas.slice(0, 12).map((a, i) => (
                <tr key={a.key} className="rise" style={{ animationDelay: `${i * 20}ms` }}>
                  <td>
                    {a.href
                      ? <Link href={a.href} className="link-ox t-sm">{a.name}</Link>
                      : <span className="t-sm">{a.name}</span>}
                  </td>
                  <td><Bar value={a.shops_registered - a.shops_reporting} max={a.shops_registered} /></td>
                  <td className="r num">{a.shops_reporting}<span className="dim-2">/{a.shops_registered}</span></td>
                  <td className="r num">{compactCount(a.units, lang)}</td>
                  <td className="r num med">{inr(a.value_paise, { compact: true, lang })}</td>
                  <td className="r num t-xs dim-2">{stamp(a.reported_at, { withDate: false, lang })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="only-narrow">
          {areas.slice(0, 12).map((a, i) => {
            // Districts have a page to go to; taluks do not, so those rows are
            // the same record without the anchor.
            const body = (
              <>
                <div className="record-head">
                  <span className="record-title">{a.name}</span>
                  <span className="num t-sm med shrink-0">{inr(a.value_paise, { compact: true, lang })}</span>
                </div>
                <div className="mt-2"><Bar value={a.shops_registered - a.shops_reporting} max={a.shops_registered} /></div>
                <div className="record-meta">
                  <F k={t('col.shops')} v={`${a.shops_reporting}/${a.shops_registered}`} />
                  <F k={t('col.bottles')} v={compactCount(a.units, lang)} />
                  <F k={t('col.counted')} v={stamp(a.reported_at, { withDate: false, lang })} />
                </div>
              </>
            );
            const props = { className: 'record rise', style: { animationDelay: `${i * 20}ms` } };
            return a.href
              ? <Link key={a.key} href={a.href} {...props}>{body}</Link>
              : <div key={a.key} {...props}>{body}</div>;
          })}
        </div>
      </section>
      </ScopeFade>

      {/* ── provenance ──────────────────────────────────────────── */}
      {/* Harvest runs, not geography — a sweep covers the whole state whatever
          the reader is looking at, so this one stays outside the scope. */}
      <section className="section">
        <SectionHead n="05" title={t('home.s5')} note={t('home.s5note')} />
        {snaps.length === 0 ? (
          <Empty>{t('home.noReadings')}</Empty>
        ) : (
          <div className="wrap-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('col.started')}</th>
                  <th className="r">{t('col.shops')}</th>
                  <th className="r only-wide">{t('col.lines')}</th>
                  <th className="r">{t('col.changes')}</th>
                  <th>{t('col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {snaps.map((s) => (
                  <tr key={s.snapshot_id}>
                    <td className="num dim-2">{s.snapshot_id}</td>
                    <td className="num t-xs">{stamp(s.started_at, { lang })}</td>
                    <td className="r num">{count(s.shops_seen)}</td>
                    <td className="r num only-wide">{count(s.rows_seen)}</td>
                    <td className="r num" style={{ color: s.events_written ? 'var(--oxblood)' : 'var(--ink-3)' }}>
                      {count(s.events_written)}
                    </td>
                    <td>
                      <span
                        className="label"
                        style={{ color: s.status === 'ok' ? 'var(--verdigris)' : s.status === 'running' ? 'var(--brass)' : 'var(--oxblood)' }}
                      >
                        {s.status}
                        {s.districts_failed ? ` ${s.districts_failed}✗` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DistrictScope>
  );
}
