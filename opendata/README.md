# Open data

Plain CSV files, UTF-8, one header row. Money is in rupees at the printed MRP. Sales start on 10 Aug 2026 and run to the last day that had closed when the files were made. Rebuild them with `python3 scripts/export-open-data.py`.

Sales are worked out from falling stock, so they are a floor. A bottle sold and restocked between two readings, 20 minutes apart, is never seen.

## Prices

**`prices/mrp_history.csv`** has every price we have for every bottling. Each row is one price and the dates it was valid. Rows from old TASMAC price lists name the list in `source`. Rows from the live feed say `live TASMAC feed`. A blank `valid_to` means the price is still current. `bottle_refund_rupees` is the deposit refunded when the empty bottle is returned, added in November 2026.

Old lists were read from scanned PDFs. Each bottling's prices were checked to only ever go up, and to stay below today's price, which throws out most misreadings. The original PDFs are in the releases.

## Catalogue

| File | One row per |
| --- | --- |
| `catalogue/skus.csv` | Bottling, with its brand, drink, size, current price and maker. `delisted` is 1 for bottlings only found in old price lists. `registered` is 1 for ones on the current list that have not reached the shops yet |
| `catalogue/suppliers.csv` | Distillery, brewery or importer |

## Shops

| File | One row per |
| --- | --- |
| `shops/shops.csv` | Shop, with its district, taluk, TASMAC region, address and location. `gis_latitude` and `gis_longitude` are from the state map server where it has the shop |
| `shops/closures.csv` | Shop closed by government order, with the order details |
| `shops/offices.csv` | TASMAC office |
| `shops/districts.csv`, `shops/taluks.csv` | District and taluk, with the IDs used elsewhere |

## Sales

| File | One row per |
| --- | --- |
| `sales/daily_summary.csv` | Day, for the whole state. Bottles, rupees in crore, litres, pure alcohol and shops that sold |
| `sales/daily_state.csv` | Day and drink (brandy, beer and so on) |
| `sales/daily_district.csv` | Day, district and drink |
| `sales/hourly_district.csv` | Day, district and hour of the shop's report. Hour 0 is the closing report that arrives after midnight |
| `sales/daily_sku_state.csv` | Day and bottling, for the whole state |

Pure alcohol assumes 42.8% for spirits, 8% for strong beer, 5% for other beer and 12% for wine, since the feed gives no strength.

A day runs from 11 am to 11 am the next morning, because the last report of the evening reaches the feed after midnight. Dry days have no rows.

## In the releases

| File | What it is |
| --- | --- |
| `sales_by_day_district_sku.csv.gz` | Day, district and bottling, with bottles received and the number of shops |
| `sales_by_day_shop.csv.gz` | Day and shop |
| `tasmac.db.zst.part00` and on | The full SQLite database, every reading since 5 Aug 2026. Join the parts and unpack with `cat tasmac.db.zst.part* \| zstd -d -o tasmac.db` |
| `pdfs/` files | The original TASMAC price lists and the population report |
| `posters/` files | The posters as PDF |

The database layout is in `src/lib/schema.sql`. Telegram bot users are not in the published database.
