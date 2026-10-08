#!/usr/bin/env python3
"""Build data/cities-5000.txt for My Travels city search.

Inputs (GeoNames, CC-BY 4.0, https://download.geonames.org/export/dump/):
  cities5000.txt, admin1CodesASCII.txt, countryInfo.txt, alternateNamesV2.txt (optional)
Usage: python3 tools/build_cities.py /path/to/geonames-dir

Output format (UTF-8, newline separated, gzip-friendly):
  line 1: JSON array of contexts  [cc2, countryFeatureId, countryName|"", regionName, appAdminId]
          (countryName only when the app has no country feature for it)
  then, grouped by context:  "@<ctxIndex>" line, followed by that context's cities:
          name \t alt1|alt2 \t lat \t lng \t pop/100 \t id
  id: base36 GeoNames id, or a legacy bundled id (e.g. "houston-us") so saved cities keep working.
"""
import json, math, os, re, sys, unicodedata, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GN = sys.argv[1] if len(sys.argv) > 1 else "/workspace/geonames"
OUT = os.path.join(ROOT, "data", "cities-5000.txt")
SKIP_CODES = {"PPLX", "PPLH", "PPLQ", "PPLW"}  # neighbourhoods, historical, abandoned, destroyed
EXT_RE = re.compile("[\u0100-\u024f\u1e00-\u1eff]")

# Curated English / former names (GeoNames 'en' alternate names add more).
CURATED_ALIASES = {
    "1275339": ["Bombay"], "1277333": ["Bangalore"], "1278994": ["Allahabad"], "1270642": ["Gurgaon"],
    "1264527": ["Madras"], "1275004": ["Calcutta"], "1253993": ["Udhagamandalam", "Ootacamund"],
    "1256237": ["Simla"], "1253405": ["Benares", "Banaras", "Kashi"], "1259229": ["Poona"],
    "1254163": ["Trivandrum"], "1273874": ["Cochin"], "1253573": ["Baroda"], "1262321": ["Mysore"],
    "1263780": ["Mangalore"], "1259425": ["Pondicherry"], "1267995": ["Cawnpore"], "1269743": ["Indore"],
    "1816670": ["Peking"], "1809858": ["Canton"], "1566083": ["Saigon"], "1880252": ["Singapore City"],
    "524901": ["Moskva"], "498817": ["Leningrad"], "1850147": ["Tokio"], "2542997": ["Marrakech"],
    "3941584": ["Cuzco"], "3413829": ["Reykjavik"], "1298824": ["Rangoon"], "1185241": ["Dacca"],
    "2800866": ["Bruxelles"], "3169070": ["Roma"], "2643743": ["Londres"],
    "4140963": ["Washington, D.C.", "Washington DC"], "1260607": ["Panaji"], "1154689": ["Koh Samui"],
}

def strip(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def key(s):
    return strip(s).lower().strip()

def b36(n):
    n = int(n); d = "0123456789abcdefghijklmnopqrstuvwxyz"; out = ""
    while True:
        n, r = divmod(n, 36); out = d[r] + out
        if not n: return out

def display(name, ascii_name):
    return ascii_name if EXT_RE.search(name) and ascii_name else name

def hav_km(a, b, c, d):
    p = math.pi / 180
    h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))

# —— Country features in the app (ISO2 → feature id used by app.js featureId()) ——
cfc = json.load(open(os.path.join(ROOT, "data", "countries.geojson")))
iso2_to_feature = {}
for f in cfc["features"]:
    p = f["properties"]
    a2 = p.get("ISO_A2") if p.get("ISO_A2") not in (None, "-99") else p.get("ISO_A2_EH")
    if a2 and a2 != "-99" and a2 not in iso2_to_feature:
        iso2_to_feature[a2] = p["ADM0_A3"]
# app.js splits French overseas departments out of France
iso2_to_feature.update({"GF": "GUF", "GP": "GLP", "MQ": "MTQ", "YT": "MYT", "RE": "REU"})
if any(f["properties"]["ADM0_A3"] == "TWN" for f in cfc["features"]):
    iso2_to_feature.setdefault("TW", "TWN")

country_names = {}
for line in open(os.path.join(GN, "countryInfo.txt"), encoding="utf-8"):
    if line.startswith("#"): continue
    c = line.rstrip("\n").split("\t")
    country_names[c[0]] = c[4]

# —— Admin-1 names + app admin ids (US / IN / AU / AE) ——
admin1 = {}
for line in open(os.path.join(GN, "admin1CodesASCII.txt"), encoding="utf-8"):
    c = line.rstrip("\n").split("\t")
    admin1[c[0]] = display(c[1], c[2])

def load_names(fn, prefix):
    fc = json.load(open(os.path.join(ROOT, "data", fn)))
    return {key(f["properties"]["name"]): f["properties"]["iso_3166_2"] for f in fc["features"]
            if str(f["properties"].get("iso_3166_2", "")).startswith(prefix)}
app_admin_by_name = {"IN": load_names("in-states.geojson", "IN-"), "AU": load_names("au-states.geojson", "AU-"),
                     "AE": load_names("ae-emirates.geojson", "AE-"), "US": load_names("us-states.geojson", "US-")}
us_ids = set(app_admin_by_name["US"].values())

def app_admin_id(cc, code, region):
    if cc == "US":
        return f"US-{code}" if f"US-{code}" in us_ids else ""
    table = app_admin_by_name.get(cc)
    return table.get(key(region), "") if table else ""

# —— Cities ——
rows = []
for line in open(os.path.join(GN, "cities5000.txt"), encoding="utf-8"):
    c = line.rstrip("\n").split("\t")
    if c[7] in SKIP_CODES: continue
    rows.append({"gid": c[0], "name": display(c[1], c[2]), "ascii": c[2], "lat": float(c[4]), "lng": float(c[5]),
                 "cc": c[8], "a1": c[10], "pop": int(c[14] or 0), "alts": [], "id": b36(c[0])})
by_gid = {r["gid"]: r for r in rows}

# English alternate names (not colloquial), only for kept cities
alt_path = os.path.join(GN, "alternateNamesV2.txt")
if os.path.exists(alt_path):
    for line in open(alt_path, encoding="utf-8"):
        c = line.split("\t")
        if c[2] != "en" or c[1] not in by_gid: continue
        if len(c) > 6 and c[6] == "1": continue
        by_gid[c[1]]["alts"].append(c[3])
for gid, names in CURATED_ALIASES.items():
    if gid in by_gid: by_gid[gid]["alts"] = names + by_gid[gid]["alts"]

# —— Legacy bundled cities from js/app.js (keep their ids) ——
app_js = open(os.path.join(ROOT, "js", "app.js"), encoding="utf-8").read()
legacy = re.findall(r'\["([a-z0-9-]+)", "([^"]+)", "([A-Z]{3})", (?:null|"([A-Z]{2}-[A-Z]{2,3})"), (-?[\d.]+), (-?[\d.]+)(?:, \[([^\]]*)\])?\]', app_js)
feature_to_iso2 = {v: k for k, v in iso2_to_feature.items()}
LEGACY_EXTRA_POP = {"sualkuchi-in": 14000, "kanyakumari-in": 30000}
matched, extras = {}, []
for lid, lname, cid, aid, lat, lng, aliases in legacy:
    lat, lng = float(lat), float(lng)
    names = {key(lname)} | {key(a.strip().strip('"')) for a in aliases.split(",") if a.strip()}
    names |= {key(re.sub(r"\s*\(.*\)", "", lname))}
    cc = feature_to_iso2.get(cid)
    best = None
    primary = key(re.sub(r"\s*\(.*\)", "", lname))
    for r in rows:
        if r["cc"] != cc or r["id"] != b36(r["gid"]): continue  # skip rows already claimed
        rk = {key(r["name"]), key(r["ascii"])} | {key(a) for a in r["alts"]}
        if names & rk:
            d = hav_km(lat, lng, r["lat"], r["lng"])
            if d >= 30: continue
            # Exact primary-name match beats alias matches; then larger population.
            rank = (primary in {key(r["name"]), key(r["ascii"])}, r["pop"])
            if best is None or rank > best[0]: best = (rank, r)
    if best:
        best[1]["id"] = lid; matched[lid] = best[1]["name"]
    else:
        region = ""
        if aid:
            region = {"US": None}.get("x") or ""
        extras.append({"gid": None, "name": lname, "ascii": lname, "lat": lat, "lng": lng, "cc": cc or "",
                       "a1": None, "aid": aid or "", "pop": LEGACY_EXTRA_POP.get(lid, 0),
                       "alts": [a.strip().strip('"') for a in aliases.split(",") if a.strip()], "id": lid})

# —— Contexts ——
ctx_index, contexts = {}, []
def ctx_for(r):
    cc = r["cc"]
    if r.get("a1") is None:  # legacy extra: region from its app admin id
        aid = r.get("aid", "")
        region = ""
        for name_key, i in app_admin_by_name.get(cc, {}).items():
            if i == aid: region = name_key.title()
        # Reuse the GeoNames region spelling of an existing context with this admin id.
        for c in contexts:
            if c[0] == cc and c[4] == aid and aid:
                region = c[3]; break
        k = (cc, aid, region)
        ent = [cc, iso2_to_feature.get(cc, ""), "" if cc in iso2_to_feature else country_names.get(cc, cc), region, aid]
    else:
        region = admin1.get(f"{cc}.{r['a1']}", "")
        aid = app_admin_id(cc, r["a1"], region)
        k = (cc, aid, region)
        ent = [cc, iso2_to_feature.get(cc, ""), "" if cc in iso2_to_feature else country_names.get(cc, cc), region, aid]
    if k not in ctx_index:
        ctx_index[k] = len(contexts); contexts.append(ent)
    return ctx_index[k]

all_rows = rows + extras
groups = collections.defaultdict(list)
alt_total = 0
for r in sorted(all_rows, key=lambda r: -r["pop"]):
    seen = {key(r["name"])}
    alts = []
    for a in ([r["ascii"]] if strip(r["name"]) != r["ascii"] else []) + r["alts"]:
        a = a.strip()
        k = key(a)
        if not a or k in seen or len(a) > 40 or "|" in a or "\t" in a: continue
        if not re.fullmatch(r"[A-Za-z0-9 .,'’()\-]+", strip(a)): continue
        seen.add(k); alts.append(a)
        if len(alts) >= 4: break
    alt_total += len(alts)
    fmt = lambda v: f"{v:.3f}".rstrip("0").rstrip(".")
    groups[ctx_for(r)].append("\t".join([r["name"], "|".join(alts), fmt(r["lat"]), fmt(r["lng"]),
                                          str(round(r["pop"] / 100)), r["id"]]))

# Order groups by country then region so neighbouring lines share prefixes (gzip).
order = sorted(groups, key=lambda i: (contexts[i][0], contexts[i][3]))
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(json.dumps(contexts, ensure_ascii=False, separators=(",", ":")) + "\n")
    for i in order:
        fh.write(f"@{i}\n" + "\n".join(groups[i]) + "\n")

# —— Report ——
unmapped_cc = collections.Counter(r["cc"] for r in all_rows if r["cc"] not in iso2_to_feature)
miss_admin = collections.Counter((c[0], c[3]) for c in contexts if c[0] in ("US", "IN", "AU", "AE") and not c[4])
print(json.dumps({
    "cities": len(all_rows), "geonames_rows": len(rows), "legacy_matched": len(matched), "legacy_extra": [e["id"] for e in extras],
    "countries_with_cities": len({r["cc"] for r in all_rows}), "contexts": len(contexts), "alt_names": alt_total,
    "bytes": os.path.getsize(OUT), "unmapped_cc": dict(unmapped_cc.most_common(40)), "missing_app_admin": dict(miss_admin),
}, indent=1))
