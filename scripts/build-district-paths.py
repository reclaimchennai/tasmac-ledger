#!/usr/bin/env python3
"""
District outlines for the /db map -> src/data/tn-districts.json

Source: the 38 dissolved Tamil Nadu district outlines built by the elections
project (~/projects/elections/web/data/geo/tn_districts.geojson, dissolved from
the TNGIS village + ULB layers served by geo-api). Projected once here
(equirectangular, x scaled by cos of the mid-latitude, which at Tamil Nadu's
span is indistinguishable from Mercator), simplified (Douglas-Peucker, ~1 of
a viewBox unit) and written as SVG path strings keyed to OUR district_id, so
the page ships a few tens of KB of paths and does no projection work.

    python3 scripts/build-district-paths.py [path/to/tn_districts.geojson]
"""
import json, math, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "projects/elections/web/data/geo/tn_districts.geojson"
OUT = ROOT / "src/data/tn-districts.json"
W = 1000          # viewBox width; height follows the aspect
TOL = 1.5
MIN_AREA = 40  # viewBox units²; islets and slivers below this are dropped

# their spelling -> ours, where they differ
ALIAS = {"The Nilgiris": "Nilgiris", "Tiruchirappalli": "Thiruchirappalli",
         "Tirupattur": "Thirupathur", "Tiruvarur": "Thiruvarur"}

g = json.loads(SRC.read_text())
db = sqlite3.connect(f"file:{ROOT / 'data/tasmac.db'}?mode=ro", uri=True)
ours = {n: i for i, n in db.execute("SELECT district_id, name FROM district")}

def rings(geom):
    # Exterior rings only. The dissolve leaves interior voids (a reservoir, a
    # reserved forest, slivers between village sheets); at state scale they read
    # as speckle, and a district's sales do not stop at a lake.
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    for poly in polys:
        yield poly[0]

allpts = [p for f in g["features"] for r in rings(f["geometry"]) for p in r]
lon0, lon1 = min(p[0] for p in allpts), max(p[0] for p in allpts)
lat0, lat1 = min(p[1] for p in allpts), max(p[1] for p in allpts)
k = math.cos(math.radians((lat0 + lat1) / 2))
scale = W / ((lon1 - lon0) * k)
H = round((lat1 - lat0) * scale)
proj = lambda p: ((p[0] - lon0) * k * scale, (lat1 - p[1]) * scale)

def dp(pts, tol):
    if len(pts) < 3:
        return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1e-9
    best, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x1 * y0 - y1 * x0) / L
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [pts[0], pts[-1]]
    return dp(pts[: idx + 1], tol)[:-1] + dp(pts[idx:], tol)

out, missing = [], []
for f in g["features"]:
    name = ALIAS.get(f["properties"]["en"], f["properties"]["en"])
    did = ours.get(name)
    if did is None:
        missing.append(name)
        continue
    parts, cx, cy, n = [], 0, 0, 0
    for r in rings(f["geometry"]):
        pts = [proj(p) for p in r]
        # split the closed ring so the simplifier has two ends to anchor
        h = len(pts) // 2
        s = dp(pts[: h + 1], TOL)[:-1] + dp(pts[h:], TOL)
        area = abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(s, s[1:] + s[:1]))) / 2
        if len(s) < 4 or area < MIN_AREA:
            continue
        parts.append("M" + "L".join(f"{x:.0f},{y:.0f}" for x, y in s) + "Z")
        for x, y in s:
            cx += x; cy += y; n += 1
    out.append({"id": did, "name": name, "d": "".join(parts), "cx": round(cx / n, 1), "cy": round(cy / n, 1)})

if missing:
    sys.exit(f"no district_id for: {missing}")
OUT.write_text(json.dumps({"w": W, "h": H, "bbox": [lon0, lat0, lon1, lat1], "k": k, "districts": sorted(out, key=lambda d: d["id"])},
                          separators=(",", ":")))
print(f"{len(out)} districts, {OUT.stat().st_size // 1024} KB, viewBox 0 0 {W} {H}")
