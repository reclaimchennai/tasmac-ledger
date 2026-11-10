import Link from 'next/link';
import { readDb } from '@/lib/db';
import { firstObservations } from '@/lib/event-counts';
import { Helpline, SectionHead, Stat } from '@/components/ui';
import { count, inr, stamp } from '@/lib/format';
import { page as i18n, splitAt } from '@/lib/i18n';
import { costBreakdownRows } from '@/lib/queries';
import { breakdown } from '@/lib/costs';

export const dynamic = 'force-dynamic';

export default async function Method() {
  const { lang, t } = await i18n();
  const d = readDb();
  const s = d
    .prepare(
      `SELECT (SELECT COUNT(*) FROM snapshot WHERE status = 'ok') AS readings,
              (SELECT COUNT(*) FROM shop) AS shops,
              (SELECT COUNT(*) FROM sku) AS skus,
              (SELECT MIN(started_at) FROM snapshot) AS since,
              (SELECT COUNT(*) FROM shop WHERE gis_offset_m IS NOT NULL AND gis_offset_m <= 1000) AS agree_1km,
              (SELECT COUNT(*) FROM shop WHERE gis_offset_m IS NOT NULL) AS compared`,
    )
    .get() as Record<string, number | string>;
  const ev = firstObservations(d);
  s.events = ev.events;
  s.movements = ev.events - ev.firsts;

  // Host names are set in the mono face, so the sentences around them are split
  // rather than interpolated — the two languages put them in different places.
  const [s1aBefore, s1aAfter] = splitAt(t('method.s1aBody'), 'host');
  const [s1bBefore, s1bAfter] = splitAt(t('method.s1bBody'), 'host');
  const [s7Before, s7After] = splitAt(t('method.s7body'), 'phone');

  // Statewide cost decomposition over everything currently on shelves.
  const today = new Date().toISOString().slice(0, 10);
  const tot = { mrp: 0, vat: 0, excise: 0, base: 0 };
  for (const r of costBreakdownRows()) {
    const b = breakdown(r.mrp, r.volume_ml, r.category, r.liquor_type, r.is_premium, today);
    tot.mrp += b.mrp * r.units;
    tot.vat += b.vat * r.units;
    tot.excise += b.excise * r.units;
    tot.base += b.base * r.units;
  }
  const pctTax = tot.mrp ? Math.round(((tot.vat + tot.excise) / tot.mrp) * 100) : 0;
  const costSeg = [
    { k: 'vat', label: t('cost.vat'), val: tot.vat, color: 'var(--oxblood)' },
    { k: 'ex', label: t('cost.excise'), val: tot.excise, color: 'var(--brass, #a8842c)' },
    { k: 'base', label: t('cost.base'), val: tot.base, color: 'var(--rule)' },
  ];

  return (
    <>
      <section className="pt-8 pb-6">
        <div className="label ox mb-3">{t('method.kicker')}</div>
        <h1 className="h1" style={{ fontSize: 'clamp(32px, 8vw, 68px)' }}>
          {t('method.h1a')}
          <br />
          <span className="ox">{t('method.h1b')}</span>
        </h1>
        <p className="t-md dim measure mt-4">{t('method.lede')}</p>
      </section>

      <section className="section">
        <div className="grid gc-4 rule-t rule-l">
          <div className="rule-r rule-b">
            <Stat
              label={t('method.statReadings')}
              value={count(Number(s.readings))}
              sub={t('method.statSince', { date: stamp(String(s.since), { lang }) })}
              accent="var(--oxblood)"
            />
          </div>
          <div className="rule-r rule-b">
            <Stat
              label={t('method.statMovements')}
              value={count(Number(s.movements))}
              sub={t('method.statOf', { n: count(Number(s.events)) })}
            />
          </div>
          <div className="rule-r rule-b">
            <Stat label={t('method.statShops')} value={count(Number(s.shops))} sub={t('method.statStatewide')} />
          </div>
          <div className="rule-b">
            <Stat label={t('method.statSkus')} value={count(Number(s.skus))} sub={t('method.statEvery')} />
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead title={t('cost.stateTitle')} note={t('cost.stateNote')} />
        <p className="h2" style={{ fontWeight: 400, marginBottom: 16 }}>
          {t('cost.stateHead', { p: String(pctTax), v: `₹${inr(Math.round(tot.vat + tot.excise))}` })}
        </p>
        <div className="cost-bar">
          {costSeg.map((sg) => {
            const pct = tot.mrp ? (sg.val / tot.mrp) * 100 : 0;
            return pct > 0 ? <div key={sg.k} className="cost-seg" style={{ width: `${pct}%`, background: sg.color }} title={`${sg.label}`} /> : null;
          })}
        </div>
        <ul className="cost-key mt-3">
          {costSeg.map((sg) => (
            <li key={sg.k}>
              <span className="cost-chip" style={{ background: sg.color }} />
              <span className="cost-name">{sg.label}</span>
              <span className="num med">₹{inr(Math.round(sg.val))}</span>
              <span className="num dim-2 t-xs">{tot.mrp ? ((sg.val / tot.mrp) * 100).toFixed(0) : 0}%</span>
            </li>
          ))}
        </ul>
        <p className="label mt-3">{t('cost.spiritNote')}</p>
      </section>

      <section className="section">
        <SectionHead n="01" title={t('method.s1')} />
        <div className="col g-4 measure">
          <div>
            <div className="label mb-1">{t('method.s1aHead')}</div>
            <p className="t-md dim">
              {s1aBefore}
              <span className="num">tasmac.tn.gov.in</span>
              {s1aAfter}
            </p>
          </div>
          <div>
            <div className="label mb-1">{t('method.s1bHead')}</div>
            <p className="t-md dim">
              {s1bBefore}
              <span className="num">tngis.tn.gov.in</span>
              {s1bAfter}
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="02" title={t('method.s2')} />
        <div className="col g-4 measure">
          <p className="t-md dim">{t('method.s2a')}</p>
          <p className="t-md dim">{t('method.s2b')}</p>
        </div>
      </section>

      <section className="section">
        <SectionHead n="03" title={t('method.s3')} />
        <div className="col g-4 measure">
          <p className="t-md dim">{t('method.s3a')}</p>
          <div className="rule-l p-4" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--oxblood)' }}>
            <div className="label ox mb-2">{t('method.s3warn')}</div>
            <ul className="col g-2 t-sm dim">
              <li>{t('method.s3l1')}</li>
              <li>{t('method.s3l2')}</li>
              <li>{t('method.s3l3')}</li>
              <li>{t('method.s3l4')}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead n="04" title={t('method.s4')} />
        <p className="t-md dim measure">
          {t('method.s4body', {
            compared: count(Number(s.compared)),
            agree: count(Number(s.agree_1km)),
          })}
        </p>
      </section>

      <section className="section">
        <SectionHead n="05" title={t('method.s5')} />
        <div className="col g-3 measure">
          <p className="t-md dim">{t('method.s5lede')}</p>
          <ul className="col g-2 t-sm dim">
            <li><span className="label br">{t('class.elite')}</span> — {t('method.s5elite')}</li>
            <li><span className="label ox">{t('class.normal')}</span> — {t('method.s5normal')}</li>
            <li><span className="label">{t('class.other')}</span> — {t('method.s5other')}</li>
          </ul>
        </div>
      </section>

      <section className="section">
        <SectionHead n="06" title={t('method.s6')} />
        <p className="t-md dim measure">{t('method.s6body')}</p>
        <Link href="/shops" className="chip mt-4" style={{ display: 'inline-flex' }}>{t('method.browseMap')}</Link>
      </section>

      <section className="section">
        <SectionHead n="07" title={t('method.s7')} />
        <p className="t-sm dim-2 measure">
          {s7Before}
          <Helpline />
          {s7After}
        </p>
      </section>
    </>
  );
}
