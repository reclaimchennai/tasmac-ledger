"""
Deepavali and the MRP: how much of the rise in TASMAC's Deepavali takings is the
price tag, and how much is more bottles. Drawn by render.py as `deepavali-prices`.

The price index is a fixed basket: every bottle size that sells today, weighted by
the bottles this feed has seen sold since ANALYSIS_FROM, priced as each Deepavali
found it in TASMAC's own MRP lists (mrp_history), and chain-linked list to list over
the SKUs priced on both, so a brand that came or went never moves the index.
Deepavali sales are TASMAC's own figures (src/data/festivals.json), the eve and the
day averaged to one day, the two days every year's release has. Dividing them by
the index gives the takings at 2015 prices, which is the bottles, give or take a
change in what people buy.
"""
import datetime as dt
import json
import math
import sqlite3

import render as R
from render import INK, MUTED, MARK, SEQ, RULE, PAPER, W, PAD, esc, nice_max, page

CPI = R.ROOT / "src" / "data" / "cpi-tn.json"

# The MRP in force at each Deepavali. There is no list from the 7 March 2022 hike,
# and none was reported in 2023 before 25 May, so the 2023 list stands for 2022.
EFF = {2012: "2012-11-13", 2015: "2015-11-10", 2016: "2016-10-29", 2017: "2017-10-18", 2018: "2018-11-06",
       2019: "2019-10-27", 2020: "2020-11-14", 2021: "2021-11-04", 2022: "2023-06-01", 2023: "2023-11-12",
       2024: "2024-10-31", 2025: "2025-10-20"}
# The quarter's price, once per list.
QLISTS = [("2012-09-10", "2012-11-13"), ("2014-11-01", "2015-11-10"), ("2017-10-13", "2017-10-18"),
          ("2020-05-07", "2020-11-14"), ("2022-03-07", "2023-06-01"), ("2024-02-01", "2024-10-31")]

S = {
    "en": {
        "kicker": "TASMAC SALES · DEEPAVALI AND THE MRP · 2015 – 2025",
        "title": "Half of Deepavali's rise is the price",
        "sub": "TASMAC's Deepavali takings went from {a} a day in 2015 to {b} in 2025. Priced at 2015's MRP, the same bottles would have come to {c}. The rest is the price tag.",
        "h_sales": "Deepavali takings a day, {y0} to {y1}", "h_sales_s": "{a} to {b}, TASMAC's figures",
        "h_mrp": "what the same bottles cost", "h_mrp_s": "TASMAC's MRP, {y0} to {y1}",
        "h_cpi": "everything else", "h_cpi_s": "Tamil Nadu's consumer prices, {y0} to {y1}",
        "h_vol": "more bottles", "h_vol_s": "takings at {y0} prices, {y0} to {y1}",
        "split": "Every Deepavali, split", "split_s": "TASMAC's takings a day (the eve and the day itself). The dark part is the same bottles at 2015's MRP; the pale part is what the price rises since added.",
        "split_vol": "At 2015 prices", "split_price": "Added by price rises", "hike": "price rise",
        "lines": "Four things, from 2015 = 100", "lines_s": "Deepavali takings, TASMAC's MRP and two of Tamil Nadu's official price indices, each against its own Deepavali month of 2015.",
        "l_sales": "Deepavali takings", "l_mrp": "TASMAC MRP", "l_cpi": "TN consumer prices", "l_pti": "TN pan, tobacco, liquor",
        "quarter": "The quarter that sells most", "quarter_s": "A 180 ml quarter of the brandies that are half of every bottle sold today ({share}), at each MRP list.",
        "table": "Year by year", "table_cols": ["Year", "Day", "Takings", "MRP", "At 2015 prices"],
        "c1": "Since 2019", "c1_s": "more bottles at 2015 prices from 2019 to 2025, while the takings rose {r}. The MRP went up {p} in between, so most of the rise since 2019 is price.",
        "c2": "In a year with a hike", "c2_v": "{a}", "c2_s": "the average rise in takings in the {n} years with a price rise, against {b} in the {m} without. Bottles fell in {fell}. A hike lifts the rupees, not the drinking.",
        "c3": "No dearer than the rest", "c3_v": "{a}", "c3_s": "TASMAC's MRP from 2015 to 2025, against {b} for Tamil Nadu's consumer prices. Liquor kept pace with everything else, no more.",
        "c4": "What this cannot say", "c4_s": "Ten Deepavalis are few. Each lands on a different weekday, 2020 came after the lockdown, and one festival is not the year. A rise that people pay without drinking less is the state's revenue, not more drinking.",
        "foot1": "Takings are TASMAC's own Deepavali figures as its officials gave them to the press, the eve and the day averaged to one day (2015's eve is the two-day total less the day). 2026 is left out until TASMAC gives its figure.",
        "foot2": "The MRP is a fixed basket. Every bottle size on sale today, weighted by the bottles this feed has seen sold since 10 Aug 2026, priced as each Deepavali found it in TASMAC's MRP lists of {lists}, chain-linked list to list. No list exists from the 7 Mar 2022 hike, so the 25 May 2023 list stands for Deepavali 2022. The hikes of Aug 2014, Feb 2020, May 2020, Mar 2022 and Feb 2024 are from press reports.",
        "foot3": "Consumer prices are MoSPI's CPI for Tamil Nadu (base 2012, rural and urban combined) in the month of each Deepavali, the General index and the Pan, tobacco and intoxicants group. That group mixes liquor with pan and tobacco, so it drifts up between hikes, but its five largest monthly jumps since 2014 fall in TASMAC's hike months (Nov 2014, Nov 2017, Feb 2020, Mar 2022, Feb 2024), which bears out the dates used here. Takings at 2015 prices are the takings divided by the MRP index, so they move with the bottles and with any shift to dearer or cheaper brands.",
        "foot4": "Rendered {now} from tasmac.reclaimchennai.city/db · @reclaimchennai.",
    },
    "ta": {
        "kicker": "டாஸ்மாக் விற்பனை · தீபாவளியும் விலையும் · 2015 – 2025",
        "title": "தீபாவளி விற்பனை உயர்வில் பாதி விலையேற்றம்",
        "sub": "டாஸ்மாக்கின் தீபாவளி விற்பனை 2015-இல் நாளொன்றுக்கு {a}, 2025-இல் {b}. 2015 விலையில் அதே பாட்டில்கள் {c} ஆகியிருக்கும். மீதி விலையேற்றம்.",
        "h_sales": "தீபாவளி நாளொன்றுக்கு விற்பனை, {y0} முதல் {y1}", "h_sales_s": "{a} இலிருந்து {b}, டாஸ்மாக் அறிவித்தபடி",
        "h_mrp": "அதே பாட்டில்களின் விலை", "h_mrp_s": "டாஸ்மாக் விலை, {y0} முதல் {y1}",
        "h_cpi": "பிற எல்லாப் பொருட்களும்", "h_cpi_s": "தமிழ்நாட்டு நுகர்வோர் விலை, {y0} முதல் {y1}",
        "h_vol": "கூடுதல் பாட்டில்கள்", "h_vol_s": "{y0} விலையில் விற்பனை, {y0} முதல் {y1}",
        "split": "ஒவ்வொரு தீபாவளியும், பிரித்து", "split_s": "டாஸ்மாக்கின் நாளொன்றுக்கு விற்பனை (முன்தினமும் பண்டிகை நாளும்). அடர் பகுதி 2015 விலையில் அதே பாட்டில்கள்; வெளிர் பகுதி அதன்பின் விலையேற்றம் சேர்த்தது.",
        "split_vol": "2015 விலையில்", "split_price": "விலையேற்றம் சேர்த்தது", "hike": "விலையேற்றம்",
        "lines": "நான்கும், 2015 = 100 என", "lines_s": "தீபாவளி விற்பனை, டாஸ்மாக் விலை, தமிழ்நாட்டின் இரண்டு அதிகாரபூர்வ விலைக் குறியீடுகள், ஒவ்வொன்றும் தன் 2015 தீபாவளி மாதத்துடன்.",
        "l_sales": "தீபாவளி விற்பனை", "l_mrp": "டாஸ்மாக் விலை", "l_cpi": "த.நா நுகர்வோர் விலை", "l_pti": "த.நா பான், புகையிலை, மது",
        "quarter": "அதிகம் விற்கும் குவார்ட்டர்", "quarter_s": "இன்று விற்கும் பாட்டில்களில் பாதியான ({share}) பிராந்திகளின் 180 மி.லி குவார்ட்டர், ஒவ்வொரு விலைப் பட்டியலிலும்.",
        "table": "ஆண்டுதோறும்", "table_cols": ["ஆண்டு", "கிழமை", "விற்பனை", "விலை", "2015 விலையில்"],
        "c1": "2019 முதல்", "c1_s": "2019 முதல் 2025 வரை 2015 விலையில் கூடுதல் பாட்டில்கள்; விற்பனை {r} உயர்ந்தது. இடையில் விலை {p} ஏறியது; எனவே 2019 முதலான உயர்வில் பெரும்பகுதி விலையே.",
        "c2": "விலையேற்ற ஆண்டில்", "c2_v": "{a}", "c2_s": "விலையேற்றம் வந்த {n} ஆண்டுகளில் சராசரி விற்பனை உயர்வு; வராத {m} ஆண்டுகளில் {b}. {fell}-இல் பாட்டில்கள் குறைந்தன. விலையேற்றம் ரூபாயை உயர்த்துகிறது, குடியை அல்ல.",
        "c3": "பிறவற்றை விட விலை கூடவில்லை", "c3_v": "{a}", "c3_s": "2015 முதல் 2025 வரை டாஸ்மாக் விலை; தமிழ்நாட்டு நுகர்வோர் விலை {b}. மது விலை பிற பொருட்களுக்கு இணையாகவே ஏறியது.",
        "c4": "இதனால் சொல்ல முடியாதது", "c4_s": "பத்து தீபாவளிகள் குறைவு. ஒவ்வொன்றும் வெவ்வேறு கிழமை; 2020 ஊரடங்குக்குப் பின் வந்தது; ஒரு பண்டிகை ஓராண்டு அல்ல. குடிப்பதைக் குறைக்காமல் மக்கள் செலுத்தும் விலையேற்றம் அரசின் வருவாய், கூடுதல் குடி அல்ல.",
        "foot1": "விற்பனை என்பது டாஸ்மாக் அதிகாரிகள் செய்தியாளர்களுக்குச் சொன்ன தீபாவளி எண்ணிக்கை, முன்தினமும் பண்டிகை நாளும் ஒரு நாள் சராசரியாக (2015-இன் முன்தினம் இரண்டு நாள் மொத்தத்திலிருந்து பண்டிகை நாளைக் கழித்தது). டாஸ்மாக் அறிவிக்கும் வரை 2026 சேர்க்கப்படவில்லை.",
        "foot2": "விலை ஒரு நிலையான கூடை. இன்று விற்கும் ஒவ்வொரு பாட்டில் அளவும், 10 ஆக 2026 முதல் இத்தரவு கண்ட விற்பனைப்படி எடையிட்டு, ஒவ்வொரு தீபாவளியின்போதும் டாஸ்மாக் விலைப் பட்டியல்களில் ({lists}) இருந்த விலையில், பட்டியலுக்குப் பட்டியல் இணைக்கப்பட்டது. 7 மார் 2022 விலையேற்றப் பட்டியல் இல்லாததால் 25 மே 2023 பட்டியல் 2022 தீபாவளிக்குப் பயன்படுத்தப்பட்டது. ஆக 2014, பிப் 2020, மே 2020, மார் 2022, பிப் 2024 விலையேற்றங்கள் செய்தி அறிக்கைகளிலிருந்து.",
        "foot3": "நுகர்வோர் விலை என்பது ஒவ்வொரு தீபாவளி மாதத்திலும் MoSPI-யின் தமிழ்நாட்டு CPI (அடிப்படை 2012, கிராம நகர ஒருங்கிணைந்தது), பொதுக் குறியீடும் பான், புகையிலை, போதைப்பொருள் பிரிவும். அப்பிரிவில் மதுவுடன் பான், புகையிலையும் சேர்ந்திருப்பதால் விலையேற்றங்களுக்கு இடையிலும் ஏறுகிறது; ஆனால் 2014 முதல் அதன் ஐந்து பெரிய மாதாந்திர உயர்வுகளும் டாஸ்மாக் விலையேற்ற மாதங்களில் (நவ 2014, நவ 2017, பிப் 2020, மார் 2022, பிப் 2024) விழுகின்றன; இங்கு பயன்படுத்திய தேதிகளை அது உறுதி செய்கிறது. 2015 விலையில் விற்பனை என்பது விற்பனையை விலைக் குறியீட்டால் வகுத்தது; எனவே அது பாட்டில்களோடும், விலை கூடிய அல்லது குறைந்த பிராண்டுகளுக்கு மாறுவதோடும் நகரும்.",
        "foot4": "{now} அன்று tasmac.reclaimchennai.city/db இலிருந்து உருவாக்கப்பட்டது · @reclaimchennai.",
    },
}


def load_prices() -> dict:
    c = sqlite3.connect(f"file:{R.DB}?mode=ro", uri=True)
    q = dict(c.execute(f"SELECT sku_id, SUM(units) FROM fact_sales WHERE day >= '{R.ANALYSIS_FROM}' GROUP BY sku_id"))
    at = lambda d: dict(c.execute("SELECT sku_id, mrp FROM mrp_history WHERE observed_from <= ? AND (observed_to IS NULL OR observed_to > ?)", (d, d)))
    P = {y: at(d) for y, d in EFF.items()}
    ys = sorted(EFF)
    idx = {ys[0]: 1.0}
    for a, b in zip(ys, ys[1:]):
        common = [s for s in P[a] if s in P[b] and q.get(s)]
        idx[b] = idx[a] * sum(q[s] * P[b][s] for s in common) / sum(q[s] * P[a][s] for s in common)
    # the best-selling quarter: the most-bought 180 ml SKU, and how much of all bottles sell at its price today
    top = c.execute("""SELECT f.sku_id FROM fact_sales f JOIN v_sku_full s USING (sku_id) WHERE s.volume_ml = 180 AND f.day >= ?
                       GROUP BY f.sku_id ORDER BY SUM(f.units) DESC LIMIT 1""", (R.ANALYSIS_FROM,)).fetchone()[0]
    qp = [(lst, c.execute("SELECT mrp FROM mrp_history WHERE sku_id = ? AND observed_from <= ? AND (observed_to IS NULL OR observed_to > ?)",
                          (top, d, d)).fetchone()) for lst, d in QLISTS]
    now_p = c.execute("SELECT mrp FROM mrp_history WHERE sku_id = ? AND observed_to IS NULL", (top,)).fetchone()[0]
    tot = sum(q.values())
    same = c.execute(f"""SELECT SUM(f.units) FROM fact_sales f JOIN v_sku_full s USING (sku_id) JOIN mrp_history m ON m.sku_id = f.sku_id AND m.observed_to IS NULL
                         WHERE s.volume_ml = 180 AND m.mrp = ? AND s.category = 'BRANDY' AND f.day >= '{R.ANALYSIS_FROM}'""", (now_p,)).fetchone()[0] or 0
    lists = [r[0] for r in c.execute("SELECT DISTINCT observed_from FROM mrp_history WHERE source LIKE 'TASMAC MRP list%' ORDER BY 1")]
    fest = json.loads(R.FEST.read_text(encoding="utf-8"))["history"]["deepavali"]
    rows = []
    for y in sorted(fest, key=lambda r: r["year"]):
        pd = y.get("perDay", {})
        e, d0 = pd.get(R._add(y["day"], -1)), pd.get(y["day"])
        if e is None or d0 is None or y["year"] not in idx:
            continue
        rows.append({"year": y["year"], "day": y["day"], "rev": (e + d0) / 2})
    cpi = json.loads(CPI.read_text(encoding="utf-8"))
    mon = lambda r: r["day"][:7]
    y0 = rows[0]["year"]
    for r in rows:
        r["p"] = idx[r["year"]] / idx[y0]
        r["cpi"] = cpi["general"][mon(r)] / cpi["general"][mon(rows[0])]
        r["pti"] = cpi["pti"][mon(r)] / cpi["pti"][mon(rows[0])]
        r["vol"] = r["rev"] / r["p"]
    for a, b in zip(rows, rows[1:]):
        b["hike"] = b["p"] / a["p"] - 1 > 0.005
        b["d_rev"] = b["rev"] / a["rev"] - 1
        b["d_vol"] = b["vol"] / a["vol"] - 1
    return {"rows": rows, "quarter": qp, "quarter_share": same / tot, "lists": [l for l in lists if l <= "2024-02-01"]}


def svg_split(rows, t, s, w, h, font) -> str:
    """Stacked columns: the takings at 2015 prices (dark) and what price added (pale); a mark under each hike year."""
    top, bottom = 40, 76
    ih = h - top - bottom
    band = w / len(rows)
    bw = min(56, band * 0.56)
    ymax, step = nice_max(max(r["rev"] for r in rows))
    y = lambda v: top + ih - v / ymax * ih
    o = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for i, r in enumerate(rows):
        cx = band * i + band / 2
        x0 = cx - bw / 2
        yv, yt = y(r["vol"]), y(r["rev"])
        rr = min(5, bw / 2)
        o.append(f'<rect x="{x0:.1f}" y="{yv:.1f}" width="{bw:.1f}" height="{top + ih - yv:.1f}" fill="{MARK}"/>')
        if r["rev"] - r["vol"] > 0.5:
            o.append(f'<path d="M{x0:.1f},{yv - 2:.1f}V{yt + rr:.1f}Q{x0:.1f},{yt:.1f} {x0 + rr:.1f},{yt:.1f}H{x0 + bw - rr:.1f}Q{x0 + bw:.1f},{yt:.1f} {x0 + bw:.1f},{yt + rr:.1f}V{yv - 2:.1f}Z" fill="{SEQ[0]}"/>')
        o.append(f'<text x="{cx:.1f}" y="{yt - 10:.1f}" text-anchor="middle" font-size="18" font-weight="700" fill="{INK}">₹{r["rev"]:.0f}</text>')
        o.append(f'<text x="{cx:.1f}" y="{top + ih + 28}" text-anchor="middle" font-size="18" fill="{INK}">{r["year"]}</text>')
        if r.get("hike"):
            o.append(f'<path d="M{cx - 7:.1f},{top + ih + 50}L{cx + 7:.1f},{top + ih + 50}L{cx:.1f},{top + ih + 38}Z" fill="{INK}"/>')
            o.append(f'<text x="{cx:.1f}" y="{top + ih + 70}" text-anchor="middle" font-size="14" fill="{MUTED}">{esc(s["hike"])}</text>')
    o.append(f'<line x1="0" x2="{w}" y1="{top + ih}" y2="{top + ih}" stroke="#b9b2a4" stroke-width="1.2"/></svg>')
    return "".join(o)


def svg_index(rows, s, w, h, font) -> str:
    """Three lines on one scale, each from its own 2015 = 100. Labelled at the right end."""
    left, top, bottom, right = 54, 20, 36, 200
    iw, ih = w - left - right, h - top - bottom
    series = [("rev", s["l_sales"], MARK, 4.5, ""), ("p", s["l_mrp"], INK, 3.2, ""), ("pti", s["l_pti"], R.WEEK, 3, "2 6"), ("cpi", s["l_cpi"], MUTED, 3, "9 7")]
    val = lambda r, k: r["rev"] / rows[0]["rev"] * 100 if k == "rev" else r[k] * 100
    lo, step = 100, 50
    ymax = math.ceil(max(val(r, k) for r in rows for k, *_ in series) / step) * step
    x = lambda i: left + i / (len(rows) - 1) * iw
    y = lambda v: top + ih - (v - lo) / (ymax - lo) * ih
    o = [f'<svg width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    v = lo
    while v <= ymax + 1:
        o.append(f'<line x1="{left}" x2="{left + iw}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="{RULE}"/>')
        o.append(f'<text x="{left - 10}" y="{y(v) + 6:.1f}" text-anchor="end" font-size="16" fill="{MUTED}">{v:.0f}</text>')
        v += step
    ends = []
    for k, lab, col, sw, dash in series:
        pts = " ".join(f"{x(i):.1f},{y(val(r, k)):.1f}" for i, r in enumerate(rows))
        o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linejoin="round"'
                 + (f' stroke-dasharray="{dash}" stroke-linecap="round"' if dash else "") + "/>")
        ends.append([y(val(rows[-1], k)), lab, col, val(rows[-1], k)])
    ends.sort()
    for i in range(1, len(ends)):                      # keep end labels 40px apart
        ends[i][0] = max(ends[i][0], ends[i - 1][0] + 40)
    for yy, lab, col, v in ends:
        o.append(f'<text x="{left + iw + 12}" y="{yy:.1f}" font-size="17" font-weight="700" fill="{INK}">{v:.0f}</text>')
        o.append(f'<text x="{left + iw + 12}" y="{yy + 19:.1f}" font-size="15" fill="{MUTED}"><tspan fill="{col}">■</tspan> {esc(lab)}</text>')
    for i, r in enumerate(rows):
        if i % 2 == 0 or i == len(rows) - 1:
            o.append(f'<text x="{x(i):.1f}" y="{h - 8}" text-anchor="middle" font-size="16" fill="{MUTED}">{r["year"]}</text>')
    o.append(f'<line x1="{left}" x2="{left + iw}" y1="{top + ih}" y2="{top + ih}" stroke="#b9b2a4" stroke-width="1.2"/></svg>')
    return "".join(o)


def prices_sheet(Pd, lang) -> str:
    t, s = R.T[lang], S[lang]
    f = t["font"]
    inner = W - 2 * PAD
    rows = Pd["rows"]
    a, b = rows[0], rows[-1]
    cr = lambda v: f"₹{v:.0f} {t['crore']}"
    pc = lambda v: f"{'+' if v >= 0 else '−'}{abs(v * 100):.0f}%"
    pu = lambda v: f"{abs(v * 100):.0f}%"
    y0, y1 = a["year"], b["year"]

    hero = f"""<div class="hero">
      <div class="big"><div class="v">×{b['rev'] / a['rev']:.1f}</div><div class="l">{esc(s['h_sales'].format(y0=y0, y1=y1))}<br>{esc(s['h_sales_s'].format(a=cr(a['rev']), b=cr(b['rev'])))}</div></div>
      <div class="big"><div class="v">{pc(b['p'] - 1)}</div><div class="l">{esc(s['h_mrp'])}<br>{esc(s['h_mrp_s'].format(y0=y0, y1=y1))}</div></div>
      <div class="big"><div class="v">{pc(b['cpi'] - 1)}</div><div class="l">{esc(s['h_cpi'])}<br>{esc(s['h_cpi_s'].format(y0=y0, y1=y1))}</div></div>
      <div class="big"><div class="v">{pc(b['vol'] / a['vol'] - 1)}</div><div class="l">{esc(s['h_vol'])}<br>{esc(s['h_vol_s'].format(y0=y0, y1=y1))}</div></div>
    </div>"""

    left_w = int(inner * 0.56)
    right_w = inner - left_w - 26
    leg = (f'<div class="legend"><span><i style="background:{MARK}"></i>{esc(s["split_vol"])}</span>'
           f'<span><i style="background:{SEQ[0]}"></i>{esc(s["split_price"])}</span></div>')
    rowA = f"""<div class="row" style="grid-template-columns: {left_w}px 1fr">
      <section class="panel"><h2>{esc(s['split'])}</h2><p class="ps">{esc(s['split_s'])}</p>{leg}{svg_split(rows, t, s, left_w, 520, f)}</section>
      <section class="panel"><h2>{esc(s['lines'])}</h2><p class="ps">{esc(s['lines_s'])}</p>{svg_index(rows, s, right_w, 560, f)}</section>
    </div>"""

    ql = [f"{t['mon'][int(d[5:7]) - 1]} {d[:4]}" for d, _ in Pd["quarter"]]
    qv = [p[0] if p else 0 for _, p in Pd["quarter"]]
    qw = int(inner * 0.42)
    cols = s["table_cols"]
    trs = "".join(
        f'<tr><td>{r["year"]}</td><td>{esc(t["wds"][R._dow(r["day"])])}</td><td class="n">{esc(cr(r["rev"]))}</td>'
        f'<td class="n">{"<b>" + pc(r["p"] / rows[i - 1]["p"] - 1) + "</b>" if r.get("hike") else "–"}</td>'
        f'<td class="n">{esc(cr(r["vol"]))}</td></tr>' for i, r in enumerate(rows))
    table = (f'<table class="rank"><thead><tr><th>{esc(cols[0])}</th><th>{esc(cols[1])}</th><th class="n">{esc(cols[2])}</th>'
             f'<th class="n">{esc(cols[3])}</th><th class="n">{esc(cols[4])}</th></tr></thead><tbody>{trs}</tbody></table>')
    rowB = f"""<div class="row" style="grid-template-columns: {qw}px 1fr">
      <section class="panel"><h2>{esc(s['quarter'])}</h2><p class="ps">{esc(s['quarter_s'].format(share=pc(Pd['quarter_share']).lstrip('+')))}</p>{R.svg_columns(ql, qv, lambda v: f'₹{v:.0f}', qw, 470 if lang == 'en' else 420, f, label_size=17)}</section>
      <section class="panel pr"><style>.pr table.rank {{ font-size: 20px; }} .pr table.rank td {{ padding: {9 if lang == 'en' else 7}px 6px; }}</style><h2>{esc(s['table'])}</h2>{table}</section>
    </div>"""

    r19 = next(r for r in rows if r["year"] == 2019)
    hk = [r for r in rows[1:] if r.get("hike")]
    nh = [r for r in rows[1:] if not r.get("hike")]
    mean = lambda xs: sum(xs) / len(xs)
    fell = [str(r["year"]) for r in hk if r["d_vol"] < 0]
    and_ = " and " if lang == "en" else ", "
    fell_s = (", ".join(fell[:-1]) + and_ + fell[-1]) if len(fell) > 1 else "".join(fell)
    cards = f"""<div class="cards" style="grid-template-columns: 1fr 1fr 1fr 1.25fr">
      <div class="card"><h2>{esc(s['c1'])}</h2><div class="v">{pc(b['vol'] / r19['vol'] - 1)}</div><div class="m">{esc(s['c1_s'].format(r=pu(b['rev'] / r19['rev'] - 1), p=pu(b['p'] / r19['p'] - 1)))}</div></div>
      <div class="card"><h2>{esc(s['c2'])}</h2><div class="v">{esc(s['c2_v'].format(a=pc(mean([r['d_rev'] for r in hk]))))}</div><div class="m">{esc(s['c2_s'].format(n=len(hk), m=len(nh), fell=fell_s, b=pc(mean([r['d_rev'] for r in nh]))))}</div></div>
      <div class="card"><h2>{esc(s['c3'])}</h2><div class="v">{esc(s['c3_v'].format(a=pc(b['p'] - 1)))}</div><div class="m">{esc(s['c3_s'].format(b=pc(b['cpi'] - 1)))}</div></div>
      <div class="card"><h2>{esc(s['c4'])}</h2><div class="m" style="margin-top:8px">{esc(s['c4_s'])}</div></div>
    </div>"""

    now = dt.datetime.now(R.IST).strftime("%d %b %Y %H:%M") if lang == "en" else dt.datetime.now(R.IST).strftime("%d.%m.%Y %H:%M")
    lists = ", ".join(R.date_label(l, t) for l in Pd["lists"])
    foot = "".join(f"<p>{esc(x)}</p>" for x in (s["foot1"], s["foot2"].format(lists=lists), s["foot3"], s["foot4"].format(now=now)))
    sub = s["sub"].format(a=cr(a["rev"]), b=cr(b["rev"]), c=cr(b["vol"]))
    return page(t, s["kicker"], s["title"], sub, hero + rowA + rowB + cards, foot)
