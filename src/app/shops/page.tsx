import { readDb } from '@/lib/db';
import { ShopsExplorer, type ExplorerStrings, type ShopRowLite } from '@/components/shops-explorer';
import { page as i18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * The whole shop set is sent once. It is ~4,850 rows of small scalars, which is
 * a smaller payload than a map tile — and it makes panning the map feel instant
 * instead of firing a query per frame.
 *
 * Place names are resolved to the reader's language here rather than in the
 * browser: the explorer filters and sorts on what it is given, so it should be
 * given the text that will actually be on screen.
 */
export default async function Shops() {
  const d = readDb();
  const { lang, t, L } = await i18n();

  const raw = d
    .prepare(
      `WITH ok AS (SELECT snapshot_id FROM snapshot WHERE status IN ('ok','partial') ORDER BY snapshot_id DESC),
            latest AS (SELECT snapshot_id AS id FROM ok LIMIT 1),
            recent AS (SELECT snapshot_id FROM ok LIMIT 3),
            live AS (SELECT DISTINCT shop_no FROM shop_report
                      WHERE sku_count > 0 AND snapshot_id IN (SELECT snapshot_id FROM recent))
       SELECT v.shop_no, v.lat, v.lon, v.taluk, v.taluk_id, v.district, v.district_id,
              v.address,
              CASE
                WHEN cl.shop_no IS NOT NULL THEN 'closed'
                WHEN lv.shop_no IS NOT NULL THEN 'trading'
                WHEN v.ever_reported = 1 THEN 'stopped'
                ELSE 'dormant'
              END AS trading_status,
              r.units, r.value_paise, r.sku_count, r.reported_at
         FROM v_shop_full v
         LEFT JOIN shop_report r ON r.shop_no = v.shop_no AND r.snapshot_id = (SELECT id FROM latest)
         LEFT JOIN shop_closure cl ON cl.shop_no = v.shop_no
         LEFT JOIN live lv ON lv.shop_no = v.shop_no
        ORDER BY v.shop_no`,
    )
    .all() as ShopRowLite[];

  // Shops that have never once reported stock since the project began are
  // dropped — they only clutter the map, and "not trading" should mean a shop
  // that actually stopped. They reappear the moment they trade, since the
  // status is recomputed on each request.
  const rows: ShopRowLite[] = raw
    .filter((r) => r.trading_status !== 'dormant')
    .map((r) => ({
      ...r,
      taluk: r.taluk ? L('taluk', r.taluk_id, r.taluk) : r.taluk,
      district: r.district ? L('district', r.district_id, r.district) : r.district,
    }));

  // Only the count is needed server-side (for the map label). The point array
  // itself is derived on the client from `rows`, rather than shipped twice.
  const withCoords = rows.reduce((n, r) => n + (r.lat != null && r.lon != null ? 1 : 0), 0);

  // Filter chips, by trading status (dormant is excluded above).
  const order = ['trading', 'stopped', 'closed'];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.trading_status ?? 'trading', (counts.get(r.trading_status ?? 'trading') ?? 0) + 1);
  const classes = order
    .filter((k) => counts.has(k))
    .map((k) => ({ key: k, n: counts.get(k) as number }));

  const classLabels: Record<string, string> = {
    trading: t('class.trading'),
    stopped: t('class.stopped'),
    closed: t('class.closed'),
  };

  const strings: ExplorerStrings = {
    lang,
    title: t('shops.title'),
    note: t('shops.note'),
    search: t('shops.search'),
    emptyView: t('shops.emptyView'),
    clearFilter: t('shops.clearFilter'),
    countLine: t('shops.count'),
    onShelves: t('shops.onShelves'),
    scopeStatewide: t('scope.statewide'),
    scopeInView: t('scope.inView'),
    scopeShop: t('scope.shop'),
    all: t('common.all'),
    showMore: t('common.showMore'),
    cols: {
      shop: t('col.shop'),
      class: t('col.class'),
      where: t('col.where'),
      address: t('col.address'),
      skus: t('col.skus'),
      bottles: t('col.bottles'),
      value: t('col.valueAtMrp'),
      counted: t('col.counted'),
    },
    classes: classLabels,
    map: {
      locate: t('map.locate'),
      locating: t('map.locating'),
      reset: t('map.reset'),
      zoomIn: t('map.zoomIn'),
      zoomOut: t('map.zoomOut'),
      denied: t('map.denied'),
      noFix: t('map.noFix'),
      noGeo: t('map.noGeo'),
      street: t('map.street'),
      satellite: t('map.satellite'),
      terrain: t('map.terrain'),
      plain: t('map.plain'),
      streetView: t('map.streetView'),
      openInMaps: t('map.openInMaps'),
      label: t('map.label', { n: withCoords }),
      basemapAria: t('map.basemapAria'),
      sizeKey: t('map.sizeKey'),
      closeShop: t('map.closeShop'),
      viewShop: t('map.viewShop'),
      classes: classLabels,
    },
  };

  return <ShopsExplorer rows={rows} classes={classes} strings={strings} />;
}
