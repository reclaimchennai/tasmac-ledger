-- TASMAC mirror — relational schema
-- Source: https://dashboard-api.tasmace2e.in/api/  (public TASMAC consumer portal API)
--
-- Naming note: upstream calls liquor CATEGORY a "brand" (brandId 5 = BRANDY).
-- We keep that as `liquor_type`, and use `product_line` for the actual commercial
-- brand ("ACCORD NO.1 BLENDED WHISKY"), and `sku` for a bottling of a product line
-- at one size (productId 1114 = ACCORD NO.1 BLENDED WHISKY 180ml).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────── geography ───────────────────────────

CREATE TABLE IF NOT EXISTS district (
  district_id   INTEGER PRIMARY KEY,
  name          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS taluk (
  taluk_id      INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  district_id   INTEGER NOT NULL REFERENCES district(district_id)
);
CREATE INDEX IF NOT EXISTS idx_taluk_district ON taluk(district_id);

CREATE TABLE IF NOT EXISTS shop (
  shop_no       INTEGER PRIMARY KEY,     -- RVShopsNo, unique statewide
  district_id   INTEGER REFERENCES district(district_id),
  taluk_id      INTEGER REFERENCES taluk(taluk_id),
  address       TEXT,
  latitude      REAL,
  longitude     REAL,
  is_mall_shop  INTEGER NOT NULL DEFAULT 0,
  dm_office     TEXT,
  ever_reported INTEGER NOT NULL DEFAULT 0,  -- 1 once the shop has reported stock at
                                        -- least once; monotonic. Operational shops
                                        -- (trading or stopped) are ever_reported=1;
                                        -- dormant shops (never reported) are 0.
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_district ON shop(district_id);
CREATE INDEX IF NOT EXISTS idx_shop_taluk    ON shop(taluk_id);

-- ─────────────────────────── catalogue ───────────────────────────

CREATE TABLE IF NOT EXISTS supplier (
  supplier_id      INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  production_type  TEXT,                 -- Distillery | Brewery | Winery | NULL (import/FL2 only)
  address          TEXT,
  address_line2    TEXT,
  address_line3    TEXT,
  city             TEXT,
  supplier_code    TEXT,
  first_seen       TEXT NOT NULL,
  last_seen        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplier_type ON supplier(production_type);

CREATE TABLE IF NOT EXISTS liquor_type (
  liquor_type_id  INTEGER PRIMARY KEY,   -- upstream brandId
  name            TEXT NOT NULL,         -- BEER, BRANDY, ... OTHER-WHISKY, OTHER-WINE
  category        TEXT NOT NULL,         -- normalised: BEER/BRANDY/WHISKY/RUM/GIN/VODKA/WINE/OTHER
  is_premium      INTEGER NOT NULL DEFAULT 0   -- the OTHER-* families are the FL2/elite range
);

-- A commercial brand, e.g. "ACCORD NO.1 BLENDED WHISKY".
CREATE TABLE IF NOT EXISTS product_line (
  product_line_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  name_key         TEXT NOT NULL,        -- upper/collapsed for dedupe
  supplier_id      INTEGER REFERENCES supplier(supplier_id),
  UNIQUE (name_key, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_pl_supplier ON product_line(supplier_id);

-- One bottling: product line × size. `sku_id` IS the upstream productId.
CREATE TABLE IF NOT EXISTS sku (
  sku_id           INTEGER PRIMARY KEY,  -- upstream productId
  product_line_id  INTEGER NOT NULL REFERENCES product_line(product_line_id),
  liquor_type_id   INTEGER REFERENCES liquor_type(liquor_type_id),
  supplier_id      INTEGER REFERENCES supplier(supplier_id),
  product_name     TEXT NOT NULL,        -- as reported (may vary in case between endpoints)
  unit_name        TEXT,                 -- "180ml"
  volume_ml        INTEGER,              -- parsed
  pack_size        INTEGER,              -- bottles per case
  supplier_type    TEXT,                 -- IMFS / IML / etc, from the MRP list
  mrp              INTEGER,              -- current MRP per bottle (rupees)
  buyback_amt      INTEGER,
  delisted         INTEGER NOT NULL DEFAULT 0,  -- 1 = historical/discontinued, reconstructed from an
                                         -- old published price list, not seen in the live feed
  registered       INTEGER NOT NULL DEFAULT 0,  -- 1 = on a current published list (e.g. IFL/import)
                                         -- but not yet reported in stock by the consumer API
  first_seen       TEXT NOT NULL,
  last_seen        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sku_line     ON sku(product_line_id);
CREATE INDEX IF NOT EXISTS idx_sku_type     ON sku(liquor_type_id);
CREATE INDEX IF NOT EXISTS idx_sku_supplier ON sku(supplier_id);

-- Price changes over time. Each row is a price interval; `observed_to IS NULL`
-- marks the open (current) one. Rows harvested from the live feed have a NULL
-- `source`; rows reconstructed from an older published MRP list cite it there,
-- so a reader can tell a monitored change from a dated-list observation. Between
-- two dated-list readings, intermediate changes we never saw are not recorded.
CREATE TABLE IF NOT EXISTS mrp_history (
  mrp_history_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id          INTEGER NOT NULL REFERENCES sku(sku_id),
  mrp             INTEGER NOT NULL,
  buyback_amt     INTEGER,
  observed_from   TEXT NOT NULL,
  observed_to     TEXT,                  -- NULL = current
  source          TEXT                   -- NULL = live harvest; else the published list cited
);
CREATE INDEX IF NOT EXISTS idx_mrp_sku ON mrp_history(sku_id, observed_from);

-- ─────────────────────────── stock, temporally ───────────────────────────

-- One harvest run.
CREATE TABLE IF NOT EXISTS snapshot (
  snapshot_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  status        TEXT NOT NULL DEFAULT 'running',  -- running | ok | partial | failed
  shops_seen    INTEGER NOT NULL DEFAULT 0,
  rows_seen     INTEGER NOT NULL DEFAULT 0,
  events_written INTEGER NOT NULL DEFAULT 0,
  districts_ok  INTEGER NOT NULL DEFAULT 0,
  districts_failed INTEGER NOT NULL DEFAULT 0,
  note          TEXT
);

-- Each shop's own "last updated" clock, per snapshot. This is what makes the
-- timeline real: upstream refreshes a shop's stock in batches, and only when
-- reported_at moves has anything actually been recounted.
CREATE TABLE IF NOT EXISTS shop_report (
  snapshot_id   INTEGER NOT NULL REFERENCES snapshot(snapshot_id),
  shop_no       INTEGER NOT NULL REFERENCES shop(shop_no),
  reported_at   TEXT,                    -- upstream last_updated_time, normalised ISO
  sku_count     INTEGER NOT NULL DEFAULT 0,
  units         INTEGER NOT NULL DEFAULT 0,
  value_paise   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_id, shop_no)
);
CREATE INDEX IF NOT EXISTS idx_shop_report_shop ON shop_report(shop_no, reported_at);

-- Fast-path current state (one row per shop×sku that we believe is live).
CREATE TABLE IF NOT EXISTS stock_current (
  shop_no       INTEGER NOT NULL REFERENCES shop(shop_no),
  sku_id        INTEGER NOT NULL REFERENCES sku(sku_id),
  qty           INTEGER NOT NULL,
  reported_at   TEXT,
  snapshot_id   INTEGER NOT NULL REFERENCES snapshot(snapshot_id),
  PRIMARY KEY (shop_no, sku_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_current_sku ON stock_current(sku_id);

-- Append-only change log. A row exists only when qty actually moved, so the
-- table stays small while giving an exact step-function history per shop×sku.
CREATE TABLE IF NOT EXISTS stock_event (
  event_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_no       INTEGER NOT NULL REFERENCES shop(shop_no),
  sku_id        INTEGER NOT NULL REFERENCES sku(sku_id),
  qty           INTEGER NOT NULL,        -- new level
  prev_qty      INTEGER,                 -- NULL on first observation
  delta         INTEGER,                 -- qty - prev_qty
  reported_at   TEXT,                    -- shop's own clock
  observed_at   TEXT NOT NULL,           -- when we fetched
  snapshot_id   INTEGER NOT NULL REFERENCES snapshot(snapshot_id)
);
CREATE INDEX IF NOT EXISTS idx_event_shop_sku ON stock_event(shop_no, sku_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_event_sku_time ON stock_event(sku_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_event_snapshot ON stock_event(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_event_time     ON stock_event(observed_at);

-- ─────────────────────────── rollups ───────────────────────────

-- Per shop per day: opening/closing inventory value and depletion-implied revenue.
CREATE TABLE IF NOT EXISTS shop_daily (
  shop_no          INTEGER NOT NULL REFERENCES shop(shop_no),
  day              TEXT NOT NULL,        -- YYYY-MM-DD (IST)
  opening_units    INTEGER NOT NULL DEFAULT 0,
  closing_units    INTEGER NOT NULL DEFAULT 0,
  opening_paise    INTEGER NOT NULL DEFAULT 0,
  closing_paise    INTEGER NOT NULL DEFAULT 0,
  units_sold       INTEGER NOT NULL DEFAULT 0,   -- sum of negative deltas
  units_received   INTEGER NOT NULL DEFAULT 0,   -- sum of positive deltas
  revenue_paise    INTEGER NOT NULL DEFAULT 0,   -- units_sold × MRP
  restock_paise    INTEGER NOT NULL DEFAULT 0,
  sku_count        INTEGER NOT NULL DEFAULT 0,
  stockouts        INTEGER NOT NULL DEFAULT 0,   -- SKUs that hit 0 during the day
  PRIMARY KEY (shop_no, day)
);
CREATE INDEX IF NOT EXISTS idx_shop_daily_day ON shop_daily(day);

-- Per SKU per day statewide.
CREATE TABLE IF NOT EXISTS sku_daily (
  sku_id           INTEGER NOT NULL REFERENCES sku(sku_id),
  day              TEXT NOT NULL,
  units_sold       INTEGER NOT NULL DEFAULT 0,
  units_received   INTEGER NOT NULL DEFAULT 0,
  revenue_paise    INTEGER NOT NULL DEFAULT 0,
  closing_units    INTEGER NOT NULL DEFAULT 0,
  shops_stocking   INTEGER NOT NULL DEFAULT 0,
  shops_stocked_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sku_id, day)
);
CREATE INDEX IF NOT EXISTS idx_sku_daily_day ON sku_daily(day);

-- Bookkeeping for incremental rollups.
CREATE TABLE IF NOT EXISTS meta (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

-- ═══════════════════════════════════════════════════════════════
-- Name canonicalisation
--
-- The upstream catalogue spells the same brand more than one way — "KING FISHER"
-- and "KINGFISHER", "Dewar" and "Dewars", "The Glenlivit" and "The Glenlivet" —
-- and carries a handful of names whose UTF-8 was decoded as GBK somewhere
-- upstream ("CUV脡E" for "CUVÉE").
--
-- The upstream spelling is never edited. `name_rule` is the reviewable reference
-- of what the official spelling is and where it was verified; `name_alias` is the
-- materialised result of applying those rules, joined in at display time. So a
-- re-harvest cannot undo a correction, and the raw feed stays exactly as
-- published for anyone who wants to compare.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS name_rule (
  rule_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,     -- mojibake | brand | style
  pattern      TEXT NOT NULL,     -- JS regex source, applied case-insensitively
  replacement  TEXT NOT NULL,
  official     TEXT,              -- the registered spelling this enforces
  source       TEXT,              -- where that spelling was verified
  note         TEXT,
  seq          INTEGER NOT NULL,  -- application order; lower runs first
  UNIQUE (pattern, replacement)
);

CREATE TABLE IF NOT EXISTS name_alias (
  entity        TEXT NOT NULL,    -- product_line | sku | supplier
  entity_id     INTEGER NOT NULL,
  raw_name      TEXT NOT NULL,    -- exactly as upstream published it
  display_name  TEXT NOT NULL,    -- after the rules
  rules_applied TEXT,             -- comma-separated rule_ids, for audit
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (entity, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_alias_entity ON name_alias(entity);

-- ═══════════════════════════════════════════════════════════════
-- Tamil
--
-- The consumer API and TNGIS both publish English only — there is no Tamil feed
-- to mirror — so Tamil text is generated here and marked with how it was made:
-- `curated` is hand-written and trustworthy, `machine` came from a translation
-- API, `translit` is rule-based Latin→Tamil script for proper nouns that should
-- not be translated at all. The site shows the provenance rather than passing
-- machine output off as official.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS name_i18n (
  entity      TEXT NOT NULL,      -- district | taluk | product_line | sku | supplier | liquor_type
  entity_id   INTEGER NOT NULL,
  lang        TEXT NOT NULL,      -- ta
  text        TEXT NOT NULL,
  method      TEXT NOT NULL,      -- curated | machine | translit
  source      TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity, entity_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_i18n_lookup ON name_i18n(entity, lang);

-- ─────────────────────────── views ───────────────────────────

-- `product_name`, `product_line` and `supplier_name` are the corrected spellings;
-- `raw_*` keeps what upstream actually published, beside it rather than instead
-- of it. See the name_rule / name_alias block below.
DROP VIEW IF EXISTS v_sku_full;
CREATE VIEW v_sku_full AS
SELECT
  s.sku_id,
  COALESCE(ask.display_name, s.product_name) AS product_name,
  s.product_name AS raw_product_name,
  s.unit_name, s.volume_ml, s.pack_size,
  s.mrp, s.supplier_type, s.delisted, s.registered,
  pl.product_line_id,
  COALESCE(apl.display_name, pl.name) AS product_line,
  pl.name AS raw_product_line,
  lt.liquor_type_id, lt.name AS liquor_type, lt.category, lt.is_premium,
  sup.supplier_id,
  COALESCE(asu.display_name, sup.name) AS supplier_name,
  sup.name AS raw_supplier_name,
  sup.production_type, sup.city AS supplier_city
FROM sku s
JOIN product_line pl ON pl.product_line_id = s.product_line_id
LEFT JOIN liquor_type lt ON lt.liquor_type_id = s.liquor_type_id
LEFT JOIN supplier sup ON sup.supplier_id = s.supplier_id
LEFT JOIN name_alias ask ON ask.entity = 'sku'          AND ask.entity_id = s.sku_id
LEFT JOIN name_alias apl ON apl.entity = 'product_line' AND apl.entity_id = pl.product_line_id
LEFT JOIN name_alias asu ON asu.entity = 'supplier'     AND asu.entity_id = sup.supplier_id;



DROP VIEW IF EXISTS v_stock_valued;
CREATE VIEW v_stock_valued AS
SELECT sc.shop_no, sc.sku_id, sc.qty, sc.reported_at,
       sk.mrp, (sc.qty * COALESCE(sk.mrp,0) * 100) AS value_paise
FROM stock_current sc JOIN sku sk ON sk.sku_id = sc.sku_id;

-- ═══════════════════════════════════════════════════════════════
-- TNGIS overlay (tngis.tn.gov.in GeoServer, generic_viewer workspace)
--
-- TASMAC runs its own administrative hierarchy — 5 regions divided into 38
-- TASMAC districts — which is NOT the revenue-district geography the consumer
-- API reports against. Only the GIS server publishes it, so region is joined in
-- from there on shop number.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tasmac_region (
  region_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE          -- Chennai | Salem | Trichy | Madurai | Coimbatore
);

CREATE TABLE IF NOT EXISTS tasmac_district (
  tasmac_district_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,         -- "Arakkonam", "Chennai north", …
  region_id    INTEGER REFERENCES tasmac_region(region_id),
  geojson      TEXT                          -- MultiPolygon boundary
);

-- Raw geotagged shop points as published by TNGIS, kept separate from `shop`
-- so the two sources can be compared rather than silently merged.
CREATE TABLE IF NOT EXISTS gis_shop (
  gis_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_no       INTEGER,                     -- tasmac_sho; NULL/0 where unlabelled
  latitude      REAL,
  longitude     REAL,
  address       TEXT,
  gis_district  TEXT,                        -- TASMAC district, e.g. "COIMBATORE SOUTH"
  gis_region    TEXT,                        -- TASMAC region
  object_id     INTEGER,
  layer         TEXT NOT NULL,
  fetched_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gis_shop_no ON gis_shop(shop_no);

CREATE TABLE IF NOT EXISTS tasmac_office (
  office_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT,
  latitude      REAL,
  longitude     REAL,
  object_id     INTEGER,
  fetched_at    TEXT NOT NULL
);

-- Sensitive facilities (schools, religious places, bus stands) within 500 m,
-- as computed by TNGIS itself.
CREATE TABLE IF NOT EXISTS shop_proximity (
  shop_no       INTEGER PRIMARY KEY,
  buffer_m      INTEGER,
  facility_names TEXT,
  facility_types TEXT,
  facility_count INTEGER,
  district_name TEXT,
  fetched_at    TEXT NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- Telegram bot state
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bot_user (
  chat_id     INTEGER PRIMARY KEY,
  first_name  TEXT,
  username    TEXT,
  last_lat    REAL,
  last_lon    REAL,
  nav         TEXT,                       -- JSON: transient browse position
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_fav_shop (
  chat_id   INTEGER NOT NULL REFERENCES bot_user(chat_id),
  shop_no   INTEGER NOT NULL,
  added_at  TEXT NOT NULL,
  PRIMARY KEY (chat_id, shop_no)
);

CREATE TABLE IF NOT EXISTS bot_fav_sku (
  chat_id   INTEGER NOT NULL REFERENCES bot_user(chat_id),
  sku_id    INTEGER NOT NULL,
  added_at  TEXT NOT NULL,
  PRIMARY KEY (chat_id, sku_id)
);

-- Long-polling cursor, so a restart does not replay old updates.
CREATE TABLE IF NOT EXISTS bot_offset (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  offset  INTEGER NOT NULL
);

-- ─────────────────────────── views over the GIS overlay ───────────────────────────
-- (defined last: depends on the TNGIS tables above)

-- `lat`/`lon` are the resolved coordinates: the consumer feed where it has them,
-- the TNGIS geotag where it does not. The raw pairs stay exposed alongside so the
-- two sources can still be compared.
DROP VIEW IF EXISTS v_shop_full;
CREATE VIEW v_shop_full AS
SELECT sh.shop_no, sh.address, sh.is_mall_shop, sh.dm_office, sh.shop_class, sh.ever_reported,
       COALESCE(sh.latitude, sh.gis_latitude)  AS lat,
       COALESCE(sh.longitude, sh.gis_longitude) AS lon,
       sh.latitude, sh.longitude, sh.gis_latitude, sh.gis_longitude, sh.gis_offset_m,
       d.district_id, d.name AS district, t.taluk_id, t.name AS taluk,
       sh.tasmac_region_id AS region_id, tr.name AS region,
       sh.tasmac_district_id, td.name AS tasmac_district
FROM shop sh
LEFT JOIN district d ON d.district_id = sh.district_id
LEFT JOIN taluk t ON t.taluk_id = sh.taluk_id
LEFT JOIN tasmac_region tr ON tr.region_id = sh.tasmac_region_id
LEFT JOIN tasmac_district td ON td.tasmac_district_id = sh.tasmac_district_id;

-- ═══════════════════════════════════════════════════════════════
-- Announced closures
--
-- Shops shut by government order. This is a declared, dated fact from an
-- external list, not something inferable from the stock feed — a shop can stop
-- reporting for a night without being closed, and a closed shop can keep
-- reporting stale stock for a while. So it is recorded separately and takes
-- priority when classifying.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shop_closure (
  shop_no        INTEGER PRIMARY KEY,
  closed_on      TEXT,          -- date of the order, where known
  region         TEXT,          -- TASMAC region as printed on the list
  district       TEXT,          -- TASMAC district as printed on the list
  source         TEXT NOT NULL, -- where the list came from
  note           TEXT,
  recorded_at    TEXT NOT NULL,
  in_register    INTEGER NOT NULL DEFAULT 0,  -- did the shop number exist in our register
  -- Archive fields imported from the official closure order (the authoritative
  -- source): the shop's full address as printed, its TASMAC administrative
  -- district (e.g. "Kanchipuram(N)"), the G.O. reference, and its serial in the
  -- published list. Kept so the 717 are a complete standalone record even for the
  -- shops we never saw report.
  address        TEXT,          -- official address as printed in the G.O. list
  go_district    TEXT,          -- TASMAC administrative district from the G.O.
  go_ref         TEXT,          -- the government order, e.g. "G.O.(Ms) No.129 dated 12.05.2026"
  go_sl          INTEGER        -- serial number in the published list
);
CREATE INDEX IF NOT EXISTS idx_closure_region ON shop_closure(region);


-- ═══════════════════════════════════════════════════════════════
-- Sales analytics (the /db dashboard and the posters)
--
-- Rebuilt from stock_event by src/scraper/analytics.ts. Two differences from
-- shop_daily / sku_daily, both deliberate:
--
--   • Trading day, not calendar day. Shops close at 22:00 and the feed reports
--     the last hour's movement after midnight, so a change observed before
--     11:00 belongs to the previous evening. Counted by calendar day, every
--     dry day showed ~7 lakh bottles "sold" — all of it observed at 00:xx.
--   • Declared feed artefacts are excluded (sales_exclusion), so a supplier's
--     stock being pulled from the shelves is not booked as a day of sales.
-- ═══════════════════════════════════════════════════════════════

-- A snapshot's movements for one supplier (or every supplier, NULL) that are
-- not sales: stock withdrawn, not bought.
CREATE TABLE IF NOT EXISTS sales_exclusion (
  snapshot_id   INTEGER NOT NULL REFERENCES snapshot(snapshot_id),
  supplier_id   INTEGER,                  -- NULL = every supplier in the snapshot
  reason        TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, supplier_id)
);

-- Trading day × district × SKU. Revenue at the SKU's MRP.
CREATE TABLE IF NOT EXISTS fact_sales (
  day            TEXT NOT NULL,
  district_id    INTEGER NOT NULL,
  sku_id         INTEGER NOT NULL,
  units          INTEGER NOT NULL,        -- bottles sold (sum of falls)
  revenue_paise  INTEGER NOT NULL,
  received       INTEGER NOT NULL,        -- bottles delivered (sum of rises)
  shops          INTEGER NOT NULL,        -- shops that sold at least one
  PRIMARY KEY (day, district_id, sku_id)
);
CREATE INDEX IF NOT EXISTS idx_fact_sales_sku ON fact_sales(sku_id);

-- Trading day × shop.
CREATE TABLE IF NOT EXISTS fact_shop_day (
  day            TEXT NOT NULL,
  shop_no        INTEGER NOT NULL,
  units          INTEGER NOT NULL,
  revenue_paise  INTEGER NOT NULL,
  ml             INTEGER NOT NULL,        -- bulk volume sold, millilitres
  PRIMARY KEY (day, shop_no)
);

-- Trading day × district × hour of the shop's own report clock. The feed
-- refreshes each shop half-hourly, so a report at 19:35 carries what sold
-- between 19:05 and 19:35.
CREATE TABLE IF NOT EXISTS fact_hour (
  day            TEXT NOT NULL,
  district_id    INTEGER NOT NULL,
  hour           INTEGER NOT NULL,
  units          INTEGER NOT NULL,
  revenue_paise  INTEGER NOT NULL,
  PRIMARY KEY (day, district_id, hour)
);
