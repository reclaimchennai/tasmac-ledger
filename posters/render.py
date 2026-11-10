#!/usr/bin/env python3
"""
TASMAC sales posters -> data/posters/<kind>_<en|ta>.{png,pdf} + <kind>_<en|ta>_preview.jpg

The sibling of the power and boats sheets (~/projects/electric/scripts/render_poster.py,
~/projects/boats/scripts/render_poster.py): pale paper, a spaced pink kicker, a large black
headline, white boxed cards with a dark edge along the foot, and the sources set small at
the bottom. Each sheet is monolingual — the Tamil sheet carries no English, the English
sheet no Tamil.

Sheets (18 x 24 in portrait):
  overview   the period in one sheet: totals, every day stacked by category, the week,
             the hours, what sells, the eve of a dry day
  districts  where: the 38 districts shaded and ranked, sales per shop, the busiest shops
  brands     who: the top 30 brands and the distilleries and breweries behind them, bottle
             sizes and prices

Written as HTML with inline SVG and printed by headless Chromium (Playwright): matplotlib
cannot shape Tamil, and a browser sets type properly at poster sizes. The numbers come from
the same fact tables as tasmac.reclaimchennai.city/db (src/scraper/analytics.ts), over the
same window, with the same exclusions, so a poster and the dashboard always agree.

    python3 posters/render.py                     # every sheet, both languages
    python3 posters/render.py --only overview --lang ta
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import math
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "tasmac.db"
OUT = ROOT / "data" / "posters"
GEO = ROOT / "src" / "data" / "tn-districts.json"
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
ANALYSIS_FROM = "2026-08-10"          # same as src/lib/dashboard.ts

# house style (electric/render_poster.py)
PAPER, INK, MUTED, ACCENT, CARD, EDGE, RULE = "#f4f1ea", "#1a1a1a", "#6f6b64", "#e8447f", "#ffffff", "#1f2229", "#d8d2c6"
# the validated category set the site uses (globals.css --cat-*), in stack order
CATS = ["BRANDY", "RUM", "VODKA", "BEER", "WINE", "GIN", "WHISKY", "OTHER"]
CAT_COLOR = {"BRANDY": "#2a78d6", "RUM": "#eb6834", "VODKA": "#1baf7a", "BEER": "#eda100", "WINE": "#e87ba4",
             "GIN": "#008300", "WHISKY": "#4a3aa7", "OTHER": "#8f8778"}
# Magnitude — the hours, the district maps, the rank bars — is drawn in crimson,
# never in blue or a category colour: blue is brandy here, and brandy is
# two-thirds of every rupee, so a blue map or a blue column read as "brandy".
# Validated as an ordinal ramp against the paper (dataviz validate_palette.js
# --ordinal): one hue, monotone lightness, the palest step still 2.10:1 so the
# lowest-ranked district does not vanish into the sheet. Steps 3-6 sit >= 14 ΔE
# (OKLab) from every category; the two palest are salmon, ~7 from wine's pink,
# acceptable because none of these charts carries a category legend.
SEQ = ["#e59292", "#d47476", "#c2555a", "#ac3941", "#8e252f", "#6e1721", "#4f0913"]
MARK = SEQ[3]                         # single-series marks: columns, rank bars, dots
# The week sits right above the hours on the overview and the two must not read as
# one chart, so the week gets its own hue: plum, >= 10.9 ΔE from every crimson step
# and >= 12 from every category colour.
WEEK = "#72386e"
DRY = {"2026-08-15": "independence", "2026-08-26": "milad", "2026-10-02": "gandhi"}
ABV = """CASE WHEN lt.category = 'BEER' THEN CASE WHEN UPPER(s.product_name) LIKE '%STRONG%' THEN 0.08 ELSE 0.05 END
              WHEN lt.category = 'WINE' THEN 0.12 ELSE 0.428 END"""

W_IN, H_IN = 18, 24
W, H = W_IN * 96, H_IN * 96          # CSS px; the PDF prints at exactly 18 x 24 in
PAD = 72

# ── words ─────────────────────────────────────────────────────────────

T = {
    "en": {
        "state": "TAMIL NADU",
        "kicker": "TASMAC SALES · {from_} – {to}",
        "overview_t": "What Tamil Nadu bought at TASMAC",
        "overview_s": "{days} trading days of every TASMAC shop's stock, read every 20 minutes from the public feed. A fall in stock is a bottle sold, valued at its printed price.",
        "districts_t": "Where Tamil Nadu buys its liquor",
        "districts_s": "Sales at MRP in each of the 38 districts over {days} trading days. Numbers on the map are the ranks in the list.",
        "brands_t": "The brands and distilleries behind {total}",
        "brands_s": "Sales at MRP by brand and by supplier over {days} trading days. Bar colour is the liquor category.",
        "total": "sales at MRP", "perday": "a day", "bottles": "bottles sold", "shops": "shops selling",
        "litres": "litres sold", "alc": "litres of pure alcohol (est.)",
        "daily": "EVERY DAY, BY CATEGORY", "daily_s": "Sales at MRP. The three gaps are dry days.",
        "week": "THE WEEK", "week_s": "Average day, ordinary days only",
        "hours": "THE HOURS", "hours_s": "Average sales by weekday and hour of the shop's report",
        "mix": "WHAT SELLS", "mix_s": "Every bar is 100% of one thing, split by category",
        "mix_rows": ["Money spent", "Bottles sold", "Litres sold", "Pure alcohol"],
        "eve": "THE DAY BEFORE A DRY DAY", "eve_row": "Eve of {name}", "eve_vs": "{pct} above an ordinary {wd}",
        "topsup": "WHO SELLS MOST", "topbrand": "MOST BOUGHT", "quarter": "THE QUARTER BOTTLE",
        "quarter_v": "{pct} of all money", "quarter_s": "spent on 180 ml bottles; {bpct} of bottles cost ₹150 or less.",
        "month": "SEPTEMBER, THE ONE FULL MONTH", "month_s": "{avg} a trading day",
        "rank": "THE 38 DISTRICTS", "rank_cols": ["District", "Sales", "Per shop a day"],
        "chennai": "CHENNAI", "chennai_s": "of the state's sales, from {shops} shops",
        "busiest": "THE BUSIEST SHOP", "busiest_s": "#{no} {where}, {rev} in {days} days",
        "perShop": "HIGHEST SALES PER SHOP", "perShop_s": "{rev} per shop per trading day",
        "conc": "HOW EVEN IT IS", "conc_s": "The busiest 10% of shops take {pct} of sales.",
        "brands_h": "THE TOP 30 BRANDS", "sup_h": "THE TOP 15 SUPPLIERS",
        "sup_share": "The top 3 hold {p3} and the top 5 {p5} of all sales.",
        "sizes": "BY BOTTLE SIZE", "sizes_s": "Share of bottles sold", "prices": "BY PRICE", "prices_s": "Bottles sold by MRP band (₹)",
        "beer_note": "the small figure under each column is beer's share",
        "cat_h": "WHAT EACH CATEGORY IS WORTH", "cat_s": "Sales at MRP by liquor category",
        "mixd": "WHAT EACH DISTRICT DRINKS", "mixd_s": "Share of each district's sales by category, ordered by brandy's share",
        "nbrands": "BRANDS SOLD", "nbrands_s": "{n} brands from {s} suppliers sold at least one bottle",
        "top_sku": "THE BEST SELLER", "top_sku_s": "{units} bottles of {name}",
        "foot1": "Rendered {now} IST from tasmac.reclaimchennai.city/db · @reclaimchennai. Window {from_} to {to}; the first five days of collection (outages) are left out.",
        "foot2": "The source is TASMAC's public stock feed, mirrored every 20 minutes. Sales are inferred from falling stock and valued at MRP. They are floors, not audits, since a bottle sold and replaced between two readings is never seen. Days are trading days (the last evening hour is reported after midnight).",
        "foot_alc": "Pure alcohol is the ethanol in a drink, what is left once the water, sugar and flavouring are taken out, so it puts spirits, beer and wine on one scale. A 180 ml quarter at 42.8% holds 77 ml of it, about six standard drinks of 10 g; a 650 ml strong beer at 8% holds 52 ml, about four. The feed carries no strength, so spirits are taken at 42.8%, strong beer 8%, lager 5%, wine 12%.",
        "foot3": "Left out is the ENRICA ENTERPRISES range, withdrawn from 3,923 shops on 14 Aug (53.7 lakh bottles) and returned on 15 Aug. That stock was removed, not sold. District outlines dissolved from TNGIS village and town layers.",
        "dry": {"independence": "Independence Day", "milad": "Milad-un-Nabi", "gandhi": "Gandhi Jayanti", "closed": "Shops shut"},
        "wd": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "pc_t": "How much that is, each",
        "pc_s": "{days} days of TASMAC sales scaled to a year, divided by the people there are to drink them, using the 2026 district population projection and the share of adults who told the National Family Health Survey they drink.",
        "pc_pop": "People in Tamil Nadu", "pc_pop_s": "projected for 2026",
        "pc_drinkers": "Drinkers", "pc_drinkers_s": "{pct} of adults 15+, {m} of men and {w} of women",
        "pc_head": "A year, per head", "pc_head_s": "{adult} per adult 15+",
        "pc_perdrinker": "A year, per drinker", "pc_perdrinker_s": "{alc} litres of pure alcohol",
        "pc_map": "Rupees a year, per drinker", "pc_map_s": "Shaded by rank. The number on each district is its place in the list.",
        "pc_rank_cols": ["District", "Men who drink", "Per head", "Per drinker"],
        "pc_scat": "What people say, and what they buy",
        "pc_scat_s": "Across is the share of men 15+ who told NFHS-6 they drink. Up is rupees a year per adult. Dot size is the district's total sales. If the survey explained sales the dots would climb left to right. They do the opposite.",
        "pc_scat_x": "Men 15+ who say they drink (%)", "pc_scat_y": "Rupees a year per adult",
        "pc_most": "Buys the most", "pc_most_s": "per drinker a year, or {alc} litres of pure alcohol",
        "pc_least": "Buys the least", "pc_least_s": "per drinker a year, a {x}x spread across the state",
        "pc_para": "The Chennai paradox", "pc_para_s": "Chennai reports the lowest drinking in Tamil Nadu at {pct} of men, and buys {rev} a year per adult, {rank} of 38.",
        "pc_who": "Against the world", "pc_who_s": "{l} litres of pure alcohol per adult 15+ a year. The WHO puts India near 5 and France near 12.",
        "pc_foot": "Population from the Census of India, Report of the Technical Group on Population Projections (National Commission on Population, July 2020), district tables for Tamil Nadu, 2026. The report projects the 32 districts of 2011; each is split across today's 38 in proportion to their 2011 census populations. Drinking from the NFHS-6 (2023-24) district fact sheets, men and women aged 15+ who consume alcohol.",
        "pc_foot2": "A bottle is counted where it was bought, not where the buyer lives, so districts ringing Chennai and those on the highways and the state border read high and their neighbours read low. Fewer people tell a surveyor they drink than the shelves imply, so every per-drinker figure is too high by the same unknown factor. Use them to rank districts, not to measure a person.",
        "wds": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        "mon": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        "cat": {"BRANDY": "Brandy", "RUM": "Rum", "VODKA": "Vodka", "BEER": "Beer", "WINE": "Wine", "GIN": "Gin", "WHISKY": "Whisky", "OTHER": "Other"},
        "fest_kicker": "TASMAC SALES · {name} {year} · {span}",
        "fest_t": "{name} {year}, {total} in {n} days",
        "fest_s": "Every TASMAC shop's stock, read every 20 minutes from the public feed, {span}. A fall in stock is a bottle sold, valued at its printed price, and each day is set against an ordinary day of the same weekday.",
        "fest_total": "sales at MRP over the {n} days", "fest_total_s": "{pct} above ordinary days",
        "fest_extra": "more than ordinary days sell", "fest_extra_s": "the festival's own share",
        "fest_bottles": "bottles sold", "fest_bottles_s": "{extra} more than usual",
        "fest_peak": "on {day}, the busiest day", "fest_peak_s": "{pct} above an ordinary {wd}",
        "fest_days": "DAY BY DAY", "fest_days_s": "Sales at MRP. The black rule across each column is an ordinary day of the same weekday.",
        "fest_hours": "{label}, HOUR BY HOUR", "fest_hours_s": "Sales added up through the day; dashed, an ordinary {wd}. The last point is the closing report, after midnight.",
        "fest_close": "Close",
        "fest_cats": "WHICH DRINKS ROSE", "fest_cats_s": "Change in sales over the {n} days, against ordinary days",
        "fest_map": "WHICH DISTRICTS ROSE", "fest_map_s": "Change against ordinary days over the {n} days, shaded by rank; the number is the place in the list.",
        "fest_rank_cols": ["District", "Sales", "Change"],
        "fest_hist": "EVERY DEEPAVALI SINCE {first}", "fest_hist_s": "TASMAC's own figures for the eve and the day itself, as its officials gave them to the press, averaged to one day. The pale column is this feed, a floor.",
        "fest_reg": "THE FIVE REGIONS", "fest_reg_s": "Share of the state, this feed ({ours}) · TASMAC's own ({year})",
        "fest_quote": "WHAT TASMAC WILL QUOTE", "fest_quote_s": "this feed's {span}, the eve and the day, the span TASMAC usually reports. Its figure counts every sale; this one is a floor.",
        "fest_day": "{name} ITSELF", "fest_day_s": "{pct} above an ordinary {wd}; the eve sold {eve}",
        "fest_city": "THE CITY EMPTIES", "fest_city_s": "Chennai rose {c} against {s} statewide; TASMAC's officials put it down to people going home for the festival.",
        "fest_foot1": "Rendered {now} IST from tasmac.reclaimchennai.city/db · @reclaimchennai.",
        "fest_least": "THE SMALLEST RISE", "fest_least_s": "{d} rose {c} against {s} statewide.",
        "fest_off": {"0": "{name}", "-1": "Eve", "1": "Day after", "-n": "{n} days before", "n": "{n} days after"},
        "fest_foot": "Ordinary days are the same weekday in the eight weeks before {start}, leaving out dry days, the day before one, other festivals ({others}) and any day that sold under 60% of that weekday's median. Districts and categories use the same days, so the cuts add up. Regions are TASMAC's five; the {unplaced} shops the TNGIS layer never placed take their district's majority region.",
        "fest_foot2": "Earlier years are TASMAC's own figures as its officials reported them ({sources}). Releases quote different spans (two days; three when Deepavali falls on a Monday), so years are compared on the eve and the day. 2015's eve is the two-day total less the day.",
        "crore": " cr", "lakh": " lakh", "k": "k", "ml": "ml", "l": "L",
        "font": "'Noto Sans', 'Noto Sans Tamil', sans-serif",
    },
    "ta": {
        "state": "தமிழ்நாடு",
        "kicker": "டாஸ்மாக் விற்பனை · {from_} – {to}",
        "overview_t": "டாஸ்மாக்கில் தமிழ்நாடு வாங்கியது என்ன",
        "overview_s": "ஒவ்வொரு டாஸ்மாக் கடையின் இருப்பும் பொதுத் தரவிலிருந்து 20 நிமிடங்களுக்கு ஒருமுறை படிக்கப்பட்டது, {days} விற்பனை நாட்கள். இருப்புக் குறைவு விற்ற பாட்டிலாக, அச்சிட்ட விலையில் கணக்கிடப்படுகிறது.",
        "districts_t": "தமிழ்நாடு எங்கே மது வாங்குகிறது",
        "districts_s": "{days} விற்பனை நாட்களில் 38 மாவட்டங்களின் விற்பனை (அதிகபட்ச சில்லறை விலையில்). வரைபடத்தில் உள்ள எண்கள் பட்டியலின் தரவரிசை.",
        "brands_t": "{total} விற்பனைக்குப் பின்னால் உள்ள பிராண்டுகளும் ஆலைகளும்",
        "brands_s": "{days} விற்பனை நாட்களில் பிராண்ட் மற்றும் வழங்குநர் வாரியாக விற்பனை. பட்டையின் நிறம் மது வகையைக் குறிக்கும்.",
        "total": "விற்பனை (அதிகபட்ச சில்லறை விலையில்)", "perday": "நாளொன்றுக்கு", "bottles": "விற்ற பாட்டில்கள்", "shops": "விற்பனை செய்த கடைகள்",
        "litres": "விற்ற லிட்டர்", "alc": "லிட்டர் தூய ஆல்கஹால் (மதிப்பீடு)",
        "daily": "நாள்தோறும், வகை வாரியாக", "daily_s": "அதிகபட்ச சில்லறை விலையில் விற்பனை. மூன்று இடைவெளிகளும் மதுவிலக்கு நாட்கள்.",
        "week": "வாரம்", "week_s": "சராசரி நாள், வழக்கமான நாட்கள் மட்டும்",
        "hours": "நேரம்", "hours_s": "கிழமை மற்றும் கடையின் அறிக்கை நேரம் வாரியாக சராசரி விற்பனை",
        "mix": "எது விற்கிறது", "mix_s": "ஒவ்வொரு பட்டையும் ஒரு அளவின் 100%, வகை வாரியாக",
        "mix_rows": ["செலவான பணம்", "விற்ற பாட்டில்கள்", "விற்ற லிட்டர்", "தூய ஆல்கஹால்"],
        "eve": "மதுவிலக்கு நாளுக்கு முந்தைய நாள்", "eve_row": "{name} முந்தைய நாள்", "eve_vs": "வழக்கமான {wd} விட {pct} அதிகம்",
        "topsup": "அதிகம் விற்பவர்கள்", "topbrand": "அதிகம் வாங்கப்பட்டவை", "quarter": "குவார்ட்டர் பாட்டில்",
        "quarter_v": "மொத்தப் பணத்தில் {pct}", "quarter_s": "180 மி.லி பாட்டில்களுக்குச் செலவானது; {bpct} பாட்டில்களின் விலை ₹150 அல்லது குறைவு.",
        "month": "செப்டம்பர், ஒரே முழு மாதம்", "month_s": "விற்பனை நாளொன்றுக்கு {avg}",
        "rank": "38 மாவட்டங்கள்", "rank_cols": ["மாவட்டம்", "விற்பனை", "கடைக்கு நாளொன்றுக்கு"],
        "chennai": "சென்னை", "chennai_s": "மாநில விற்பனையில், {shops} கடைகளிலிருந்து",
        "busiest": "அதிகம் விற்கும் கடை", "busiest_s": "#{no} {where}, {days} நாட்களில் {rev}",
        "perShop": "கடைக்கு அதிக விற்பனை", "perShop_s": "ஒரு கடைக்கு விற்பனை நாளொன்றுக்கு {rev}",
        "conc": "எவ்வளவு சமமாக", "conc_s": "அதிகம் விற்கும் 10% கடைகள் விற்பனையில் {pct} பெறுகின்றன.",
        "brands_h": "முதல் 30 பிராண்டுகள்", "sup_h": "முதல் 15 வழங்குநர்கள்",
        "sup_share": "முதல் 3 நிறுவனங்களின் பங்கு {p3}, முதல் 5 நிறுவனங்களின் பங்கு {p5}.",
        "sizes": "பாட்டில் அளவு வாரியாக", "sizes_s": "விற்ற பாட்டில்களில் பங்கு", "prices": "விலை வாரியாக", "prices_s": "விலைப் பிரிவு வாரியாக விற்ற பாட்டில்கள் (₹)",
        "beer_note": "ஒவ்வொரு பட்டைக்கும் கீழுள்ள சிறிய எண் பீரின் பங்கு",
        "cat_h": "ஒவ்வொரு வகையின் மதிப்பு", "cat_s": "மது வகை வாரியாக விற்பனை",
        "mixd": "ஒவ்வொரு மாவட்டமும் குடிப்பது", "mixd_s": "ஒவ்வொரு மாவட்ட விற்பனையிலும் வகைப் பங்கு, பிராந்தியின் பங்கு வரிசையில்",
        "nbrands": "விற்ற பிராண்டுகள்", "nbrands_s": "{s} வழங்குநர்களின் {n} பிராண்டுகள் குறைந்தது ஒரு பாட்டில் விற்றன",
        "top_sku": "அதிகம் விற்றது", "top_sku_s": "{name}, {units} பாட்டில்கள்",
        "foot1": "{now} அன்று tasmac.reclaimchennai.city/db இலிருந்து உருவாக்கப்பட்டது · @reclaimchennai. காலம் {from_} முதல் {to} வரை; சேகரிப்பின் முதல் ஐந்து நாட்கள் (இடையூறுகள்) சேர்க்கப்படவில்லை.",
        "foot2": "மூலம் டாஸ்மாக் பொது இருப்புத் தரவு, 20 நிமிடங்களுக்கு ஒருமுறை நகலெடுக்கப்பட்டது. இருப்புக் குறைவிலிருந்து கணக்கிடப்பட்ட விற்பனை, அதிகபட்ச சில்லறை விலையில். இவை குறைந்தபட்ச மதிப்புகள், தணிக்கை அல்ல. நாட்கள் விற்பனை நாட்கள் (கடைசி மாலை நேரம் நள்ளிரவுக்குப் பின் தரவில் வருகிறது).",
        "foot_alc": "தூய ஆல்கஹால் என்பது மதுவில் உள்ள எத்தனால், அதாவது தண்ணீர், சர்க்கரை, சுவையூட்டிகளை நீக்கினால் மிஞ்சுவது; இதனால் சாராயம், பீர், ஒயின் மூன்றையும் ஒரே அளவுகோலில் ஒப்பிடலாம். 42.8% வீரியமுள்ள 180 மி.லி குவார்ட்டரில் 77 மி.லி, அதாவது 10 கிராம் அளவிலான சுமார் ஆறு நிலையான பானங்கள்; 8% வீரியமுள்ள 650 மி.லி ஸ்ட்ராங் பீரில் 52 மி.லி, சுமார் நான்கு. தரவில் வீரியம் இல்லை; எனவே சாராயம் 42.8%, ஸ்ட்ராங் பீர் 8%, பீர் 5%, ஒயின் 12% எனக் கொள்ளப்பட்டது.",
        "foot3": "கணக்கில் சேர்க்காதவை, ஆகஸ்ட் 14 அன்று 3,923 கடைகளிலிருந்து திரும்பப் பெறப்பட்டு ஆகஸ்ட் 15 அன்று மீண்டும் வைக்கப்பட்ட என்ரிகா நிறுவனப் பொருட்கள் (53.7 லட்சம் பாட்டில்கள்). அவை விற்பனை அல்ல. மாவட்ட எல்லைகள் தமிழ்நாடு புவியியல் தகவல் அமைப்பின் கிராம, நகர அடுக்குகளிலிருந்து.",
        "dry": {"independence": "சுதந்திர தினம்", "milad": "மிலாது நபி", "gandhi": "காந்தி ஜெயந்தி", "closed": "கடைகள் மூடல்"},
        "wd": ["ஞாயிறு", "திங்கள்", "செவ்வாய்", "புதன்", "வியாழன்", "வெள்ளி", "சனி"],
        "pc_t": "ஒருவருக்கு எவ்வளவு",
        "pc_s": "{days} நாள் டாஸ்மாக் விற்பனை ஒரு ஆண்டுக்கு விரிவாக்கப்பட்டு, குடிக்க இருக்கும் மக்கள் எண்ணிக்கையால் வகுக்கப்பட்டது. மக்களுக்கு 2026 மாவட்ட மக்கள்தொகை மதிப்பீடு, குடிப்பவர்களுக்குத் தேசிய குடும்ப நலக் கணக்கெடுப்பில் குடிப்பதாகச் சொன்னவர்களின் பங்கு.",
        "pc_pop": "தமிழ்நாட்டு மக்கள்", "pc_pop_s": "2026 மதிப்பீடு",
        "pc_drinkers": "குடிப்பவர்கள்", "pc_drinkers_s": "15+ வயதினரில் {pct}, ஆண்களில் {m}, பெண்களில் {w}",
        "pc_head": "ஆண்டுக்கு, ஒருவருக்கு", "pc_head_s": "15+ பெரியவர் ஒருவருக்கு {adult}",
        "pc_perdrinker": "ஆண்டுக்கு, குடிப்பவருக்கு", "pc_perdrinker_s": "தூய ஆல்கஹால் {alc} லிட்டர்",
        "pc_map": "ஆண்டுக்கு ரூபாய், குடிப்பவர் ஒருவருக்கு", "pc_map_s": "தரவரிசைப்படி நிறம். ஒவ்வொரு மாவட்டத்தின் மேல் உள்ள எண் அதன் இடம்.",
        "pc_rank_cols": ["மாவட்டம்", "குடிக்கும் ஆண்கள்", "ஒருவருக்கு", "குடிப்பவருக்கு"],
        "pc_scat": "சொல்வதும், வாங்குவதும்",
        "pc_scat_s": "கிடைமட்டத்தில் NFHS-6-இல் குடிப்பதாகச் சொன்ன 15+ ஆண்களின் பங்கு. செங்குத்தில் பெரியவர் ஒருவருக்கு ஆண்டுக்கு ரூபாய். புள்ளியின் அளவு அம்மாவட்டத்தின் மொத்த விற்பனை. கணக்கெடுப்பு விற்பனையை விளக்கினால் புள்ளிகள் இடமிருந்து வலமாக ஏற வேண்டும்; ஆனால் நேர்மாறாக உள்ளன.",
        "pc_scat_x": "குடிப்பதாகச் சொல்லும் 15+ ஆண்கள் (%)", "pc_scat_y": "பெரியவர் ஒருவருக்கு ஆண்டுக்கு ரூபாய்",
        "pc_most": "அதிகம் வாங்குவது", "pc_most_s": "குடிப்பவர் ஒருவருக்கு ஆண்டுக்கு, தூய ஆல்கஹால் {alc} லிட்டர்",
        "pc_least": "குறைவாக வாங்குவது", "pc_least_s": "குடிப்பவர் ஒருவருக்கு ஆண்டுக்கு; மாநிலத்தில் {x} மடங்கு இடைவெளி",
        "pc_para": "சென்னை முரண்", "pc_para_s": "தமிழ்நாட்டிலேயே மிகக் குறைந்த குடிப்பழக்கம் சென்னையில், ஆண்களில் {pct}; ஆனால் பெரியவர் ஒருவருக்கு ஆண்டுக்கு {rev} வாங்குகிறது, 38-இல் {rank}வது.",
        "pc_who": "உலகோடு ஒப்பிட்டால", "pc_who_s": "15+ பெரியவர் ஒருவருக்கு ஆண்டுக்கு {l} லிட்டர் தூய ஆல்கஹால். உலக சுகாதார நிறுவனம் இந்தியாவை 5 அருகிலும், பிரான்சை 12 அருகிலும் வைக்கிறது.",
        "pc_foot": "மக்கள்தொகைக்கு ஆதாரம் இந்திய மக்கள்தொகைக் கணக்கெடுப்பு, மக்கள்தொகை மதிப்பீட்டுத் தொழில்நுட்பக் குழு அறிக்கை (தேசிய மக்கள்தொகை ஆணையம், ஜூலை 2020), தமிழ்நாட்டு மாவட்ட அட்டவணைகள், 2026. அறிக்கை 2011-இன் 32 மாவட்டங்களை மதிப்பிடுகிறது; ஒவ்வொன்றும் இன்றைய 38 மாவட்டங்களுக்கு அவற்றின் 2011 மக்கள்தொகை விகிதத்தில் பிரிக்கப்பட்டது. குடிப்பழக்கத்துக்கு ஆதாரம் NFHS-6 (2023-24) மாவட்ட தகவல் தாள்கள், 15+ வயது ஆண்களும் பெண்களும்.",
        "pc_foot2": "பாட்டில் வாங்கிய இடத்தில் கணக்கிடப்படுகிறது, வாங்கியவர் வசிக்கும் இடத்தில் அல்ல; எனவே சென்னையைச் சுற்றிய, நெடுஞ்சாலை மற்றும் எல்லை மாவட்டங்கள் அதிகமாகவும் அண்டை மாவட்டங்கள் குறைவாகவும் தெரியும். கடை இருப்பு காட்டுவதைவிடக் குறைவானவர்களே கணக்கெடுப்பில் குடிப்பதாகச் சொல்கிறார்கள்; எனவே குடிப்பவர் ஒருவருக்கான ஒவ்வொரு எண்ணும் அதே அளவு மிகைப்படுத்தப்பட்டது. மாவட்டங்களை ஒப்பிடப் பயன்படுத்துங்கள், ஒருவரை அளக்க அல்ல.",
        "wds": ["ஞா", "தி", "செ", "பு", "வி", "வெ", "ச"],
        "mon": ["ஜன", "பிப்", "மார்", "ஏப்", "மே", "ஜூன்", "ஜூலை", "ஆக", "செப்", "அக்", "நவ", "டிச"],
        "cat": {"BRANDY": "பிராந்தி", "RUM": "ரம்", "VODKA": "ஓட்கா", "BEER": "பீர்", "WINE": "ஒயின்", "GIN": "ஜின்", "WHISKY": "விஸ்கி", "OTHER": "மற்றவை"},
        "fest_kicker": "டாஸ்மாக் விற்பனை · {name} {year} · {span}",
        "fest_t": "{name} {year}, {n} நாட்களில் {total}",
        "fest_s": "ஒவ்வொரு டாஸ்மாக் கடையின் இருப்பும் 20 நிமிடங்களுக்கு ஒருமுறை படிக்கப்பட்டது, {span}. இருப்புக் குறைவு விற்ற பாட்டிலாக, அச்சிட்ட விலையில்; ஒவ்வொரு நாளும் அதே கிழமையின் சாதாரண நாளுடன் ஒப்பிடப்படுகிறது.",
        "fest_total": "{n} நாட்களில் விற்பனை (அதிகபட்ச சில்லறை விலையில்)", "fest_total_s": "சாதாரண நாட்களை விட {pct}",
        "fest_extra": "சாதாரண நாட்களை விடக் கூடுதல்", "fest_extra_s": "பண்டிகையின் பங்கு",
        "fest_bottles": "விற்ற பாட்டில்கள்", "fest_bottles_s": "வழக்கத்தை விட {extra} கூடுதல்",
        "fest_peak": "{day} அன்று, உச்ச நாள்", "fest_peak_s": "சாதாரண {wd}-ஐ விட {pct}",
        "fest_days": "நாள்தோறும்", "fest_days_s": "அதிகபட்ச சில்லறை விலையில் விற்பனை. ஒவ்வொரு நெடுவரிசையின் குறுக்கே உள்ள கருப்புக் கோடு அதே கிழமையின் சாதாரண நாள்.",
        "fest_hours": "{label}, மணிவாரியாக", "fest_hours_s": "நாள் முழுவதும் கூட்டிய விற்பனை; புள்ளிக்கோடு சாதாரண {wd}. கடைசிப் புள்ளி நள்ளிரவுக்குப் பின் வரும் மூடல் அறிக்கை.",
        "fest_close": "மூடல்",
        "fest_cats": "எந்த மது அதிகம் உயர்ந்தது", "fest_cats_s": "{n} நாட்களில் விற்பனை மாற்றம், சாதாரண நாட்களுடன் ஒப்பிட்டு",
        "fest_map": "எந்த மாவட்டங்கள் உயர்ந்தன", "fest_map_s": "{n} நாட்களில் சாதாரண நாட்களுடன் ஒப்பிட்ட மாற்றம், தரவரிசைப்படி நிறம்; எண் பட்டியலில் இடம்.",
        "fest_rank_cols": ["மாவட்டம்", "விற்பனை", "மாற்றம்"],
        "fest_hist": "{first} முதல் ஒவ்வொரு தீபாவளியும்", "fest_hist_s": "முன்தினத்துக்கும் பண்டிகை நாளுக்கும் டாஸ்மாக் அதிகாரிகள் செய்தியாளர்களுக்குச் சொன்ன எண்ணிக்கை, ஒரு நாள் சராசரியாக. வெளிர் நெடுவரிசை இத்தரவு, குறைந்தபட்ச அளவு.",
        "fest_reg": "ஐந்து மண்டலங்கள்", "fest_reg_s": "மாநிலப் பங்கு, இத்தரவு ({ours}) · டாஸ்மாக் ({year})",
        "fest_quote": "டாஸ்மாக் சொல்லப்போவது", "fest_quote_s": "இத்தரவில் {span}, முன்தினமும் பண்டிகை நாளும், டாஸ்மாக் வழக்கமாகச் சொல்லும் காலம். அதன் எண்ணிக்கை முழு விற்பனை; இது குறைந்தபட்சம்.",
        "fest_day": "{name} அன்று", "fest_day_s": "சாதாரண {wd}-ஐ விட {pct}; முன்தினம் {eve}",
        "fest_city": "நகரம் காலியாகிறது", "fest_city_s": "மாநிலம் {s} உயர்ந்தபோது சென்னை {c} மட்டுமே; பண்டிகைக்கு மக்கள் சொந்த ஊர் செல்வதே காரணம் என டாஸ்மாக் அதிகாரிகள் கூறுகின்றனர்.",
        "fest_foot1": "{now} அன்று tasmac.reclaimchennai.city/db இலிருந்து உருவாக்கப்பட்டது · @reclaimchennai.",
        "fest_least": "மிகக் குறைந்த உயர்வு", "fest_least_s": "மாநிலம் {s} உயர்ந்தபோது {d} {c} மட்டுமே.",
        "fest_off": {"0": "{name}", "-1": "முன்தினம்", "1": "மறுநாள்", "-n": "{n} நாள் முன்", "n": "{n} நாள் பின்"},
        "fest_foot": "சாதாரண நாட்கள் என்பவை {start}-க்கு முந்தைய எட்டு வாரங்களில் அதே கிழமை; உலர் நாட்கள், அவற்றின் முன்தினம், பிற பண்டிகைகள் ({others}), அக்கிழமையின் நடுநிலையில் 60%-க்குக் குறைவாக விற்ற நாட்கள் நீங்கலாக. மாவட்டங்களும் மது வகைகளும் அதே நாட்களைப் பயன்படுத்துகின்றன. மண்டலங்கள் டாஸ்மாக்கின் ஐந்து; புவியியல் அடுக்கில் இடம் பெறாத {unplaced} கடைகள் தம் மாவட்டத்தின் பெரும்பான்மை மண்டலத்தில் சேர்க்கப்பட்டன.",
        "fest_foot2": "முந்தைய ஆண்டுகள் டாஸ்மாக் அதிகாரிகள் சொன்ன அதன் சொந்த எண்ணிக்கை ({sources}). அறிவிப்புகள் வெவ்வேறு நாட்களைக் குறிப்பிடுவதால் (இரண்டு நாள்; தீபாவளி திங்களன்று வந்தால் மூன்று) ஆண்டுகள் முன்தினம் மற்றும் பண்டிகை நாளில் ஒப்பிடப்படுகின்றன. 2015-இன் முன்தினம் இரண்டு நாள் மொத்தத்திலிருந்து பண்டிகை நாளைக் கழித்தது.",
        "crore": " கோடி", "lakh": " லட்சம்", "k": " ஆயிரம்", "ml": "மி.லி", "l": "லி",
        "font": "'Noto Sans Tamil', 'Noto Sans', sans-serif",
    },
}

esc = html.escape


def trim(v: float) -> str:
    return f"{v:.0f}" if v >= 100 else f"{v:.1f}".rstrip("0").rstrip(".") if v >= 10 else f"{v:.2f}".rstrip("0").rstrip(".")


def compact(v: float, t: dict) -> str:
    a = abs(v)
    if a >= 1e10:
        return f"{round(v / 1e7):,}".replace(",", ",") + t["crore"]
    if a >= 1e7:
        return trim(v / 1e7) + t["crore"]
    if a >= 1e5:
        return trim(v / 1e5) + t["lakh"]
    if a >= 1e3:
        return trim(v / 1e3) + t["k"]
    return f"{round(v)}"


def inr_group(n: int) -> str:
    """Indian digit grouping: 12,34,567."""
    s = str(int(round(n)))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts + [tail])


def rupees(paise: float, t: dict) -> str:
    return "₹" + compact(paise / 100, t)


def pct(v: float, d: int = 0) -> str:
    return f"{v * 100:.{d}f}%"


# ── data (mirrors src/lib/dashboard.ts) ───────────────────────────────

def load() -> dict:
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    q = lambda sql, *a: con.execute(sql, a).fetchall()
    last = q("SELECT MAX(day) d FROM fact_sales")[0]["d"]
    to = (dt.date.fromisoformat(last) - dt.timedelta(days=1)).isoformat()
    fr = ANALYSIS_FROM
    w = "f.day BETWEEN ? AND ?"

    days = []
    d = dt.date.fromisoformat(fr)
    while d.isoformat() <= to:
        days.append(d.isoformat())
        d += dt.timedelta(days=1)
    daily = {x: defaultdict(lambda: [0, 0, 0]) for x in days}
    cat_tot = defaultdict(lambda: {"rev": 0, "units": 0, "ml": 0, "alc": 0.0})
    for r in q(f"""SELECT f.day, COALESCE(lt.category,'OTHER') c, SUM(f.revenue_paise) rev, SUM(f.units) u,
                         SUM(f.units*COALESCE(s.volume_ml,0)) ml, SUM(f.units*COALESCE(s.volume_ml,0)*{ABV}) alc
                    FROM fact_sales f JOIN sku s USING(sku_id) LEFT JOIN liquor_type lt USING(liquor_type_id)
                   WHERE {w} GROUP BY 1,2""", fr, to):
        daily[r["day"]][r["c"]] = [r["rev"], r["u"], r["ml"]]
        ct = cat_tot[r["c"]]
        ct["rev"] += r["rev"]; ct["units"] += r["u"]; ct["ml"] += r["ml"]; ct["alc"] += r["alc"]
    day_rev = [sum(v[0] for v in daily[x].values()) for x in days]
    med = sorted(day_rev)[len(day_rev) // 2]
    dry = {x: DRY.get(x) or ("closed" if day_rev[i] < med * 0.1 else None) for i, x in enumerate(days)}
    dry = {k: v for k, v in dry.items() if v}

    eve = {(dt.date.fromisoformat(x) - dt.timedelta(days=1)).isoformat() for x in dry}
    ordinary = [i for i, x in enumerate(days) if x not in dry and x not in eve]
    wd_sum, wd_n = [0] * 7, [0] * 7
    for i in ordinary:
        k = (dt.date.fromisoformat(days[i]).weekday() + 1) % 7
        wd_sum[k] += day_rev[i]; wd_n[k] += 1
    weekday = [wd_sum[k] / wd_n[k] if wd_n[k] else 0 for k in range(7)]

    hours = [[0] * 24 for _ in range(7)]
    skip = set(dry) | eve
    for r in q(f"SELECT f.day, f.hour, SUM(f.revenue_paise) rev FROM fact_hour f WHERE {w} GROUP BY 1,2", fr, to):
        if r["day"] in skip:
            continue
        hours[(dt.date.fromisoformat(r["day"]).weekday() + 1) % 7][r["hour"]] += r["rev"]
    hours = [[v / wd_n[k] if wd_n[k] else 0 for v in row] for k, row in enumerate(hours)]

    brands = [dict(r) for r in q(f"""SELECT pl.product_line_id id, pl.name, COALESCE(MAX(lt.category),'OTHER') c,
                    sp.supplier_id sid, sp.name sup, SUM(f.revenue_paise) rev, SUM(f.units) u
               FROM fact_sales f JOIN sku s USING(sku_id) JOIN product_line pl ON pl.product_line_id=s.product_line_id
               LEFT JOIN supplier sp ON sp.supplier_id=pl.supplier_id LEFT JOIN liquor_type lt USING(liquor_type_id)
              WHERE {w} GROUP BY pl.product_line_id HAVING SUM(f.units)>0 ORDER BY rev DESC""", fr, to)]
    sup = defaultdict(lambda: {"rev": 0, "u": 0, "cats": defaultdict(int)})
    sup_name = {}
    for r in q(f"""SELECT sp.supplier_id id, sp.name, COALESCE(lt.category,'OTHER') c, SUM(f.revenue_paise) rev, SUM(f.units) u
                     FROM fact_sales f JOIN sku s USING(sku_id) JOIN supplier sp ON sp.supplier_id=s.supplier_id
                     LEFT JOIN liquor_type lt USING(liquor_type_id) WHERE {w} GROUP BY 1,3""", fr, to):
        x = sup[r["id"]]; x["rev"] += r["rev"]; x["u"] += r["u"]; x["cats"][r["c"]] += r["rev"]
        sup_name[r["id"]] = r["name"]
    suppliers = sorted(({"id": k, "name": sup_name[k], **v} for k, v in sup.items() if v["u"] > 0), key=lambda x: -x["rev"])

    districts = [dict(r) for r in q(f"""
        WITH sa AS (SELECT district_id, SUM(revenue_paise) rev, SUM(units) u FROM fact_sales f WHERE {w} GROUP BY 1),
             sh AS (SELECT s.district_id, COUNT(DISTINCT fs.shop_no) shops, COUNT(*) sd FROM fact_shop_day fs
                      JOIN shop s ON s.shop_no=fs.shop_no WHERE fs.day BETWEEN ? AND ? GROUP BY 1)
        SELECT d.district_id id, d.name, COALESCE(sa.rev,0) rev, COALESCE(sa.u,0) u, COALESCE(sh.shops,0) shops, COALESCE(sh.sd,0) sd
          FROM district d LEFT JOIN sa ON sa.district_id=d.district_id LEFT JOIN sh ON sh.district_id=d.district_id
         ORDER BY rev DESC""", fr, to, fr, to)]

    dmix = defaultdict(lambda: defaultdict(int))
    for r in q(f"""SELECT f.district_id d, COALESCE(lt.category,'OTHER') c, SUM(f.revenue_paise) rev
                     FROM fact_sales f JOIN sku s USING(sku_id) LEFT JOIN liquor_type lt USING(liquor_type_id)
                    WHERE {w} GROUP BY 1,2""", fr, to):
        dmix[r["d"]][r["c"]] += r["rev"]

    shops = [dict(r) for r in q("""SELECT fs.shop_no no, SUM(fs.revenue_paise) rev, SUM(fs.units) u, COUNT(*) days,
                                          s.district_id did, d.name district, s.taluk_id tid, t.name taluk
                                     FROM fact_shop_day fs JOIN shop s ON s.shop_no=fs.shop_no
                                     LEFT JOIN district d ON d.district_id=s.district_id LEFT JOIN taluk t ON t.taluk_id=s.taluk_id
                                    WHERE fs.day BETWEEN ? AND ? GROUP BY fs.shop_no ORDER BY rev DESC""", fr, to)]
    tot_shop = sum(s["rev"] for s in shops) or 1
    top10 = sum(s["rev"] for s in shops[: max(1, round(len(shops) * 0.1))]) / tot_shop

    sizes = defaultdict(int)
    for r in q(f"SELECT COALESCE(s.volume_ml,0) ml, SUM(f.units) u FROM fact_sales f JOIN sku s USING(sku_id) WHERE {w} GROUP BY 1", fr, to):
        sizes[r["ml"]] += r["u"]
    bands = [150, 200, 250, 300, 400, 600, 1000, 2000]
    prices = [0] * (len(bands) + 1)
    for r in q(f"SELECT s.mrp, SUM(f.units) u FROM fact_sales f JOIN sku s USING(sku_id) WHERE {w} AND s.mrp IS NOT NULL GROUP BY 1", fr, to):
        prices[next((i for i, b in enumerate(bands) if r["mrp"] <= b), len(bands))] += r["u"]
    q180 = q(f"""SELECT SUM(CASE WHEN s.volume_ml=180 THEN f.revenue_paise END)*1.0/SUM(f.revenue_paise) r,
                       SUM(CASE WHEN s.mrp<=150 THEN f.units END)*1.0/SUM(f.units) b
                  FROM fact_sales f JOIN sku s USING(sku_id) WHERE {w}""", fr, to)[0]
    top_sku = dict(q(f"""SELECT s.sku_id id, s.product_name name, s.unit_name unit, s.mrp, SUM(f.units) u
                           FROM fact_sales f JOIN sku s USING(sku_id) WHERE {w} GROUP BY 1 ORDER BY u DESC LIMIT 1""", fr, to)[0])
    operational = q("SELECT COUNT(*) n FROM shop WHERE ever_reported=1 AND shop_no NOT IN (SELECT shop_no FROM shop_closure)")[0]["n"]
    ta = defaultdict(dict)
    for r in q("SELECT entity, entity_id, text FROM name_i18n WHERE lang='ta'"):
        ta[r["entity"]][r["entity_id"]] = r["text"]
    con.close()
    return dict(dmix=dmix, fr=fr, to=to, days=days, daily=daily, dry=dry, cat_tot=cat_tot, weekday=weekday, hours=hours,
                brands=brands, suppliers=suppliers, districts=districts, shops=shops, top10=top10, sizes=sizes,
                bands=bands, prices=prices, q180=q180["r"], le150=q180["b"], top_sku=top_sku, operational=operational, ta=ta)


# ── svg pieces ────────────────────────────────────────────────────────

def nice_max(v: float) -> tuple[float, float]:
    raw = v / 4
    mag = 10 ** math.floor(math.log10(raw)) if raw > 0 else 1
    step = next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= raw)
    return math.ceil(v / step) * step, step


def svg_stacked(D, t, w, h, font) -> str:
    days, cats = D["days"], [c for c in CATS if c in D["cat_tot"]]
    left, top, bottom, right = (128 if t is T['ta'] else 96), 34, 40, 10
    iw, ih = w - left - right, h - top - bottom
    totals = [sum(D["daily"][d][c][0] for c in cats) for d in days]
    ymax, step = nice_max(max(totals))
    x = lambda i: left + i / (len(days) - 1) * iw
    y = lambda v: top + ih - v / ymax * ih
    out = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    v = 0
    while v <= ymax + 1:
        out.append(f'<line x1="{left}" x2="{w - right}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="{RULE}" stroke-width="1"/>')
        out.append(f'<text x="{left - 10}" y="{y(v) + 6:.1f}" text-anchor="end" font-size="17" fill="{MUTED}">{esc(rupees(v, t))}</text>')
        v += step
    base = [0] * len(days)
    for c in cats:
        hi = [base[i] + D["daily"][d][c][0] for i, d in enumerate(days)]
        pts = [f"{x(i):.1f},{y(hi[i]):.1f}" for i in range(len(days))] + [f"{x(i):.1f},{y(base[i]):.1f}" for i in reversed(range(len(days)))]
        out.append(f'<polygon points="{" ".join(pts)}" fill="{CAT_COLOR[c]}" stroke="{PAPER}" stroke-width="1.2" stroke-linejoin="round"/>')
        base = hi
    for i, d in enumerate(days):
        if d in D["dry"]:
            out.append(f'<line x1="{x(i):.1f}" x2="{x(i):.1f}" y1="{top}" y2="{top + ih}" stroke="{MUTED}" stroke-width="1"/>')
            out.append(f'<text x="{x(i):.1f}" y="{top - 10}" text-anchor="middle" font-size="16" fill="{MUTED}">{esc(t["dry"][D["dry"][d]])}</text>')
        dd = dt.date.fromisoformat(d)
        if dd.weekday() == 6:
            out.append(f'<text x="{x(i):.1f}" y="{h - 10}" text-anchor="middle" font-size="16" fill="{MUTED}">{dd.day} {esc(t["mon"][dd.month - 1])}</text>')
    out.append(f'<line x1="{left}" x2="{w - right}" y1="{top + ih}" y2="{top + ih}" stroke="#b9b2a4" stroke-width="1.2"/>')
    out.append("</svg>")
    return "".join(out)


def svg_columns(labels, values, fmt, w, h, font, color=MARK, label_size=16, colors=None) -> str:
    band0 = w / len(values)
    tight = any(len(l) * label_size * 0.58 > band0 - 4 for l in labels)
    top, bottom = 34, (62 if tight else 34)
    ih = h - top - bottom
    band = w / len(values)
    bw = min(44, band * 0.58)
    m = max(values) or 1
    out = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for i, (lab, v) in enumerate(zip(labels, values)):
        cx = band * i + band / 2
        bh = v / m * ih
        y0 = top + ih - bh
        r = min(5, bw / 2, bh)
        out.append(f'<path d="M{cx - bw / 2:.1f},{top + ih}V{y0 + r:.1f}Q{cx - bw / 2:.1f},{y0:.1f} {cx - bw / 2 + r:.1f},{y0:.1f}H{cx + bw / 2 - r:.1f}Q{cx + bw / 2:.1f},{y0:.1f} {cx + bw / 2:.1f},{y0 + r:.1f}V{top + ih}Z" fill="{colors[i] if colors else color}"/>')
        out.append(f'<text x="{cx:.1f}" y="{y0 - 9:.1f}" text-anchor="middle" font-size="{label_size}" fill="{INK}">{esc(fmt(v))}</text>')
        if tight:
            ly = top + ih + 18
            out.append(f'<text x="{cx:.1f}" y="{ly}" text-anchor="end" font-size="{label_size}" fill="{MUTED}" transform="rotate(-38 {cx:.1f} {ly})">{esc(lab)}</text>')
        else:
            out.append(f'<text x="{cx:.1f}" y="{h - 8}" text-anchor="middle" font-size="{label_size}" fill="{MUTED}">{esc(lab)}</text>')
    out.append(f'<line x1="0" x2="{w}" y1="{top + ih}" y2="{top + ih}" stroke="#b9b2a4" stroke-width="1.2"/></svg>')
    return "".join(out)


def svg_hbars(rows, fmt, w, font, row_h=34, label_w=360, size=17) -> str:
    """rows: (label, total, [(color, value), ...])"""
    val_w = 160 if font.startswith("'Noto Sans Tamil'") else 110   # "கோடி" is wider than "cr"
    iw = w - label_w - val_w
    m = max(r[1] for r in rows) or 1
    bh = min(20, row_h - 12)
    h = len(rows) * row_h
    out = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for i, (lab, tot, segs) in enumerate(rows):
        y0 = i * row_h
        out.append(f'<text x="0" y="{y0 + row_h / 2 + 6:.1f}" font-size="{size}" fill="{INK}">{esc(lab)}</text>')
        x0 = label_w
        segs = [s for s in segs if s[1] > 0]
        for j, (c, v) in enumerate(segs):
            sw = v / m * iw
            gap = 2 if j < len(segs) - 1 and sw > 4 else 0
            out.append(f'<rect x="{x0:.1f}" y="{y0 + (row_h - bh) / 2:.1f}" width="{max(0.5, sw - gap):.1f}" height="{bh}" fill="{c}" rx="{2 if j == len(segs) - 1 else 0}"/>')
            x0 += sw
        out.append(f'<text x="{label_w + tot / m * iw + 8:.1f}" y="{y0 + row_h / 2 + 6:.1f}" font-size="{size - 1}" fill="{INK}">{esc(fmt(tot))}</text>')
    out.append("</svg>")
    return "".join(out)


def svg_stack100(rows, w, font, label_w=170) -> str:
    """rows: (label, [(color, value), ...])"""
    row_h, bh = 52, 30
    iw = w - label_w
    out = [f'<svg width="{w}" height="{len(rows) * row_h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for i, (lab, segs) in enumerate(rows):
        y0 = i * row_h + (row_h - bh) / 2
        out.append(f'<text x="0" y="{y0 + bh / 2 + 6:.1f}" font-size="17" fill="{INK}">{esc(lab)}</text>')
        tot = sum(v for _, v in segs) or 1
        x0 = label_w
        for c, v in segs:
            sw = v / tot * iw
            out.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{max(0, sw - 2):.1f}" height="{bh}" fill="{c}"/>')
            p = v / tot
            txt = f"{p * 100:.0f}%" if p >= 0.1 else f"{p * 100:.1f}%"
            if sw > len(txt) * 10 + 14:
                out.append(f'<text x="{x0 + 8:.1f}" y="{y0 + bh / 2 + 6:.1f}" font-size="16" fill="#fff">{txt}</text>')
            x0 += sw
    out.append("</svg>")
    return "".join(out)


def svg_heatmap(D, t, w, font) -> str:
    col = [sum(D["hours"][k][hh] for k in range(7)) for hh in range(24)]
    peak = max(col) or 1
    cols = sorted((hh for hh in range(24) if col[hh] >= peak * 0.03), key=lambda hh: (hh + 18) % 24)
    order = [1, 2, 3, 4, 5, 6, 0]
    label_w = 70
    cw = (w - label_w) / len(cols)
    ch = 29
    m = max(D["hours"][k][hh] for k in range(7) for hh in cols) or 1
    out = [f'<svg width="{w}" height="{7 * ch + 30}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for i, k in enumerate(order):
        out.append(f'<text x="0" y="{i * ch + ch / 2 + 6:.1f}" font-size="16" fill="{MUTED}">{esc(t["wds"][k])}</text>')
        for j, hh in enumerate(cols):
            v = D["hours"][k][hh]
            c = SEQ[min(len(SEQ) - 1, int(v / m * len(SEQ)))] if v > 0 else "#ebe6dc"
            out.append(f'<rect x="{label_w + j * cw + 1.5:.1f}" y="{i * ch + 1.5:.1f}" width="{cw - 3:.1f}" height="{ch - 3}" rx="3" fill="{c}"/>')
    for j, hh in enumerate(cols):
        out.append(f'<text x="{label_w + j * cw + cw / 2:.1f}" y="{7 * ch + 24}" text-anchor="middle" font-size="15" fill="{MUTED}">{hh:02d}</text>')
    out.append("</svg>")
    return "".join(out)


def svg_map(D, t, lang, w, font) -> tuple[str, list]:
    geo = json.loads(GEO.read_text())
    ranked = [d for d in D["districts"]]
    rank = {d["id"]: i + 1 for i, d in enumerate(ranked)}
    n = len(ranked)
    scale = w / geo["w"]
    h = round(geo["h"] * scale)
    out = [f'<svg width="{w}" height="{h}" viewBox="0 0 {geo["w"]} {geo["h"]}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for f in geo["districts"]:
        r = rank.get(f["id"], n)
        c = SEQ[min(len(SEQ) - 1, int((n - r) / n * len(SEQ)))]
        out.append(f'<path d="{f["d"]}" fill="{c}" stroke="{PAPER}" stroke-width="1.6" stroke-linejoin="round"/>')
    for f in geo["districts"]:
        r = rank.get(f["id"], n)
        dark = (n - r) / n * len(SEQ) >= 4
        out.append(f'<circle cx="{f["cx"]}" cy="{f["cy"]}" r="15" fill="{"#ffffff" if dark else EDGE}" fill-opacity="0.92"/>')
        out.append(f'<text x="{f["cx"]}" y="{f["cy"] + 6}" text-anchor="middle" font-size="16" font-weight="700" fill="{EDGE if dark else "#fff"}">{r}</text>')
    out.append("</svg>")
    return "".join(out), ranked


def svg_district_mix(D, t, lang, w, font) -> str:
    """38 thin 100%-stacked columns, one per district, ordered by brandy's share."""
    cats = [c for c in CATS if c in D["cat_tot"]]
    rows = []
    for d in D["districts"]:
        mix = D["dmix"].get(d["id"], {})
        tot = sum(mix.values()) or 1
        rows.append((d, {c: mix.get(c, 0) / tot for c in cats}))
    rows.sort(key=lambda r: -r[1].get("BRANDY", 0))
    # Tamil district names run longer, so their angled labels need more room below.
    label_h, top = (128 if lang == 'ta' else 118), 6
    ih = 170 if lang == 'en' else 150
    lm = 70                      # the first angled label runs left of its column
    band = (w - lm) / len(rows)
    cw = band - 4
    out = [f'<svg width="{w}" height="{top + ih + label_h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for i, (d, share) in enumerate(rows):
        x0 = lm + i * band + 2
        y0 = top + ih
        for c in cats:
            hh = share[c] * ih
            if hh <= 0:
                continue
            out.append(f'<rect x="{x0:.1f}" y="{y0 - hh:.1f}" width="{cw:.1f}" height="{max(0, hh - 1.5):.1f}" fill="{CAT_COLOR[c]}"/>')
            y0 -= hh
        b = share.get("BEER", 0)
        out.append(f'<text x="{x0 + cw / 2:.1f}" y="{top + ih + 18}" text-anchor="middle" font-size="12" fill="{MUTED}">{b * 100:.0f}</text>')
        lx, ly = x0 + cw / 2 + 4, top + ih + 32
        out.append(f'<text x="{lx:.1f}" y="{ly}" text-anchor="end" font-size="14" fill="{INK}" transform="rotate(-55 {lx:.1f} {ly})">{esc(name(D, lang, "district", d["id"], d["name"]))}</text>')
    out.append("</svg>")
    return "".join(out)


# ── sheet scaffolding ────────────────────────────────────────────────

def page(t, kicker_tail, title, subtitle, body, foot) -> str:
    return f"""<!doctype html><html lang="{'ta' if t is T['ta'] else 'en'}"><head><meta charset="utf-8">
<style>
@page {{ size: {W_IN}in {H_IN}in; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: {W}px; height: {H}px; background: {PAPER}; color: {INK}; font-family: {t['font']}; }}
.sheet {{ width: {W}px; height: {H}px; padding: {PAD}px {PAD}px 44px; display: flex; flex-direction: column; gap: 18px; overflow: hidden; }}
.kicker {{ color: {ACCENT}; font-size: 26px; letter-spacing: {'.04em' if t is T['ta'] else '.28em'}; text-transform: uppercase; }}
.kicker b {{ font-weight: 400; letter-spacing: {'.06em' if t is T['ta'] else '.32em'}; }}
h1 {{ font-size: {(60 if t is T['ta'] else 74) if len(title) <= 40 else (54 if t is T['ta'] else 64)}px; line-height: 1.12; font-weight: 800; margin-top: 10px; letter-spacing: -.01em; }}
.sub {{ color: {MUTED}; font-size: 24px; line-height: 1.45; max-width: 1300px; margin-top: 12px; }}
.hero {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }}
.big {{ border-top: 4px solid {INK}; padding-top: 12px; }}
.big .v {{ font-size: {48 if t is T['ta'] else 56}px; font-weight: 800; line-height: 1.05; letter-spacing: -.01em; }}
.big .l {{ font-size: 20px; color: {MUTED}; margin-top: 6px; line-height: 1.35; }}
.panel h2, .card h2 {{ font-size: 19px; letter-spacing: {'.02em' if t is T['ta'] else '.14em'}; text-transform: uppercase; font-weight: 700; }}
.panel .ps, .card .ps {{ font-size: 18px; color: {MUTED}; margin: 4px 0 14px; line-height: 1.35; }}
.legend {{ display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 18px; color: {INK}; margin: 2px 0 10px; }}
.legend i {{ display: inline-block; width: 16px; height: 16px; border-radius: 3px; margin-right: 8px; vertical-align: -2px; }}
.row {{ display: grid; gap: 26px; }}
.cards {{ display: grid; gap: 18px; margin-top: auto; }}
.card {{ background: {CARD}; border: 2.5px solid {EDGE}; padding: 20px 22px; }}
.card .v {{ font-size: 44px; font-weight: 800; line-height: 1.1; margin: 8px 0 4px; }}
.card .t {{ font-size: 18px; line-height: 1.4; color: {INK}; }}
.card .m {{ font-size: 17px; line-height: 1.4; color: {MUTED}; }}
.list {{ font-size: 18px; line-height: 1.55; }}
.list div {{ display: flex; justify-content: space-between; gap: 12px; }}
.list span:last-child {{ font-weight: 700; white-space: nowrap; }}
.foot {{ font-size: 15px; color: {MUTED}; line-height: 1.4; column-count: 3; column-gap: 36px; }}

.foot p.alc {{ break-inside: avoid; }}
.foot p + p {{ margin-top: 5px; }}
table.rank {{ border-collapse: collapse; width: 100%; font-size: {18 if t is T['en'] else 17}px; }}
table.rank td {{ padding: 2px 6px; border-bottom: 1px solid {RULE}; }}
table.rank td.n {{ text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }}
table.rank td.r {{ color: {MUTED}; width: 34px; text-align: right; }}
table.rank th {{ text-align: left; font-size: 15px; letter-spacing: .12em; text-transform: uppercase; color: {MUTED}; font-weight: 600; padding: 0 6px 8px; border-bottom: 2px solid {INK}; }}
table.rank th.n {{ text-align: right; }}
.fest-rank table.rank {{ font-size: {16 if t is T['en'] else 15}px; }}
.fest-rank table.rank td {{ padding: 1px 5px; }}
.bar {{ display: inline-block; height: 12px; background: {MARK}; border-radius: 0 2px 2px 0; vertical-align: middle; }}
</style></head><body><div class="sheet">
<header><div class="kicker"><b>{esc(t['state'])}</b> &nbsp;/&nbsp; {esc(kicker_tail)}</div><h1>{esc(title)}</h1><p class="sub">{esc(subtitle)}</p></header>
{body}
<footer class="foot">{foot}</footer>
</div></body></html>"""


def legend(t, cats) -> str:
    return '<div class="legend">' + "".join(f'<span><i style="background:{CAT_COLOR[c]}"></i>{esc(t["cat"][c])}</span>' for c in cats) + "</div>"


def date_label(d: str, t) -> str:
    x = dt.date.fromisoformat(d)
    return f"{x.day} {t['mon'][x.month - 1]} {x.year}"


def footer(D, t) -> str:
    now = dt.datetime.now(IST).strftime("%d %b %Y %H:%M") if t is T["en"] else dt.datetime.now(IST).strftime("%d.%m.%Y %H:%M")
    # The pure-alcohol note leads, and is kept in one column: it is a definition,
    # and one split across a column break reads as two half-sentences. Leading,
    # it sits at the top of the first column, where balancing can never split it.
    cls = {"foot_alc": ' class="alc"'}
    return "".join(f"<p{cls.get(k, '')}>{esc(t[k].format(now=now, from_=date_label(D['fr'], t), to=date_label(D['to'], t)))}</p>"
                   for k in ("foot_alc", "foot1", "foot2", "foot3"))


KEEP_LOWER = {"AND", "OF", "THE", "AT", "IN"}
INITIALISMS = {"XIV", "XII", "VII", "XO", "VSOP", "XXX", "XL", "MGM", "SNJ", "UB", "DSP", "MC", "IFL", "VS", "MH"}


def word_case(w: str) -> str:
    core = w.strip("().,-&'")
    if core in INITIALISMS or (2 <= len(core) <= 3 and core.isalpha() and not any(v in core for v in "AEIOU")):
        return w
    if core in KEEP_LOWER:
        return w.lower()
    return w[:1] + w[1:].lower() if w[:1].isalpha() else w[:1] + w[1:2].upper() + w[2:].lower()
SUFFIXES = (" PRIVATE LIMITED", " PVT LTD", " PVT. LTD.", " LIMITED", " LTD", " பிரைவேட் லிமிடெட்", " பிரைவேட் லிமிடெட்.", " லிமிடெட்")


def name(D, lang, entity, eid, fallback):
    """Display name: Tamil from name_i18n on a Tamil sheet; on an English sheet the
    feed's capitals set in title case, keeping short initialisms (SNJ, XO, MC) whole."""
    s = D["ta"][entity].get(eid, fallback) if lang == "ta" else (fallback or "")
    if entity == "supplier":
        for suf in SUFFIXES:
            if s.upper().endswith(suf.upper()):
                s = s[: -len(suf)]
                break
    if lang == "en" and s.isupper():
        s = " ".join(word_case(w) for w in s.split())
    return s


# ── the sheets ───────────────────────────────────────────────────────

def overview(D, lang) -> str:
    t = T[lang]
    f = t["font"]
    cats = [c for c in CATS if c in D["cat_tot"]]
    tot = {k: sum(D["cat_tot"][c][k] for c in cats) for k in ("rev", "units", "ml", "alc")}
    trading = len([d for d in D["days"] if d not in D["dry"]])
    inner = W - 2 * PAD
    hero = f"""<div class="hero">
      <div class="big"><div class="v">{esc(rupees(tot['rev'], t))}</div><div class="l">{esc(t['total'])}<br>{esc(rupees(tot['rev'] / trading, t))} {esc(t['perday'])}</div></div>
      <div class="big"><div class="v">{esc(compact(tot['units'], t))}</div><div class="l">{esc(t['bottles'])}<br>{esc(compact(tot['units'] / trading, t))} {esc(t['perday'])}</div></div>
      <div class="big"><div class="v">{esc(compact(tot['alc'] / 1000, t))}</div><div class="l">{esc(t['alc'])}<br>{esc(compact(tot['ml'] / 1000, t))} {esc(t['litres'])}</div></div>
      <div class="big"><div class="v">{inr_group(len(D['shops']))}</div><div class="l">{esc(t['shops'])}</div></div>
    </div>"""
    daily = f"""<section class="panel"><h2>{esc(t['daily'])}</h2><p class="ps">{esc(t['daily_s'])}</p>{legend(t, cats)}
      {svg_stacked(D, t, inner, 470 if lang == 'en' else 360, f)}</section>"""
    order = [1, 2, 3, 4, 5, 6, 0]
    half = (inner - 26) // 2
    week = svg_columns([t["wds"][k] for k in order], [D["weekday"][k] for k in order], lambda v: rupees(v, t), half, 250 if lang == 'en' else 236, f, color=WEEK)
    mix_rows = [(lab, [(CAT_COLOR[c], D["cat_tot"][c][k]) for c in cats]) for lab, k in zip(t["mix_rows"], ("rev", "units", "ml", "alc"))]
    row2 = f"""<div class="row" style="grid-template-columns: 1fr 1fr">
      <section class="panel"><h2>{esc(t['week'])}</h2><p class="ps">{esc(t['week_s'])}</p>{week}</section>
      <section class="panel"><h2>{esc(t['mix'])}</h2><p class="ps">{esc(t['mix_s'])}</p>{svg_stack100(mix_rows, half, f, label_w=170 if lang == 'en' else 230)}</section>
    </div>
    <section class="panel"><h2>{esc(t['hours'])}</h2><p class="ps">{esc(t['hours_s'])}</p>{svg_heatmap(D, t, inner, f)}</section>"""

    # cards
    days = D["days"]
    eves = []
    for d, kind in D["dry"].items():
        prev = (dt.date.fromisoformat(d) - dt.timedelta(days=1)).isoformat()
        if prev not in D["daily"] or prev in D["dry"]:
            continue
        v = sum(x[0] for x in D["daily"][prev].values())
        k = (dt.date.fromisoformat(prev).weekday() + 1) % 7
        base = D["weekday"][k]
        eves.append((t["dry"][kind], v, v / base - 1 if base else 0, t["wd"][k]))
    eve_html = "".join(f'<div class="t" style="margin-top:8px"><b>{esc(rupees(v, t))}</b> · {esc(t["eve_row"].format(name=n))}<br><span class="m">{esc(t["eve_vs"].format(pct=pct(l), wd=wd))}</span></div>' for n, v, l, wd in eves)
    sup5 = "".join(f'<div><span>{esc(name(D, lang, "supplier", s["id"], s["name"]))}</span><span>{esc(rupees(s["rev"], t))}</span></div>' for s in D["suppliers"][:5])
    br5 = "".join(f'<div><span>{esc(name(D, lang, "product_line", b["id"], b["name"]))}</span><span>{esc(rupees(b["rev"], t))}</span></div>' for b in D["brands"][:5])
    sep = [i for i, d in enumerate(days) if d.startswith("2026-09")]
    sep_tot = sum(sum(x[0] for x in D["daily"][days[i]].values()) for i in sep)
    sep_trading = len([i for i in sep if days[i] not in D["dry"]])
    cards = f"""<div class="cards" style="grid-template-columns: 1.15fr 1.15fr 1fr 1fr">
      <div class="card"><h2>{esc(t['topsup'])}</h2><div class="list" style="margin-top:10px">{sup5}</div></div>
      <div class="card"><h2>{esc(t['topbrand'])}</h2><div class="list" style="margin-top:10px">{br5}</div></div>
      <div class="card"><h2>{esc(t['eve'])}</h2>{eve_html}</div>
      <div class="card"><h2>{esc(t['quarter'])}</h2><div class="v" style="font-size:34px">{esc(t['quarter_v'].format(pct=pct(D['q180'])))}</div>
        <div class="m">{esc(t['quarter_s'].format(bpct=pct(D['le150'])))}</div>
        <h2 style="margin-top:16px">{esc(t['month'])}</h2><div class="v" style="font-size:38px">{esc(rupees(sep_tot, t))}</div>
        <div class="m">{esc(t['month_s'].format(avg=rupees(sep_tot / max(1, sep_trading), t)))}</div></div>
    </div>"""
    return page(t, t["kicker"].format(from_=date_label(D["fr"], t), to=date_label(D["to"], t)), t["overview_t"],
                t["overview_s"].format(days=trading), hero + daily + row2 + cards, footer(D, t))


def districts(D, lang) -> str:
    t = T[lang]
    f = t["font"]
    trading = len([d for d in D["days"] if d not in D["dry"]])
    inner = W - 2 * PAD
    map_w = 820 if lang == 'en' else 790   # Tamil sets taller; the map gives way
    svg, ranked = svg_map(D, t, lang, map_w, f)
    m = max(d["rev"] for d in ranked) or 1
    rows = "".join(
        f'<tr><td class="r">{i + 1}</td><td>{esc(name(D, lang, "district", d["id"], d["name"]))}</td>'
        f'<td><span class="bar" style="width:{d["rev"] / m * 170:.0f}px"></span></td>'
        f'<td class="n"><b>{esc(rupees(d["rev"], t))}</b></td>'
        f'<td class="n">{esc(rupees(d["rev"] / d["sd"], t)) if d["sd"] else "–"}</td></tr>'
        for i, d in enumerate(ranked))
    cols = t["rank_cols"]
    table = f"""<table class="rank"><thead><tr><th></th><th>{esc(cols[0])}</th><th></th><th class="n">{esc(cols[1])}</th><th class="n">{esc(cols[2])}</th></tr></thead><tbody>{rows}</tbody></table>"""
    body = f"""<div class="row" style="grid-template-columns: {map_w}px 1fr; align-items: start">
      <div>{svg}<div style="display:flex;align-items:center;gap:10px;margin-top:10px;font-size:16px;color:{MUTED}">
        <span>38</span><span style="display:inline-flex;height:12px;width:220px">{''.join(f'<span style="flex:1;background:{c}"></span>' for c in SEQ)}</span><span>1</span></div></div>
      <section class="panel"><h2>{esc(t['rank'])}</h2><div style="margin-top:12px">{table}</div></section>
    </div>
    <section class="panel"><h2>{esc(t['mixd'])}</h2><p class="ps">{esc(t['mixd_s'])} · {esc(t['beer_note'])}</p>{legend(t, [c for c in CATS if c in D['cat_tot']])}{svg_district_mix(D, t, lang, inner, f)}</section>"""
    total = sum(d["rev"] for d in ranked) or 1
    ch = next(d for d in ranked if d["name"] == "Chennai")
    top = D["shops"][0]
    where = name(D, lang, "district", top["did"], top["district"])
    per = max((d for d in ranked if d["sd"]), key=lambda d: d["rev"] / d["sd"])
    cards = f"""<div class="cards" style="grid-template-columns: repeat(4, 1fr)">
      <div class="card"><h2>{esc(t['chennai'])}</h2><div class="v">{pct(ch['rev'] / total, 1)}</div><div class="m">{esc(t['chennai_s'].format(shops=inr_group(ch['shops'])))} · {esc(rupees(ch['rev'], t))}</div></div>
      <div class="card"><h2>{esc(t['busiest'])}</h2><div class="v">{esc(rupees(top['rev'] / top['days'], t))}<span style="font-size:22px;font-weight:600"> {esc(t['perday'])}</span></div><div class="m">{esc(t['busiest_s'].format(no=top['no'], where=where, rev=rupees(top['rev'], t), days=top['days']))}</div></div>
      <div class="card"><h2>{esc(t['perShop'])}</h2><div class="v">{esc(name(D, lang, 'district', per['id'], per['name']))}</div><div class="m">{esc(t['perShop_s'].format(rev=rupees(per['rev'] / per['sd'], t)))}</div></div>
      <div class="card"><h2>{esc(t['conc'])}</h2><div class="v">{pct(D['top10'])}</div><div class="m">{esc(t['conc_s'].format(pct=pct(D['top10'])))}</div></div>
    </div>"""
    return page(t, t["kicker"].format(from_=date_label(D["fr"], t), to=date_label(D["to"], t)), t["districts_t"],
                t["districts_s"].format(days=trading), body + cards, footer(D, t))


def brands(D, lang) -> str:
    t = T[lang]
    f = t["font"]
    trading = len([d for d in D["days"] if d not in D["dry"]])
    inner = W - 2 * PAD
    cats = [c for c in CATS if c in D["cat_tot"]]
    total = sum(D["cat_tot"][c]["rev"] for c in cats)
    half = (inner - 40) // 2
    disp = lambda s: s
    b_rows = [(disp(name(D, lang, "product_line", b["id"], b["name"])), b["rev"], [(CAT_COLOR.get(b["c"], CAT_COLOR["OTHER"]), b["rev"])]) for b in D["brands"][:30]]
    s_rows = [(disp(name(D, lang, "supplier", s["id"], s["name"])), s["rev"], [(CAT_COLOR[c], s["cats"].get(c, 0)) for c in cats]) for s in D["suppliers"][:15]]
    stot = sum(s["rev"] for s in D["suppliers"]) or 1
    p3 = sum(s["rev"] for s in D["suppliers"][:3]) / stot
    p5 = sum(s["rev"] for s in D["suppliers"][:5]) / stot
    fmt = lambda v: rupees(v, t)
    c_rows = [(t["cat"][c], D["cat_tot"][c]["rev"], [(CAT_COLOR[c], D["cat_tot"][c]["rev"])]) for c in sorted(cats, key=lambda c: -D["cat_tot"][c]["rev"])]
    trim_to = lambda rows, n: [(r[0] if len(r[0]) <= n else r[0][: n - 1] + "…", *r[1:]) for r in rows]
    body = f"""{legend(t, cats)}<div class="row" style="grid-template-columns: 1fr 1fr; align-items: start">
      <section class="panel"><h2>{esc(t['brands_h'])}</h2><div style="margin-top:14px">{svg_hbars(trim_to(b_rows, 38), fmt, half, f, row_h=44 if lang == 'en' else 39, label_w=430, size=18)}</div></section>
      <div>
        <section class="panel"><h2>{esc(t['sup_h'])}</h2><p class="ps">{esc(t['sup_share'].format(p3=pct(p3), p5=pct(p5)))}</p>{svg_hbars(trim_to(s_rows, 36), fmt, half, f, row_h=44 if lang == 'en' else 39, label_w=430, size=18)}</section>
        <section class="panel" style="margin-top:34px"><h2>{esc(t['cat_h'])}</h2><p class="ps">{esc(t['cat_s'])}</p>{svg_hbars(c_rows, fmt, half, f, row_h=44 if lang == 'en' else 39, label_w=200, size=18)}</section>
      </div>
    </div>"""
    # sizes and prices
    tot_u = sum(D["sizes"].values()) or 1
    sz = sorted(((ml, u) for ml, u in D["sizes"].items() if ml and u / tot_u >= 0.004), key=lambda x: -x[1])[:7]
    size_lab = lambda ml: f"{ml // 1000} {t['l']}" if ml >= 1000 else f"{ml} {t['ml']}"
    k = lambda v: f"{v // 1000}k" if v >= 1000 else str(v)
    bl = [f"≤{k(D['bands'][0])}"] + [f"{k(a + 1 if a < 1000 else a)}–{k(b)}" for a, b in zip(D["bands"], D["bands"][1:])] + [f">{k(D['bands'][-1])}"]
    third = (inner - 2 * 18 - 3 * 48) // 3
    row2 = f"""<div class="cards" style="grid-template-columns: 1fr 1.35fr 1fr">
      <div class="card"><h2>{esc(t['sizes'])}</h2><p class="ps">{esc(t['sizes_s'])}</p>{svg_columns([size_lab(ml) for ml, _ in sz], [u / tot_u for _, u in sz], lambda v: pct(v, 0 if v >= .1 else 1), third, 260, f, label_size=15)}</div>
      <div class="card"><h2>{esc(t['prices'])}</h2><p class="ps">{esc(t['prices_s'])}</p>{svg_columns(bl, [p / (sum(D['prices']) or 1) for p in D['prices']], lambda v: pct(v, 0) if v >= .01 else '', round(third * 1.35), 280, f, label_size=15)}</div>
      <div class="card"><h2>{esc(t['top_sku'])}</h2><div class="v">₹{D['top_sku']['mrp']} · {esc(size_lab(180) if D['top_sku']['unit'] == '180ml' else D['top_sku']['unit'] or '')}</div>
        <div class="m">{esc(t['top_sku_s'].format(units=compact(D['top_sku']['u'], t), name=disp(name(D, lang, 'sku', D['top_sku']['id'], D['top_sku']['name']))))}</div>
        <h2 style="margin-top:18px">{esc(t['nbrands'])}</h2><div class="v">{inr_group(len(D['brands']))}</div>
        <div class="m">{esc(t['nbrands_s'].format(n=inr_group(len(D['brands'])), s=len(D['suppliers'])))}</div></div>
    </div>"""
    return page(t, t["kicker"].format(from_=date_label(D["fr"], t), to=date_label(D["to"], t)),
                t["brands_t"].format(total=rupees(total, t)), t["brands_s"].format(days=trading), body + row2, footer(D, t))



# ── per head ──────────────────────────────────────────────────────────

POP_JSON = ROOT / "src" / "data" / "tn-population.json"
NFHS_JSON = ROOT / "src" / "data" / "nfhs-alcohol.json"


def lakh_word(v: float, t: dict) -> str:
    """Lakh and crore spelled out: this sheet counts litres too, and compact()'s
    " L" for lakh would read as litres right beside them."""
    word = {"crore": "crore", "lakh": "lakh"} if t is T["en"] else {"crore": "கோடி", "lakh": "லட்சம்"}
    return f"{trim(v / 1e7)} {word['crore']}" if v >= 1e7 else f"{trim(v / 1e5)} {word['lakh']}"


def load_percapita(D) -> list[dict]:
    """One row per district: sales over the window, the 2026 projection, and the drinkers.

    Sales are annualised on calendar days, not trading days — a dry day is a real
    day on which nothing was sold, so it belongs in the denominator.
    """
    pop = {d["district_id"]: d for d in json.loads(POP_JSON.read_text())["districts"]}
    nf = {r["district_id"]: r for r in json.loads(NFHS_JSON.read_text())["rows"]}
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    sales = {r["id"]: r for r in con.execute(
        f"""SELECT f.district_id id, SUM(f.units) u, SUM(f.revenue_paise) rev,
                   SUM(f.units*COALESCE(s.volume_ml,0)*{ABV})/1000.0 alc
              FROM fact_sales f JOIN sku s USING(sku_id) LEFT JOIN liquor_type lt USING(liquor_type_id)
             WHERE f.day BETWEEN ? AND ? GROUP BY 1""", (D["fr"], D["to"])).fetchall()}
    con.close()
    span = (dt.date.fromisoformat(D["to"]) - dt.date.fromisoformat(D["fr"])).days + 1
    year = 365 / span
    rows = []
    for did, p in pop.items():
        n, sa = nf[did], sales.get(did)
        drinkers = (p["adult_men"] * n["m6"] + p["adult_women"] * n["w6"]) / 100
        rev = (sa["rev"] if sa else 0) / 100
        alc = (sa["alc"] if sa else 0.0)
        rows.append(dict(id=did, name=p["name"], pop=p["pop"], adults=p["adults"], drinkers=drinkers,
                         m6=n["m6"], w6=n["w6"], rev=rev, alc=alc,
                         per_head=rev * year / p["pop"], per_adult=rev * year / p["adults"],
                         per_drinker=rev * year / drinkers, alc_drinker=alc * year / drinkers,
                         alc_adult=alc * year / p["adults"]))
    rows.sort(key=lambda r: -r["per_drinker"])
    return rows


def svg_value_map(rows, key, w, font) -> str:
    """The district map shaded by rank on `key`, numbered 1 = highest."""
    geo = json.loads(GEO.read_text())
    order = sorted(rows, key=lambda r: -r[key])
    rank = {r["id"]: i + 1 for i, r in enumerate(order)}
    n = len(order) or 1
    scale = w / geo["w"]
    h = round(geo["h"] * scale)
    out = [f'<svg width="{w}" height="{h}" viewBox="0 0 {geo["w"]} {geo["h"]}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for f in geo["districts"]:
        r = rank.get(f["id"], n)
        out.append(f'<path d="{f["d"]}" fill="{SEQ[min(len(SEQ) - 1, int((n - r) / n * len(SEQ)))]}" '
                   f'stroke="{PAPER}" stroke-width="1.6" stroke-linejoin="round"/>')
    for f in geo["districts"]:
        r = rank.get(f["id"], n)
        dark = (n - r) / n * len(SEQ) >= 4
        out.append(f'<circle cx="{f["cx"]}" cy="{f["cy"]}" r="15" fill="{"#ffffff" if dark else EDGE}" fill-opacity="0.92"/>')
        out.append(f'<text x="{f["cx"]}" y="{f["cy"] + 6}" text-anchor="middle" font-size="16" font-weight="700" fill="{EDGE if dark else "#fff"}">{r}</text>')
    out.append("</svg>")
    return "".join(out)


def svg_scatter(pts, xlab, ylab, fmt_y, w, h, font) -> str:
    """pts: (x, y, size, label). Dot area carries size; labels only where there is room."""
    padl, padb, padt, padr = 150, 64, 16, 20
    iw, ih = w - padl - padr, h - padt - padb
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0 = math.floor(min(xs) / 5) * 5; x1 = math.ceil(max(xs) / 5) * 5
    ymax, step = nice_max(max(ys))
    px = lambda v: padl + (v - x0) / (x1 - x0 or 1) * iw
    py = lambda v: padt + ih - v / ymax * ih
    rmax = max(p[2] for p in pts) or 1
    out = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    v = 0.0
    while v <= ymax + 1e-9:
        out.append(f'<line x1="{padl}" x2="{padl + iw}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="{RULE}" stroke-width="1"/>')
        out.append(f'<text x="{padl - 12}" y="{py(v) + 6:.1f}" text-anchor="end" font-size="17" fill="{MUTED}">{esc(fmt_y(v))}</text>')
        v += step
    for xv in range(int(x0), int(x1) + 1, 5):
        out.append(f'<text x="{px(xv):.1f}" y="{h - 34}" text-anchor="middle" font-size="17" fill="{MUTED}">{xv}%</text>')
    out.append(f'<text x="{padl + iw / 2:.1f}" y="{h - 6}" text-anchor="middle" font-size="18" fill="{INK}">{esc(xlab)}</text>')
    out.append(f'<text x="22" y="{padt + ih / 2:.1f}" text-anchor="middle" font-size="18" fill="{INK}" '
               f'transform="rotate(-90 22 {padt + ih / 2:.1f})">{esc(ylab)}</text>')
    for x, y, sz, lab in sorted(pts, key=lambda p: -p[2]):
        r = 7 + 22 * math.sqrt(sz / rmax)
        out.append(f'<circle cx="{px(x):.1f}" cy="{py(y):.1f}" r="{r:.1f}" fill="{MARK}" fill-opacity="0.55" stroke="{PAPER}" stroke-width="1.5"/>')
    # label only the extremes, so the cloud stays readable
    marked = sorted(pts, key=lambda p: -p[1])[:4] + sorted(pts, key=lambda p: p[1])[:3] + sorted(pts, key=lambda p: -p[0])[:2]
    for x, y, sz, lab in {id(p): p for p in marked}.values():
        r = 7 + 22 * math.sqrt(sz / rmax)
        out.append(f'<text x="{px(x) + r + 6:.1f}" y="{py(y) + 6:.1f}" font-size="17" fill="{INK}">{esc(lab)}</text>')
    out.append("</svg>")
    return "".join(out)


def percapita(D, lang) -> str:
    t = T[lang]
    f = t["font"]
    inner = W - 2 * PAD
    rows = load_percapita(D)
    span = (dt.date.fromisoformat(D["to"]) - dt.date.fromisoformat(D["fr"])).days + 1
    year = 365 / span
    nm = lambda r: name(D, lang, "district", r["id"], r["name"])

    pop = sum(r["pop"] for r in rows)
    adults = sum(r["adults"] for r in rows)
    drinkers = sum(r["drinkers"] for r in rows)
    rev = sum(r["rev"] for r in rows)
    alc = sum(r["alc"] for r in rows)
    men = sum(r["adults"] for r in rows)  # only used for the share line below
    men_sh = sum(r["m6"] * r["adults"] for r in rows) / (men or 1)
    wom_sh = sum(r["w6"] * r["adults"] for r in rows) / (men or 1)

    hero = f"""<div class="hero">
      <div class="big"><div class="k">{esc(t['pc_pop'])}</div><div class="v">{esc(compact(pop, t))}</div><div class="m">{esc(t['pc_pop_s'])}</div></div>
      <div class="big"><div class="k">{esc(t['pc_drinkers'])}</div><div class="v">{esc(lakh_word(drinkers, t))}</div><div class="m">{esc(t['pc_drinkers_s'].format(pct=pct(drinkers / adults, 1), m=pct(men_sh / 100, 1), w=pct(wom_sh / 100, 1)))}</div></div>
      <div class="big"><div class="k">{esc(t['pc_head'])}</div><div class="v">{esc(rupees(rev * year / pop * 100, t))}</div><div class="m">{esc(t['pc_head_s'].format(adult=rupees(rev * year / adults * 100, t)))}</div></div>
      <div class="big"><div class="k">{esc(t['pc_perdrinker'])}</div><div class="v">{esc(rupees(rev * year / drinkers * 100, t))}</div><div class="m">{esc(t['pc_perdrinker_s'].format(alc=trim(alc * year / drinkers)))}</div></div>
    </div>"""

    # Tamil sets larger, so it gets a smaller map and a shorter scatter.
    map_w = 560 if lang == 'en' else 460
    m = rows[0]["per_drinker"] or 1
    cols = t["pc_rank_cols"]

    # 38 rows in one column is taller than the map beside it and pushes the sheet
    # over; two columns of 19 keep the row the height of the map.
    def half(part, first):
        body_rows = "".join(
            f'<tr><td class="r">{i + first}</td><td>{esc(nm(r))}</td>'
            f'<td><span class="bar" style="width:{r["per_drinker"] / m * 90:.0f}px"></span></td>'
            f'<td class="n">{r["m6"]:.0f}%</td>'
            f'<td class="n"><b>{esc(inr_group(round(r["per_drinker"])))}</b></td></tr>'
            for i, r in enumerate(part))
        return (f'<table class="rank"><thead><tr><th></th><th>{esc(cols[0])}</th><th></th>'
                f'<th class="n">{esc(cols[1])}</th><th class="n">{esc(cols[3])}</th>'
                f'</tr></thead><tbody>{body_rows}</tbody></table>')
    k = (len(rows) + 1) // 2
    table = (f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'
             f'{half(rows[:k], 1)}{half(rows[k:], k + 1)}</div>')

    pts = [(r["m6"], r["per_adult"], r["rev"], nm(r)) for r in rows]
    body = f"""<div class="row" style="grid-template-columns: {map_w}px 1fr; align-items: start">
      <div><h2>{esc(t['pc_map'])}</h2><p class="ps">{esc(t['pc_map_s'])}</p>{svg_value_map(rows, 'per_drinker', map_w, f)}
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;font-size:16px;color:{MUTED}">
        <span>38</span><span style="display:inline-flex;height:12px;width:220px">{''.join(f'<span style="flex:1;background:{c}"></span>' for c in SEQ)}</span><span>1</span></div></div>
      <section class="panel"><div style="margin-top:4px">{table}</div></section>
    </div>
    <section class="panel"><h2>{esc(t['pc_scat'])}</h2><p class="ps">{esc(t['pc_scat_s'])}</p>{svg_scatter(pts, t['pc_scat_x'], t['pc_scat_y'], lambda v: inr_group(round(v)), inner, 340 if lang == 'en' else 280, f)}</section>"""

    hi, lo = rows[0], rows[-1]
    ch = next(r for r in rows if r["name"] == "Chennai")
    ch_rank = sorted(rows, key=lambda r: -r["per_adult"]).index(ch) + 1
    cards = f"""<div class="cards" style="grid-template-columns: repeat(4, 1fr)">
      <div class="card"><h2>{esc(t['pc_most'])}</h2><div class="v">{esc(nm(hi))}</div><div class="m">{esc(inr_group(round(hi['per_drinker'])))} {esc(t['pc_most_s'].format(alc=trim(hi['alc_drinker'])))}</div></div>
      <div class="card"><h2>{esc(t['pc_least'])}</h2><div class="v">{esc(nm(lo))}</div><div class="m">{esc(inr_group(round(lo['per_drinker'])))} {esc(t['pc_least_s'].format(x=trim(hi['per_drinker'] / lo['per_drinker'])))}</div></div>
      <div class="card"><h2>{esc(t['pc_para'])}</h2><div class="v">{ch['m6']:.1f}%</div><div class="m">{esc(t['pc_para_s'].format(pct=f"{ch['m6']:.1f}%", rev=inr_group(round(ch['per_adult'])), rank=ch_rank))}</div></div>
      <div class="card"><h2>{esc(t['pc_who'])}</h2><div class="v">{esc(trim(alc * year / adults))} {esc(t['l'])}</div><div class="m">{esc(t['pc_who_s'].format(l=trim(alc * year / adults)))}</div></div>
    </div>"""

    # This sheet is about pure alcohol, so its definition leads here as everywhere.
    foot = (footer(D, t)
            + f'<p>{esc(t["pc_foot"])}</p><p>{esc(t["pc_foot2"])}</p>')
    return page(t, t["kicker"].format(from_=date_label(D["fr"], t), to=date_label(D["to"], t)), t["pc_t"],
                t["pc_s"].format(days=span), hero + body + cards, foot)


# ── the festival sheet (mirrors src/lib/festival.ts) ─────────────────

FEST = ROOT / "src" / "data" / "festivals.json"
REGION_TA = {"Chennai": "சென்னை", "Madurai": "மதுரை", "Trichy": "திருச்சி", "Salem": "சேலம்", "Coimbatore": "கோவை"}
REGION_EN = {"Trichy": "Tiruchy"}


def _add(day: str, n: int) -> str:
    return (dt.date.fromisoformat(day) + dt.timedelta(days=n)).isoformat()


def _dow(day: str) -> int:
    """0 = Sunday, as in the TypeScript."""
    return (dt.date.fromisoformat(day).weekday() + 1) % 7


def load_festival(fid: str):
    """The festival's window against ordinary days, or None if it is not in the data.
    Same rules as festival.ts: same weekday, eight weeks before the window, no dry
    days or their eves, no other festival, nothing under 60% of the weekday median."""
    cfg = json.loads(FEST.read_text())
    defs = cfg["festivals"]
    fdef = next((f for f in defs if f["id"] == fid), None)
    if not fdef:
        return None
    span = lambda f: [_add(f["day"], o) for o in range(f["from"], f["to"] + 1)]
    days = span(fdef)
    fest_days = {d for f in defs for d in span(f)}
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    q = lambda sql, *a: con.execute(sql, a).fetchall()
    today = q("SELECT MAX(day) d FROM fact_sales")[0]["d"]
    tot = {r["day"]: r["rev"] for r in q("SELECT day, SUM(revenue_paise) rev FROM fact_sales WHERE day >= ? GROUP BY 1", ANALYSIS_FROM)}
    allv = sorted(tot.values())
    median = allv[len(allv) // 2] if allv else 0
    dry = lambda d: d in DRY or tot.get(d, 0) < median * 0.1
    by_w = [[] for _ in range(7)]
    d = _add(days[0], -56)
    while d < days[0]:
        if d >= ANALYSIS_FROM and d in tot and not dry(d) and not dry(_add(d, 1)) and d not in fest_days:
            by_w[_dow(d)].append(d)
        d = _add(d, 1)
    for w in range(7):
        v = sorted(tot[x] for x in by_w[w])
        med = v[len(v) // 2] if v else 0
        by_w[w] = [x for x in by_w[w] if tot[x] >= med * 0.6]
    base_days = sorted({x for w in by_w for x in w})
    want = [x for x in days + base_days if x <= today]
    ph = ",".join("?" * len(want))
    rows = q(f"""SELECT f.day, f.district_id did, COALESCE(lt.category,'OTHER') cat, SUM(f.revenue_paise) rev, SUM(f.units) u,
                       SUM(f.units * COALESCE(s.volume_ml,0) * {ABV}) alc
                  FROM fact_sales f JOIN sku s USING(sku_id) LEFT JOIN liquor_type lt USING(liquor_type_id)
                 WHERE f.day IN ({ph}) GROUP BY 1,2,3""", *want)
    acc = defaultdict(lambda: {"rev": 0, "u": 0, "alc": 0, "cats": defaultdict(float), "dist": defaultdict(float)})
    for r in rows:
        a = acc[r["day"]]
        a["rev"] += r["rev"]; a["u"] += r["u"]; a["alc"] += r["alc"]
        a["cats"][r["cat"]] += r["rev"]; a["dist"][r["did"]] += r["rev"]
    mean = lambda ds, fn: sum(fn(acc[x]) for x in ds) / len(ds) if ds else 0
    out = []
    for i, day in enumerate(days):
        ds = by_w[_dow(day)]
        out.append({"day": day, "off": fdef["from"] + i, "rev": acc[day]["rev"], "u": acc[day]["u"], "alc": acc[day]["alc"],
                    "base": mean(ds, lambda a: a["rev"]), "base_u": mean(ds, lambda a: a["u"]),
                    "cats": dict(acc[day]["cats"]), "base_cats": {c: mean(ds, lambda a, c=c: a["cats"].get(c, 0)) for c in CATS},
                    "dist": dict(acc[day]["dist"]), "base_dist": defaultdict(float, {})})
        for b in ds:
            for k, v in acc[b]["dist"].items():
                out[-1]["base_dist"][k] += v / len(ds)
    # hours, folded into the kept columns exactly as on the site
    hrs = defaultdict(lambda: [0] * 24)
    col = [0] * 24
    for r in q(f"SELECT day, hour, SUM(revenue_paise) rev FROM fact_hour WHERE day IN ({ph}) GROUP BY 1,2", *want):
        hrs[r["day"]][r["hour"]] += r["rev"]; col[r["hour"]] += r["rev"]
    order = lambda h: (h + 18) % 24
    peak = max(col) or 1
    cols = sorted([h for h in range(24) if col[h] >= peak * 0.03], key=order)
    def fold(v):
        o = [v[h] for h in cols]
        for h in range(24):
            if h in cols or not v[h]:
                continue
            j = min(range(len(cols)), key=lambda k: abs(order(cols[k]) - order(h)))
            o[j] += v[h]
        return o
    for x in out:
        ds = by_w[_dow(x["day"])]
        x["hours"] = fold(hrs[x["day"]])
        x["base_hours"] = [sum(fold(hrs[b])[k] for b in ds) / len(ds) if ds else 0 for k in range(len(cols))]
    # regions; an unplaced shop takes its district's majority region
    reg = q(f"""WITH dr AS (SELECT district_id, tasmac_region_id r, COUNT(*) n FROM shop WHERE tasmac_region_id IS NOT NULL GROUP BY 1,2),
                     best AS (SELECT district_id, r FROM dr d1 WHERE n = (SELECT MAX(n) FROM dr d2 WHERE d2.district_id = d1.district_id) GROUP BY district_id)
                SELECT fs.day, tr.name region, SUM(fs.revenue_paise) rev
                  FROM fact_shop_day fs JOIN shop s ON s.shop_no = fs.shop_no
                  LEFT JOIN best ON best.district_id = s.district_id
                  JOIN tasmac_region tr ON tr.region_id = COALESCE(s.tasmac_region_id, best.r)
                 WHERE fs.day IN ({",".join("?" * len(days))}) GROUP BY 1,2""", *days)
    regions = defaultdict(float)
    for r in reg:
        regions[r["region"]] += r["rev"]
    unplaced = q("SELECT COUNT(*) n FROM shop WHERE tasmac_region_id IS NULL AND ever_reported = 1")[0]["n"]
    names = {r["district_id"]: r["name"] for r in q("SELECT district_id, name FROM district")}
    ta = {r["entity_id"]: r["text"] for r in q("SELECT entity_id, text FROM name_i18n WHERE entity = 'district' AND lang = 'ta'")} if q("SELECT name FROM sqlite_master WHERE name='name_i18n'") else {}
    others = [f for f in defs if f["id"] != fid and _add(f["day"], f["to"]) < days[0] and _add(f["day"], f["from"]) >= ANALYSIS_FROM]
    con.close()
    # Closed once the last day's closing report (after midnight) has landed — by the
    # clock, as on the site, not by waiting for the next day's first sale to appear.
    closes = dt.datetime.combine(dt.date.fromisoformat(days[-1]) + dt.timedelta(days=1), dt.time(1, 30), IST)
    closed = dt.datetime.now(IST) >= closes and today >= days[-1]
    return {"def": fdef, "days": out, "cols": cols, "today": today, "closed": closed, "regions": dict(regions),
            "names": names, "ta": ta, "unplaced": unplaced, "history": cfg["history"].get(fid, []), "others": others}


def svg_festdays(items, fmt, w, h, font, t) -> str:
    """items: (label, date, value, base, lift). Column = the day; black rule = an ordinary day."""
    top, bottom = 40, 96
    ih = h - top - bottom
    band = w / len(items)
    bw = min(120, band * 0.5)
    m = max(max(v, b) for _, _, v, b, _ in items) or 1
    y = lambda v: top + ih - v / m * ih
    o = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for i, (lab, date, v, b, lift) in enumerate(items):
        cx = band * i + band / 2
        r = min(6, bw / 2, v / m * ih)
        y0 = y(v)
        o.append(f'<path d="M{cx - bw / 2:.1f},{top + ih}V{y0 + r:.1f}Q{cx - bw / 2:.1f},{y0:.1f} {cx - bw / 2 + r:.1f},{y0:.1f}H{cx + bw / 2 - r:.1f}Q{cx + bw / 2:.1f},{y0:.1f} {cx + bw / 2:.1f},{y0 + r:.1f}V{top + ih}Z" fill="{MARK}"/>')
        o.append(f'<line x1="{cx - bw / 2 - 12:.1f}" x2="{cx + bw / 2 + 12:.1f}" y1="{y(b):.1f}" y2="{y(b):.1f}" stroke="{INK}" stroke-width="3.5" stroke-linecap="round"/>')
        o.append(f'<text x="{cx:.1f}" y="{min(y0, y(b)) - 12:.1f}" text-anchor="middle" font-size="24" font-weight="700" fill="{INK}">{esc(fmt(v))}</text>')
        o.append(f'<text x="{cx:.1f}" y="{top + ih + 30}" text-anchor="middle" font-size="20" font-weight="700" fill="{INK}">{esc(lab)}</text>')
        o.append(f'<text x="{cx:.1f}" y="{top + ih + 56}" text-anchor="middle" font-size="18" fill="{MUTED}">{esc(date)}</text>')
        o.append(f'<text x="{cx:.1f}" y="{top + ih + 84}" text-anchor="middle" font-size="22" font-weight="700" fill="{MARK}">{esc(lift)}</text>')
    o.append(f'<line x1="0" x2="{w}" y1="{top + ih}" y2="{top + ih}" stroke="#b9b2a4" stroke-width="1.2"/></svg>')
    return "".join(o)


def svg_curve(labels, vals, base, fmt, w, h, font) -> str:
    """Cumulative sales through the day (crimson) against an ordinary day (dashed ink)."""
    left, top, bottom, right = 110, 16, 40, 16
    iw, ih = w - left - right, h - top - bottom
    cv, cb = [], []
    for a, b in zip(vals, base):
        cv.append((cv[-1] if cv else 0) + a); cb.append((cb[-1] if cb else 0) + b)
    ymax, step = nice_max(max(cv + cb) or 1)
    n = len(labels)
    x = lambda i: left + i / max(1, n - 1) * iw
    y = lambda v: top + ih - v / ymax * ih
    o = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    v = 0
    while v <= ymax + 1:
        o.append(f'<line x1="{left}" x2="{w - right}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="{RULE}"/>')
        o.append(f'<text x="{left - 10}" y="{y(v) + 6:.1f}" text-anchor="end" font-size="17" fill="{MUTED}">{esc(fmt(v))}</text>')
        v += step
    pts = lambda arr: " ".join(f"{x(i):.1f},{y(a):.1f}" for i, a in enumerate(arr))
    o.append(f'<polyline points="{pts(cb)}" fill="none" stroke="{MUTED}" stroke-width="3" stroke-dasharray="9 7"/>')
    o.append(f'<polyline points="{pts(cv)}" fill="none" stroke="{MARK}" stroke-width="4.5" stroke-linejoin="round"/>')
    o.append(f'<text x="{x(n - 1) - 6:.1f}" y="{y(cv[-1]) - 12:.1f}" text-anchor="end" font-size="20" font-weight="700" fill="{INK}">{esc(fmt(cv[-1]))}</text>')
    o.append(f'<text x="{x(n - 1) - 6:.1f}" y="{y(cb[-1]) + 28:.1f}" text-anchor="end" font-size="18" fill="{MUTED}">{esc(fmt(cb[-1]))}</text>')
    every = max(1, math.ceil(70 / (iw / max(1, n - 1))))
    for i, lab in enumerate(labels):
        if i % every == 0 or i == n - 1:
            o.append(f'<text x="{x(i):.1f}" y="{h - 8}" text-anchor="{"end" if i == n - 1 else "middle"}" font-size="17" fill="{MUTED}">{esc(lab)}</text>')
    o.append(f'<line x1="{left}" x2="{w - right}" y1="{top + ih}" y2="{top + ih}" stroke="#b9b2a4" stroke-width="1.2"/></svg>')
    return "".join(o)


def svg_lift(rows, w, font, label_w=170, row_h=40) -> str:
    """rows: (label, change, colour) — bars from zero, either way."""
    val_w = 90
    lo = min(0, min(r[1] for r in rows)); hi = max(0.01, max(r[1] for r in rows))
    iw = w - label_w - val_w * (2 if lo < 0 else 1)
    x0 = label_w + (val_w if lo < 0 else 0) + (-lo) / (hi - lo) * iw
    sx = lambda v: abs(v) / (hi - lo) * iw
    h = len(rows) * row_h
    o = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">',
         f'<line x1="{x0:.1f}" x2="{x0:.1f}" y1="0" y2="{h}" stroke="#b9b2a4" stroke-width="1.2"/>']
    for i, (lab, v, c) in enumerate(rows):
        y0 = i * row_h
        bw = sx(v)
        bx = x0 - bw if v < 0 else x0
        o.append(f'<text x="0" y="{y0 + row_h / 2 + 7:.1f}" font-size="19" fill="{INK}">{esc(lab)}</text>')
        o.append(f'<rect x="{bx:.1f}" y="{y0 + 9}" width="{max(0.5, bw):.1f}" height="{row_h - 18}" rx="3" fill="{c}"/>')
        lx = bx - 8 if v < 0 else x0 + bw + 8
        sign = "+" if v >= 0 else "−"
        o.append(f'<text x="{lx:.1f}" y="{y0 + row_h / 2 + 7:.1f}" text-anchor="{"end" if v < 0 else "start"}" font-size="19" font-weight="700" fill="{INK}">{sign}{abs(round(v * 100))}%</text>')
    o.append("</svg>")
    return "".join(o)


def signed(v: float) -> str:
    return f"{'+' if v >= 0 else '−'}{abs(round(v * 100))}%"


def festival_sheet(F, lang) -> str:
    t = T[lang]
    f = t["font"]
    inner = W - 2 * PAD
    fd = F["def"]
    fname = fd["name"][lang]
    year = fd["day"][:4]
    days = F["days"]
    lab = lambda o: (t["fest_off"]["0"].format(name=fname) if o == 0 else t["fest_off"][str(o)] if str(o) in t["fest_off"]
                     else t["fest_off"]["-n" if o < 0 else "n"].format(n=abs(o)))
    dlabel = lambda d: f"{t['wds'][_dow(d)]} {dt.date.fromisoformat(d).day} {t['mon'][dt.date.fromisoformat(d).month - 1]}"
    span_txt = f"{dlabel(days[0]['day'])} – {dlabel(days[-1]['day'])}"
    rev = sum(x["rev"] for x in days); base = sum(x["base"] for x in days)
    units = sum(x["u"] for x in days); base_u = sum(x["base_u"] for x in days)
    peak = max(days, key=lambda x: x["rev"])
    n = len(days)
    cr = lambda paise: rupees(paise, t)

    hero = f"""<div class="hero">
      <div class="big"><div class="v">{esc(cr(rev))}</div><div class="l">{esc(t['fest_total'].format(n=n))}<br>{esc(t['fest_total_s'].format(pct=signed(rev / base - 1)))}</div></div>
      <div class="big"><div class="v">{esc(cr(max(0, rev - base)))}</div><div class="l">{esc(t['fest_extra'])}<br>{esc(t['fest_extra_s'])}</div></div>
      <div class="big"><div class="v">{esc(lakh_word(units, t))}</div><div class="l">{esc(t['fest_bottles'])}<br>{esc(t['fest_bottles_s'].format(extra=lakh_word(max(0, units - base_u), t)))}</div></div>
      <div class="big"><div class="v">{esc(cr(peak['rev']))}</div><div class="l">{esc(t['fest_peak'].format(day=dlabel(peak['day'])))}<br>{esc(t['fest_peak_s'].format(pct=signed(peak['rev'] / peak['base'] - 1), wd=t['wd'][_dow(peak['day'])]))}</div></div>
    </div>"""

    left_w = int(inner * 0.56)
    right_w = inner - left_w - 26
    items = [(lab(x["off"]), dlabel(x["day"]), x["rev"], x["base"], signed(x["rev"] / x["base"] - 1) if x["base"] else "") for x in days]
    dd = next(x for x in days if x["off"] == 0)
    hl = [t["fest_close"] if h == 0 else f"{h:02d}:00" for h in F["cols"]]
    rowA = f"""<div class="row" style="grid-template-columns: {left_w}px 1fr">
      <section class="panel"><h2>{esc(t['fest_days'])}</h2><p class="ps">{esc(t['fest_days_s'])}</p>{svg_festdays(items, cr, left_w, 300 if lang == 'en' else 250, f, t)}</section>
      <section class="panel"><h2>{esc(t['fest_hours'].format(label=lab(0).upper() if lang == 'en' else lab(0)))}</h2><p class="ps">{esc(t['fest_hours_s'].format(wd=t['wd'][_dow(dd['day'])]))}</p>{svg_curve(hl, dd['hours'], dd['base_hours'], cr, right_w, 250 if lang == 'en' else 214, f)}</section>
    </div>"""

    # categories
    ct, cb = defaultdict(float), defaultdict(float)
    for x in days:
        for c, v in x["cats"].items(): ct[c] += v
        for c, v in x["base_cats"].items(): cb[c] += v
    allb = sum(cb.values()) or 1
    cats = sorted([(t["cat"][c], ct[c] / cb[c] - 1, CAT_COLOR[c]) for c in CATS if cb[c] / allb >= 0.003], key=lambda r: -r[1])

    # history: eve + day, a day
    hist = sorted(F["history"], key=lambda y: y["year"])
    hl2, hv, hc = [], [], []
    for y in hist:
        pd = y.get("perDay", {})
        e, d0 = pd.get(_add(y["day"], -1)), pd.get(y["day"])
        if e is None or d0 is None:
            continue
        hl2.append(str(y["year"])); hv.append((e + d0) / 2 * 1e9); hc.append(MARK)
    ours = [x for x in days if x["off"] in (-1, 0)]
    hl2.append(f"{year}*"); hv.append(sum(x["rev"] for x in ours) / len(ours)); hc.append(SEQ[0])
    rowB = f"""<div class="row" style="grid-template-columns: {int(inner * 0.36)}px 1fr">
      <section class="panel"><h2>{esc(t['fest_cats'])}</h2><p class="ps">{esc(t['fest_cats_s'].format(n=n))}</p>{svg_lift(cats, int(inner * 0.36), f, label_w=150 if lang == 'en' else 170, row_h=34)}</section>
      <section class="panel"><h2>{esc(t['fest_hist'].format(first=hl2[0]))}</h2><p class="ps">{esc(t['fest_hist_s'])}</p>{svg_columns(hl2, hv, lambda v: rupees(v, t).replace(t['crore'], ''), inner - int(inner * 0.36) - 26, 214 if lang == 'en' else 190, f, colors=hc, label_size=17)}</section>
    </div>"""

    # districts
    nm = lambda did: (F["ta"].get(did) if lang == "ta" else None) or F["names"].get(did, str(did))
    dist = defaultdict(lambda: [0.0, 0.0])
    for x in days:
        for k, v in x["dist"].items(): dist[k][0] += v
        for k, v in x["base_dist"].items(): dist[k][1] += v
    drows = sorted([{"id": k, "name": nm(k), "rev": a, "lift": a / b - 1} for k, (a, b) in dist.items() if b > 0], key=lambda r: -r["lift"])
    map_w = 340 if lang == 'en' else 300
    m = max(r["lift"] for r in drows) or 1
    cols = t["fest_rank_cols"]
    def half(part, first):
        body_rows = "".join(
            f'<tr><td class="r">{i + first}</td><td>{esc(r["name"])}</td>'
            f'<td><span class="bar" style="width:{max(0, r["lift"]) / m * 80:.0f}px"></span></td>'
            f'<td class="n">{esc(cr(r["rev"]))}</td><td class="n"><b>{esc(signed(r["lift"]))}</b></td></tr>'
            for i, r in enumerate(part))
        return (f'<table class="rank"><thead><tr><th></th><th>{esc(cols[0])}</th><th></th><th class="n">{esc(cols[1])}</th>'
                f'<th class="n">{esc(cols[2])}</th></tr></thead><tbody>{body_rows}</tbody></table>')
    k = (len(drows) + 1) // 2
    rowC = f"""<section class="panel"><h2>{esc(t['fest_map'])}</h2><p class="ps">{esc(t['fest_map_s'].format(n=n))}</p>
      <div class="row" style="grid-template-columns: {map_w}px 1fr; align-items: start">
        <div>{svg_value_map(drows, 'lift', map_w, f)}</div>
        <div class="fest-rank" style="display:grid;grid-template-columns:1fr 1fr;gap:20px">{half(drows[:k], 1)}{half(drows[k:], k + 1)}</div>
      </div></section>"""

    # cards
    rt = sum(F["regions"].values()) or 1
    off = next((y for y in reversed(hist) for r in y["reports"] if len(r.get("regions") or {}) >= 5), None)
    offr = next((r["regions"] for r in off["reports"] if len(r.get("regions") or {}) >= 5), {}) if off else {}
    ot = sum(offr.values()) or 1
    rname = lambda r: REGION_TA.get(r, r) if lang == "ta" else REGION_EN.get(r, r)
    reg_list = "".join(f'<div><span>{esc(rname(r))}</span><span>{v / rt * 100:.1f}%{f" · {offr[r] / ot * 100:.1f}%" if r in offr else ""}</span></div>'
                       for r, v in sorted(F["regions"].items(), key=lambda kv: -kv[1]))
    eve = next(x for x in days if x["off"] == -1)
    ch = next((r for r in drows if F["names"].get(r["id"]) == "Chennai"), None)
    q_span = f"{dlabel(ours[0]['day'])} – {dlabel(ours[-1]['day'])}"
    # The "city empties" line is TASMAC's own explanation; it is only drawn when the
    # numbers show it — Chennai rising less than the state. Otherwise, the least rise.
    state = rev / base - 1
    if ch and ch["lift"] < state:
        city = (f'<div class="card"><h2>{esc(t["fest_city"])}</h2><div class="v">{esc(signed(ch["lift"]))}</div>'
                f'<div class="m">{esc(t["fest_city_s"].format(c=signed(ch["lift"]), s=signed(state)))}</div></div>')
    else:
        lo = drows[-1]
        city = (f'<div class="card"><h2>{esc(t["fest_least"])}</h2><div class="v">{esc(signed(lo["lift"]))}</div>'
                f'<div class="m">{esc(t["fest_least_s"].format(d=lo["name"], c=signed(lo["lift"]), s=signed(state)))}</div></div>')
    cards = f"""<div class="cards" style="grid-template-columns: 1.1fr 1fr 1fr 1fr">
      <div class="card"><h2>{esc(t['fest_reg'])}</h2><div class="m">{esc(t['fest_reg_s'].format(ours=year, year=off['year'] if off else ''))}</div><div class="list" style="margin-top:6px">{reg_list}</div></div>
      <div class="card"><h2>{esc(t['fest_quote'])}</h2><div class="v">{esc(cr(sum(x['rev'] for x in ours)))}</div><div class="m">{esc(t['fest_quote_s'].format(span=q_span))}</div></div>
      <div class="card"><h2>{esc(t['fest_day'].format(name=fname.upper() if lang == 'en' else fname))}</h2><div class="v">{esc(cr(dd['rev']))}</div><div class="m">{esc(t['fest_day_s'].format(pct=signed(dd['rev'] / dd['base'] - 1), wd=t['wd'][_dow(dd['day'])], eve=cr(eve['rev'])))}</div></div>
      {city}
    </div>"""

    now = dt.datetime.now(IST).strftime("%d %b %Y %H:%M") if lang == "en" else dt.datetime.now(IST).strftime("%d.%m.%Y %H:%M")
    # Outlets only, each once: the full citations, with links, are on the site.
    outlets = []
    for y in hist:
        for r in y["reports"]:
            o = r["source"].split(",")[0].split(";")[0].strip()
            if o not in outlets:
                outlets.append(o)
    srcs = ", ".join(outlets) + f" ({hist[0]['year']}–{hist[-1]['year']}; tasmac.reclaimchennai.city/db)"
    others = ", ".join(o["name"][lang] for o in F["others"]) or "–"
    foot = (f'<p class="alc">{esc(t["foot_alc"])}</p>'
            f'<p>{esc(t["fest_foot1"].format(now=now))}</p>'
            f'<p>{esc(t["foot2"])}</p>'
            f'<p>{esc(t["fest_foot"].format(start=date_label(days[0]["day"], t), others=others, unplaced=F["unplaced"]))}</p>'
            f'<p>{esc(t["fest_foot2"].format(sources=srcs))}</p>')
    return page(t, t["fest_kicker"].format(name=fname, year=year, span=span_txt), t["fest_t"].format(name=fname, year=year, total=cr(rev), n=n),
                t["fest_s"].format(span=span_txt), hero + rowA + rowB + rowC + cards, foot)


SHEETS = {"overview": overview, "districts": districts, "brands": brands, "percapita": percapita}


def render(html_by_name: dict[str, str]) -> None:
    from playwright.sync_api import sync_playwright
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for nm, doc in html_by_name.items():
            src = OUT / f".{nm}.html"
            src.write_text(doc, encoding="utf-8")
            pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
            pg.goto(src.as_uri(), wait_until="load")
            pg.wait_for_timeout(300)
            over = pg.evaluate("(() => { const s = document.querySelector('.sheet'); return s.scrollHeight - s.clientHeight; })()")
            if over > 0:
                print(f"  ! {nm}: content overflows the sheet by {over}px")
            pg.screenshot(path=str(OUT / f"{nm}.png"), full_page=False)
            pg.pdf(path=str(OUT / f"{nm}.pdf"), width=f"{W_IN}in", height=f"{H_IN}in", print_background=True)
            prev = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=0.6)
            prev.goto(src.as_uri(), wait_until="load")
            prev.screenshot(path=str(OUT / f"{nm}_preview.jpg"), type="jpeg", quality=82)
            prev.close()
            pg.close()
            src.unlink()
            print(f"  {nm}: png, pdf, preview")
        b.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=list(SHEETS) + ["festival", "prices"])
    ap.add_argument("--lang", choices=["en", "ta"])
    ap.add_argument("--festival", default="deepavali", help="festival sheet to draw (src/data/festivals.json id)")
    ap.add_argument("--force-festival", action="store_true", help="draw the festival sheet before its window has closed (preview)")
    a = ap.parse_args()
    D = load()
    docs = {}
    for kind, fn in SHEETS.items():
        if a.only and kind != a.only:
            continue
        for lang in ("en", "ta"):
            if a.lang and lang != a.lang:
                continue
            docs[f"{kind}_{lang}"] = fn(D, lang)
    # The festival sheet waits until its last day has closed — a sheet of a rush
    # still under way would be printed and shared as if it were the total.
    if not a.only or a.only == "festival":
        F = load_festival(a.festival)
        if F and (F["closed"] or a.force_festival):
            kind = f"{a.festival}-{F['def']['day'][:4]}"
            for lang in ("en", "ta"):
                if not a.lang or lang == a.lang:
                    docs[f"{kind}_{lang}"] = festival_sheet(F, lang)
        elif F:
            print(f"  {a.festival}: window still open (to {F['days'][-1]['day']}), sheet not drawn")
    # Deepavali against the MRP, 2015 onwards: TASMAC's own figures, so it only changes
    # when a year is added to festivals.json; drawn every run all the same.
    if not a.only or a.only == "prices":
        import prices
        Pd = prices.load_prices()
        for lang in ("en", "ta"):
            if not a.lang or lang == a.lang:
                docs[f"deepavali-prices_{lang}"] = prices.prices_sheet(Pd, lang)
    render(docs)


if __name__ == "__main__":
    main()
