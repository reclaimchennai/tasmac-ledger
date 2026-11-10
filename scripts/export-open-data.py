"""
Export the open data in opendata/ (small CSVs, kept in git) and release/ (large
gzipped CSVs, uploaded as release assets) from data/tasmac.db.

    python3 scripts/export-open-data.py

Money is in rupees at the printed MRP. Sales are inferred from falling stock in
TASMAC's public feed, so they are a floor: a bottle sold and restocked between
two readings is never seen. Telegram bot tables are never exported.
"""
import csv
import gzip
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "tasmac.db"
OUT = ROOT / "opendata"
BIG = ROOT / "release"

# Same window as the site: from the first full week, through the last trading day that has closed
# (a day closes with its after-midnight report, so 01:30 IST the next day).
WIN = "BETWEEN '2026-08-10' AND date('now', '+330 minutes', '-90 minutes', '-1 day')"

ABV = """CASE WHEN v.category = 'BEER' THEN CASE WHEN UPPER(v.product_name) LIKE '%STRONG%' THEN 0.08 ELSE 0.05 END
              WHEN v.category = 'WINE' THEN 0.12 ELSE 0.428 END"""

SMALL = {
    "catalogue/skus.csv": """
        SELECT sku_id, product_name, product_line_id, product_line, category, liquor_type, is_premium, volume_ml, pack_size,
               mrp AS mrp_rupees, supplier_id, supplier_name, supplier_type, production_type, supplier_city, delisted, registered
        FROM v_sku_full ORDER BY sku_id""",
    "catalogue/suppliers.csv": """
        SELECT supplier_id, name, production_type, address, address_line2, address_line3, city, supplier_code, first_seen, last_seen
        FROM supplier ORDER BY supplier_id""",
    "prices/mrp_history.csv": """
        SELECT m.sku_id, v.product_name, v.category, v.volume_ml, m.mrp AS mrp_rupees, m.buyback_amt AS bottle_refund_rupees,
               m.observed_from AS valid_from, m.observed_to AS valid_to, COALESCE(m.source, 'live TASMAC feed') AS source
        FROM mrp_history m JOIN v_sku_full v USING (sku_id) ORDER BY m.sku_id, m.observed_from""",
    "shops/shops.csv": """
        SELECT s.shop_no, d.name AS district, t.name AS taluk, r.name AS tasmac_region, td.name AS tasmac_district,
               s.address, s.latitude, s.longitude, s.gis_latitude, s.gis_longitude, s.gis_address, s.is_mall_shop,
               s.shop_class, s.is_closed, s.closed_on, s.first_seen, s.last_seen
        FROM shop s LEFT JOIN district d USING (district_id) LEFT JOIN taluk t USING (taluk_id)
        LEFT JOIN tasmac_region r ON r.region_id = s.tasmac_region_id
        LEFT JOIN tasmac_district td ON td.tasmac_district_id = s.tasmac_district_id ORDER BY s.shop_no""",
    "shops/closures.csv": "SELECT shop_no, closed_on, region, district, address, go_district, go_ref, go_sl, source, note FROM shop_closure ORDER BY closed_on, shop_no",
    "shops/offices.csv": "SELECT office_id, name, latitude, longitude FROM tasmac_office ORDER BY office_id",
    "shops/districts.csv": "SELECT district_id, name FROM district ORDER BY district_id",
    "shops/taluks.csv": "SELECT taluk_id, name, district_id FROM taluk ORDER BY taluk_id",
    "sales/daily_summary.csv": f"""
        SELECT f.day, CAST(strftime('%w', f.day) AS INT) AS weekday_0_sunday, SUM(f.units) AS bottles,
               ROUND(SUM(f.revenue_paise) / 1e9, 2) AS sales_crore_rupees, ROUND(SUM(f.units * v.volume_ml) / 1000.0) AS litres,
               ROUND(SUM(f.units * v.volume_ml * {ABV}) / 1000.0) AS pure_alcohol_litres,
               (SELECT COUNT(*) FROM fact_shop_day s WHERE s.day = f.day AND s.units > 0) AS shops_selling
        FROM fact_sales f JOIN v_sku_full v USING (sku_id) WHERE f.day {WIN} GROUP BY f.day ORDER BY f.day""",
    "sales/daily_state.csv": f"""
        SELECT f.day, v.category, SUM(f.units) AS bottles, ROUND(SUM(f.revenue_paise) / 100.0) AS sales_rupees,
               ROUND(SUM(f.units * v.volume_ml) / 1000.0) AS litres, ROUND(SUM(f.units * v.volume_ml * {ABV}) / 1000.0) AS pure_alcohol_litres
        FROM fact_sales f JOIN v_sku_full v USING (sku_id) WHERE f.day {WIN} GROUP BY f.day, v.category ORDER BY f.day, v.category""",
    "sales/daily_district.csv": f"""
        SELECT f.day, d.name AS district, v.category, SUM(f.units) AS bottles, ROUND(SUM(f.revenue_paise) / 100.0) AS sales_rupees
        FROM fact_sales f JOIN v_sku_full v USING (sku_id) JOIN district d USING (district_id)
        WHERE f.day {WIN} GROUP BY f.day, f.district_id, v.category ORDER BY f.day, d.name, v.category""",
    "sales/hourly_district.csv": f"""
        SELECT h.day, d.name AS district, h.hour, h.units AS bottles, ROUND(h.revenue_paise / 100.0) AS sales_rupees
        FROM fact_hour h JOIN district d USING (district_id) WHERE h.day {WIN} ORDER BY h.day, d.name, (h.hour + 18) % 24""",
    "sales/daily_sku_state.csv": f"""
        SELECT f.day, f.sku_id, v.product_name, v.volume_ml, SUM(f.units) AS bottles, ROUND(SUM(f.revenue_paise) / 100.0) AS sales_rupees
        FROM fact_sales f JOIN v_sku_full v USING (sku_id) WHERE f.day {WIN} GROUP BY f.day, f.sku_id ORDER BY f.day, f.sku_id""",
}

LARGE = {
    "sales_by_day_district_sku.csv.gz": f"""
        SELECT f.day, f.district_id, f.sku_id, f.units AS bottles, ROUND(f.revenue_paise / 100.0) AS sales_rupees,
               f.received AS bottles_received, f.shops FROM fact_sales f WHERE f.day {WIN} ORDER BY f.day, f.district_id, f.sku_id""",
    "sales_by_day_shop.csv.gz": f"""
        SELECT day, shop_no, units AS bottles, ROUND(revenue_paise / 100.0) AS sales_rupees, ROUND(ml / 1000.0, 1) AS litres
        FROM fact_shop_day WHERE day {WIN} ORDER BY day, shop_no""",
}


def dump(c, sql, path, opener=open):
    cur = c.execute(sql)
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with opener(path, "wt", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([d[0] for d in cur.description])
        for row in cur:
            w.writerow(row)
            n += 1
    print(f"  {path.relative_to(ROOT)}  {n:,} rows")


def main():
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    for rel, sql in SMALL.items():
        dump(c, sql, OUT / rel)
    if "--small" not in sys.argv:
        for rel, sql in LARGE.items():
            dump(c, sql, BIG / rel, gzip.open)


if __name__ == "__main__":
    main()
