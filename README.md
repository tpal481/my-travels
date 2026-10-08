# My Travels

**Live app:** https://tpal481.github.io/my-travels/ (installable PWA — open on your phone and use *Add to Home screen*).

## Cities & travel history (v19–v22)

- **Cities**: visited cities show as small red dots with bold English labels (labels that would collide hide at low zoom and appear as you zoom in). Tap a pin to see / remove it. Cities are listed under their country in the count-pill list, and counted in stats.
- Add cities from the search box — **worldwide**: ~64k places (GeoNames `cities5000`, population ≥ 5,000, minus neighbourhoods) in `data/cities-5000.txt` (~2.4 MB, ~1.1 MB gzipped), lazy-loaded the first time the search box is used and cached by the service worker. Results rank by match quality, then population, and show "City, Region, Country". English/former names (Bombay, Bangalore, Allahabad, Gurgaon, Madras, Calcutta, Peking…) come from GeoNames English alternate names plus a curated list. Rebuild with `python3 tools/build_cities.py /path/to/geonames` (needs cities5000.txt, admin1CodesASCII.txt, countryInfo.txt, optional alternateNamesV2.txt). City data © GeoNames, CC BY 4.0.
- The small bundled list (`CITY_DB` in `js/app.js`) is used before the gazetteer loads and for the seeds; its ids (`houston-us`, …) are kept in the data file so saved cities stay matched. GeoNames cities are stored as `gn-<base36 geonameid>`. Adding a city also marks its country (and US/AU/IN state or UAE emirate) visited. Stored in `localStorage` under `mytravels.v1` → `cities`.
- **Travel-history seed**: on first load the app merges the user's known visits (9 countries, US-TX, AU-NSW/VIC/ACT, AE-DU, 12 cities) into existing data without removing anything, then sets `mytravels.seed.2026-10-08` so it never runs again.
- **India seed** (separate flag `mytravels.seed.2026-10-08-india`, so it also applies where the first seed already ran): India + 14 states/UTs (IN-DL, AS, ML, TN, KA, RJ, UP, HR, WB, OR, CH, UT, HP, GA) + 22 cities. City search also matches aliases (Bengaluru/Bangalore, Prayagraj/Allahabad, Gurugram/Gurgaon, Delhi/New Delhi…).
- City labels never overlap each other, other city dots, or country labels at any zoom; a city label may hide an Indian state / emirate label it would otherwise collide with.
- Macau is displayed as **Macau** (search also matches "Macao"). Hong Kong / Macau / Singapore labels always show, on fixed sides (Macau left, Hong Kong right). Visited places too small to see at the current zoom get a gold (or canary) dot.
- Visit years may be blank ("Year not set"); manual adds no longer default to the current year (location fixes still do).

## Admin regions (v18)

- **Gold** highlight: visited countries, US states, and Australian states/territories.
- **Canary yellow** (`#FFF44F`): visited Indian states/UTs and UAE emirates.
- Indian state name labels appear when India is in view (zoom ≥ ~4.25).
- UAE emirate labels appear when the UAE is in view (zoom ≥ ~6).
- Menu → **Export Indian states** downloads visited Indian states only (JSON or CSV: id, name, year).
- Fresh phone path: `/v18/`.

Mobile-first Progressive Web App that highlights countries you’ve visited on an interactive world map. Built for a Samsung Android phone (portrait), installable to the home screen.

## Features

- Full-screen light travel map (Leaflet + unlabeled Esri Light Gray tiles)
- Country polygons from Natural Earth (GeoJSON); visited places fill in gold
- **US states** (50 + DC), **Indian states/UTs** (36), and **Australian states/territories** (8) from Natural Earth admin-1; ids like `US-CA` / `IN-DL` / `AU-NSW` stored alongside countries
- **Empty start** — add countries/states via search, or allow location to auto-capture
- Geolocation + reverse geocode (BigDataCloud free client API, no key) with throttling
- Tap a country → bottom sheet with editable visit year, first/last visit, and remove / mark visited
- Stats: countries + US states + Indian states + Australian states counts, rough % of world, grouped list of visits
- Export / import JSON (including editable visit years); clear all
- PWA: web app manifest + service worker (caches the app shell)
- Data persists in `localStorage`

## Project layout

```
travel-map/
  index.html
  css/styles.css
  js/app.js
  manifest.webmanifest
  sw.js
  serve.sh
  data/
    countries.geojson
    us-states.geojson   # Natural Earth 50m admin-1 filtered to USA
    in-states.geojson   # Natural Earth 50m admin-1 filtered to India
    au-states.geojson   # Natural Earth 50m admin-1 filtered to Australia
  icons/          # plane-window app icon (PNG 48–512 + SVG)
  README.md
```

## Run on this box

Geolocation and the service worker need a real origin (not `file://`).

```bash
cd /workspace/travel-map
./serve.sh          # default port 8080
# or: ./serve.sh 3000
# or: python3 -m http.server 8080 --bind 0.0.0.0
```

Open **http://127.0.0.1:8080/** in a browser on the box.

## Open on a Samsung phone

This app is complete locally. To use it on the phone you’ll need a **publicly reachable URL** (or a tunnel) later — hosting/tunnel is a follow-up step.

When you have a URL (HTTPS preferred for install + location):

1. Open Chrome on the Samsung phone → visit the URL  
2. First-run screen → **Allow location** (or skip and add countries manually)  
3. **Install:** Chrome menu → **Install app** / **Add to Home screen**  
4. Launch from the home screen for a standalone fullscreen experience  

Until then you can develop/test with `./serve.sh` on the box, or use the box LAN IP if the phone is on the same Wi‑Fi (`http://<lan-ip>:8080/`). Note: some browsers require HTTPS for geolocation except on `localhost`.

## Location & reverse geocoding caveats

- Uses the browser **Geolocation API** (permission prompt).
- Reverse geocode: `https://api.bigdatacloud.net/data/reverse-geocode-client` (no API key).
- Throttled: at most one reverse-geocode every **5 minutes**, or when you move ~**25 km**, plus on demand when tapping the locate button / enabling tracking.
- Only marks a country after a confident `countryCode` + `name` result (skips ocean / empty).
- Be respectful of the free endpoint — don’t lower the throttle for production spam.
- The box may have no real GPS; the permission flow and code paths still work when a position is available.
- Nominatim is not used by default (needs a proper identifying User-Agent / usage policy); BigDataCloud client endpoint is simpler for a static front-end.

## Manual use without GPS

Use the search box (**Add country or state…**) — autocomplete includes countries, US states (California, Texas…), Indian states/UTs (Delhi, Maharashtra…), and Australian states/territories (New South Wales, Victoria…). Tap a result to mark visited. Tap any place on the map for details / remove. The United States, India, and Australia country sheets list how many of their states/territories you’ve visited.

## Data

Stored under `localStorage` key `mytravels.v1`. Export a JSON backup from **Settings** before clearing.

## Icons

Creative **airplane window** icon (sky, horizon, coast, island) generated as PNG at 48 / 128 / 180 / 192 / 512 (and 1024 master). Wired in `manifest.webmanifest`, favicon, and apple-touch-icon. Regenerate with:

```bash
/workspace/travel-map/.venv/bin/python icons/generate_icons.py
```

## Stack

- Vanilla HTML / CSS / JS (no build step)
- [Leaflet](https://leafletjs.com/) via CDN
- Natural Earth admin-0 countries GeoJSON
- Esri World Light Gray basemap tiles (no API key and no third-party place labels, so visited labels remain English). Country highlights work from cached GeoJSON once loaded.
