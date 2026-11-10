/**
 * TNGIS overlay harvest.
 *
 * The consumer API knows shops by revenue district and taluk. TASMAC's own
 * management geography — 5 regions divided into 38 TASMAC districts — is only
 * published on the state GIS server, as an open GeoServer WFS behind
 * tngis.tn.gov.in/generic_viewer. This pulls those layers, joins them to our
 * shops on shop number, and cross-checks the two sets of coordinates.
 *
 * Layers used (workspace `generic_viewer`):
 *   tasmac_location_gis            5,146 geotagged shop points + region/district
 *   tasmac_region_boundary            38 TASMAC district polygons, tagged by region
 *   tasmac_office_gt_gis              97 depots and offices
 *   tasmac_location_for_analysis_new   sensitive facilities within 500 m of a shop
 */
import { db } from '../lib/db';
import { istStamp } from '../lib/normalise';
import { log } from './util';
import { reclassify } from './import-closures';

const WFS = 'https://tngis.tn.gov.in/tngismaps/wfs';

interface Feature<P> {
  properties: P;
  geometry: { type: string; coordinates: unknown } | null;
}

async function wfs<P>(typeName: string): Promise<Feature<P>[]> {
  const url =
    `${WFS}?service=WFS&version=1.0.0&request=GetFeature` +
    `&outputFormat=application/json&typeName=${encodeURIComponent(typeName)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) throw new Error(`${typeName} → HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.features) throw new Error(`${typeName} → no features (${JSON.stringify(body).slice(0, 200)})`);
  return body.features as Feature<P>[];
}

/** Great-circle distance in metres — used to score how far the two sources disagree. */
function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Region names arrive as "TRICHY", "Trichy ", "Madurai Region" — all one place. */
function normRegion(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().replace(/\s+region$/i, '').trim();
  if (!t) return null;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

const titleCase = (s: string) =>
  s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export async function harvestGis(): Promise<void> {
  const d = db();
  const now = istStamp();

  // ── regions and TASMAC districts ────────────────────────────────
  const regionFeatures = await wfs<{ region_boundary: string; region: string; object_id: number }>(
    'generic_viewer:tasmac_region_boundary',
  );

  d.transaction(() => {
    const insRegion = d.prepare('INSERT INTO tasmac_region (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
    const selRegion = d.prepare('SELECT region_id FROM tasmac_region WHERE name = ?');
    const insDistrict = d.prepare(
      `INSERT INTO tasmac_district (name, region_id, geojson) VALUES (?,?,?)
       ON CONFLICT(name) DO UPDATE SET region_id = excluded.region_id, geojson = excluded.geojson`,
    );
    for (const f of regionFeatures) {
      const region = normRegion(f.properties.region);
      if (!region) continue;
      insRegion.run(region);
      const regionId = (selRegion.get(region) as { region_id: number }).region_id;
      insDistrict.run(titleCase(f.properties.region_boundary ?? ''), regionId, f.geometry ? JSON.stringify(f.geometry) : null);
    }
  })();
  log(`GIS regions: ${(d.prepare("SELECT COUNT(*) n FROM tasmac_region").get() as any)?.n ?? 0} regions, ${regionFeatures.length} TASMAC districts`);

  // ── geotagged shop points ───────────────────────────────────────
  interface ShopProps {
    tasmac_sho: number | null;
    full_addre: string | null;
    name: string | null;
    latitude: number | null;
    longitude: number | null;
    district: string | null;
    region: string | null;
    object_id: number | null;
  }
  const shopFeatures = await wfs<ShopProps>('generic_viewer:tasmac_location_gis');

  d.transaction(() => {
    d.prepare("DELETE FROM gis_shop WHERE layer = 'tasmac_location_gis'").run();
    const ins = d.prepare(
      `INSERT INTO gis_shop (shop_no, latitude, longitude, address, gis_district, gis_region, object_id, layer, fetched_at)
       VALUES (?,?,?,?,?,?,?,'tasmac_location_gis',?)`,
    );
    for (const f of shopFeatures) {
      const p = f.properties;
      // Points also carry coordinates in the geometry; prefer the attribute pair
      // and fall back to the geometry so unlabelled rows are still placeable.
      let lat = p.latitude;
      let lon = p.longitude;
      if ((lat == null || lon == null) && f.geometry?.type === 'Point') {
        const c = f.geometry.coordinates as [number, number];
        lon = c[0];
        lat = c[1];
      }
      ins.run(
        p.tasmac_sho && p.tasmac_sho > 0 ? p.tasmac_sho : null,
        lat, lon,
        (p.full_addre && p.full_addre !== '0' ? p.full_addre : p.name) ?? null,
        p.district ? titleCase(p.district) : null,
        normRegion(p.region),
        p.object_id ?? null,
        now,
      );
    }
  })();
  log(`GIS shops: ${shopFeatures.length} points, ${shopFeatures.filter((f) => f.properties.tasmac_sho).length} carrying a shop number`);

  // ── offices and depots ──────────────────────────────────────────
  const officeFeatures = await wfs<{ name: string | null; latitude: number | null; longitude: number | null; object_id: number | null }>(
    'generic_viewer:tasmac_office_gt_gis',
  );
  d.transaction(() => {
    d.prepare('DELETE FROM tasmac_office').run();
    const ins = d.prepare('INSERT INTO tasmac_office (name, latitude, longitude, object_id, fetched_at) VALUES (?,?,?,?,?)');
    for (const f of officeFeatures) {
      const p = f.properties;
      ins.run(p.name?.trim() ?? null, p.latitude, p.longitude, p.object_id ?? null, now);
    }
  })();
  log(`GIS offices: ${officeFeatures.length}`);

  // ── sensitive facilities within 500 m ───────────────────────────
  try {
    interface ProxProps {
      rv_shop_no: number | null; buff_dist: number | null; facility_n: string | null;
      facility_t: string | null; facility_1: number | null; district_name: string | null;
    }
    const prox = await wfs<ProxProps>('generic_viewer:tasmac_location_for_analysis_new');
    d.transaction(() => {
      const ins = d.prepare(
        `INSERT INTO shop_proximity (shop_no, buffer_m, facility_names, facility_types, facility_count, district_name, fetched_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(shop_no) DO UPDATE SET
           buffer_m = excluded.buffer_m, facility_names = excluded.facility_names,
           facility_types = excluded.facility_types, facility_count = excluded.facility_count,
           district_name = excluded.district_name, fetched_at = excluded.fetched_at`,
      );
      for (const f of prox) {
        const p = f.properties;
        if (!p.rv_shop_no) continue;
        ins.run(p.rv_shop_no, p.buff_dist ?? null, p.facility_n ?? null, p.facility_t ?? null, p.facility_1 ?? null, p.district_name ?? null, now);
      }
    })();
    log(`GIS proximity: ${prox.length} shop/facility rows`);
  } catch (e) {
    log(`GIS proximity layer unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }

  reconcile();
}

/**
 * Join GIS attributes onto `shop`, and classify.
 *
 * Classification is attribute-driven, not guessed:
 *   elite  — TASMAC's own mall/premium outlet flag from the consumer API
 *   normal — an ordinary retail shop that reports stock
 *   other  — a shop number known to one source but not trading in the other
 *            (closed, relocated, or an office/depot point rather than a shop)
 */
export function reconcile(): void {
  const d = db();

  const updated = d.transaction(() => {
    // Region / district / GIS coordinates, keyed on shop number.
    const rows = d
      .prepare(
        `SELECT g.shop_no, g.latitude AS glat, g.longitude AS glon, g.gis_district, g.gis_region, g.address AS gaddr,
                s.latitude AS slat, s.longitude AS slon
           FROM gis_shop g JOIN shop s ON s.shop_no = g.shop_no
          WHERE g.shop_no IS NOT NULL AND g.layer = 'tasmac_location_gis'`,
      )
      .all() as {
        shop_no: number; glat: number | null; glon: number | null;
        gis_district: string | null; gis_region: string | null; gaddr: string | null;
        slat: number | null; slon: number | null;
      }[];

    const regionId = d.prepare('SELECT region_id FROM tasmac_region WHERE name = ?');
    const districtId = d.prepare('SELECT tasmac_district_id FROM tasmac_district WHERE name = ? COLLATE NOCASE');
    const upd = d.prepare(
      `UPDATE shop SET gis_latitude = ?, gis_longitude = ?, gis_offset_m = ?, gis_address = COALESCE(?, gis_address),
                       tasmac_region_id = COALESCE(?, tasmac_region_id),
                       tasmac_district_id = COALESCE(?, tasmac_district_id)
        WHERE shop_no = ?`,
    );

    // The consumer API returns 0,0 for a handful of shops. Null Island is not a
    // coordinate, and comparing against it would report an 8,800 km "offset" and
    // wreck the agreement statistics — so treat it as missing and let the GIS
    // fix stand in (handled by the resolved-coordinate update below).
    const valid = (lat: number | null, lon: number | null) =>
      lat != null && lon != null && !(lat === 0 && lon === 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

    let n = 0;
    for (const r of rows) {
      const offset =
        valid(r.glat, r.glon) && valid(r.slat, r.slon)
          ? Math.round(haversine(r.slat!, r.slon!, r.glat!, r.glon!))
          : null;
      const reg = r.gis_region ? (regionId.get(r.gis_region) as { region_id: number } | undefined) : undefined;
      // GIS district names ("COIMBATORE SOUTH") do not always match the boundary
      // layer's names ("Coimbatore south"); NOCASE handles the common case and a
      // miss simply leaves the link null rather than inventing one.
      const dist = r.gis_district ? (districtId.get(r.gis_district) as { tasmac_district_id: number } | undefined) : undefined;
      upd.run(r.glat, r.glon, offset, r.gaddr, reg?.region_id ?? null, dist?.tasmac_district_id ?? null, r.shop_no);
      n++;
    }
    return n;
  })();
  log(`reconciled ${updated} shops with GIS attributes`);

  // Null Island in the consumer feed is not a location — clear it so the site
  // and the bot fall back to the GIS fix rather than plotting shops off Africa.
  const nulled = d.prepare('UPDATE shop SET latitude = NULL, longitude = NULL WHERE latitude = 0 AND longitude = 0').run().changes;
  if (nulled) log(`cleared ${nulled} shops whose consumer-feed coordinates were 0,0`);

  // Classification lives in one place so a GIS refresh cannot quietly undo an
  // announced closure.
  reclassify();

  const agree = db()
    .prepare(
      `SELECT COUNT(*) AS compared,
              SUM(CASE WHEN gis_offset_m <=  100 THEN 1 ELSE 0 END) AS within_100m,
              SUM(CASE WHEN gis_offset_m <= 1000 THEN 1 ELSE 0 END) AS within_1km,
              SUM(CASE WHEN gis_offset_m > 10000 THEN 1 ELSE 0 END) AS over_10km,
              ROUND(AVG(gis_offset_m)) AS mean_m
         FROM shop WHERE gis_offset_m IS NOT NULL`,
    )
    .get();
  log(`coordinate agreement: ${JSON.stringify(agree)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  harvestGis()
    .then(() => log('GIS harvest complete'))
    .catch((e) => { console.error(e); process.exit(1); });
}
