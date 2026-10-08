/**
 * My Travels — interactive world map PWA
 * Leaflet + Natural Earth countries / US, Indian & Australian states + BigDataCloud reverse geocode
 */
(function () {
  "use strict";

  // —— Config ——
  const STORAGE_KEY = "mytravels.v1";
  const GEOJSON_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
  const GEOJSON_FALLBACK =
    "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";
  const TOPOJSON_CDN =
    "https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js";
  const US_STATES_GEOJSON_URL = "./data/us-states.geojson";
  const IN_STATES_GEOJSON_URL = "./data/in-states.geojson";
  const AU_STATES_GEOJSON_URL = "./data/au-states.geojson";
  const AE_EMIRATES_GEOJSON_URL = "./data/ae-emirates.geojson";
  // Esri's unlabeled light-gray canvas keeps third-party place names (including
  // localized OSM labels) off the map; visited places are labeled by the app in English.
  const TILE_URL =
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
  console.log("MyTravels v18 india-uae-canary-labels");
  const TILE_ATTR =
    'Tiles &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, (c) <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, and the GIS user community';
  const REVERSE_URL =
    "https://api.bigdatacloud.net/data/reverse-geocode-client";
  const GEO_MIN_INTERVAL_MS = 5 * 60 * 1000;
  const GEO_WATCH_MOVE_M = 25000;
  const TOTAL_COUNTRIES_APPROX = 195;
  const TOTAL_US_STATES = 51; // 50 states + DC
  const TOTAL_IN_STATES = 36; // 28 states + 8 UTs (NE admin-1)
  const TOTAL_AU_STATES = 8; // 6 states + 2 mainland territories
  const MIN_VISIT_YEAR = 1950;
  const GOLD_FILL = "#c99732";
  const GOLD_STROKE = "#8c641f";
  const GOLD_HIGHLIGHT = "#f0c35f";
  // Visited Indian states use canary yellow (distinct from country gold).
  const CANARY_FILL = "#FFF44F";
  const CANARY_STROKE = "#C4B000";
  const CANARY_HIGHLIGHT = "#FFE566";
  const USA_ISO3 = "USA";
  const USA_ISO2 = "US";
  const INDIA_ISO3 = "IND";
  const INDIA_ISO2 = "IN";
  // Natural Earth draws the India–Pakistan (and India–China) northern claim
  // belt as separate Jammu and Kashmir disputed/indeterminate polygons
  // (Azad Kashmir, Gilgit-Baltistan, Siachen, Aksai Chin, Shaksgam, …).
  // Those overlays live in countries.geojson with KAS* ids. When India is
  // visited, paint every one gold. Pakistan/China keep their own undisputed
  // polygons and remain independently searchable.
  const INDIA_CLAIMED_KASHMIR_ID = "KAS";
  const INDIA_CLAIMED_KASHMIR_ID_RE = /^KAS(?:-|$)/i;
  const INDIA_CLAIMED_KASHMIR_GROUP = "Jammu and Kashmir";
  const INDIA_CLAIMED_KASHMIR_TERMS =
    /kashmir|jammu|ladakh|aksai\s*chin|siachen|gilgit|shaksam|shaksgam|azad\s*kashmir|karakoram/i;
  const AUSTRALIA_ISO3 = "AUS";
  const AUSTRALIA_ISO2 = "AU";
  const UAE_ISO3 = "ARE";
  const UAE_ISO2 = "AE";
  /** Prefixed admin-1 ids: US-CA, IN-DL, AU-NSW, AE-DU, … */
  const STATE_ID_RE = /^(US|IN|AU|AE)-[A-Z]{2,3}$/;
  // Keep the overview legible: countries label the world view, while state
  // labels take over when zoomed in. A handful of states stays visible at any zoom.
  const STATE_LABEL_MIN_ZOOM = 4.75;
  const STATE_LABEL_ALWAYS_MAX = 4;
  // Show every Indian state/UT name once India is in view at a readable zoom.
  const IN_STATE_LABEL_MIN_ZOOM = 4.25;
  const INDIA_VIEW_BOUNDS = [
    [6.0, 67.5],
    [37.6, 97.5],
  ];
  // UAE emirates are small — label once the Gulf is in view at mid zoom.
  const AE_EMIRATE_LABEL_MIN_ZOOM = 5.5;
  const UAE_VIEW_BOUNDS = [
    [22.5, 51.4],
    [26.5, 56.6],
  ];
  // Color rule: gold = countries + US/AU states; canary = Indian states + UAE emirates.
  const TOTAL_AE_EMIRATES = 7;

  const NAME_FIXES = {
    "United States of America": "United States",
    "Czechia": "Czech Republic",
    "Bosnia and Herz.": "Bosnia and Herzegovina",
    "S. Sudan": "South Sudan",
    "Dem. Rep. Congo": "Democratic Republic of the Congo",
    "Central African Rep.": "Central African Republic",
    "Eq. Guinea": "Equatorial Guinea",
    "Dominican Rep.": "Dominican Republic",
    "Solomon Is.": "Solomon Islands",
    "W. Sahara": "Western Sahara",
    "Falkland Is.": "Falkland Islands",
    "Fr. S. Antarctic Lands": "French Southern Territories",
    "Côte d'Ivoire": "Ivory Coast",
    "Ivory Coast": "Ivory Coast",
    "eSwatini": "Eswatini",
    "N. Cyprus": "Northern Cyprus",
    "Turkish Republic of Northern Cyprus": "Northern Cyprus",
    "Vatican City": "Vatican",
    "Federated States of Micronesia": "Micronesia",
    "East Timor": "Timor-Leste",
    "The Gambia": "Gambia",
    "The Bahamas": "Bahamas",
    "People's Republic of China": "China",
    "Republic of the Congo": "Congo",
    "Macau": "Macao",
    "French Southern and Antarctic Lands": "French Southern Territories",
    "Australian Indian Ocean Territories": "Indian Ocean Territories",
  };

  // Natural Earth country files include localized NAME_* fields. Always build
  // the user-facing name from the English field first, then apply the small
  // set of concise display-name fixes above. Admin-1 files use `name`, but
  // accept NAME_EN as well so alternate Natural Earth revisions stay English.
  const ENGLISH_NAME_KEYS = [
    "NAME_EN",
    "name_en",
    "NAME_ENGLISH",
    "name_english",
    "nameEnglish",
  ];

  function firstName(properties, keys) {
    for (const key of keys) {
      const value = properties && properties[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function canonicalDisplayName(value) {
    const name = typeof value === "string" ? value.trim() : "";
    return name ? NAME_FIXES[name] || name : "Unknown";
  }

  function preferredEnglishName(properties) {
    return firstName(properties, [
      ...ENGLISH_NAME_KEYS,
      "NAME",
      "name",
      "ADMIN",
      "NAME_LONG",
      "admin",
    ]);
  }

  const ALIASES = {
    usa: "United States",
    us: "United States",
    america: "United States",
    "united states of america": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    uk: "United Kingdom",
    britain: "United Kingdom",
    "great britain": "United Kingdom",
    england: "United Kingdom",
    scotland: "United Kingdom",
    wales: "United Kingdom",
    uae: "United Arab Emirates",
    emirates: "United Arab Emirates",
    "ivory coast": "Ivory Coast",
    "cote divoire": "Ivory Coast",
    "cote d'ivoire": "Ivory Coast",
    "côte d'ivoire": "Ivory Coast",
    russia: "Russia",
    "russian federation": "Russia",
    "south korea": "South Korea",
    korea: "South Korea",
    "republic of korea": "South Korea",
    "north korea": "North Korea",
    dprk: "North Korea",
    "czech republic": "Czech Republic",
    czechia: "Czech Republic",
    holland: "Netherlands",
    "the netherlands": "Netherlands",
    "east timor": "Timor-Leste",
    "timor leste": "Timor-Leste",
    burma: "Myanmar",
    swaziland: "Eswatini",
    eswatini: "Eswatini",
    "viet nam": "Vietnam",
    "syrian arab republic": "Syria",
    laos: "Laos",
    "lao pdr": "Laos",
    "brunei darussalam": "Brunei",
    "bolivia (plurinational state of)": "Bolivia",
    "iran (islamic republic of)": "Iran",
    "venezuela (bolivarian republic of)": "Venezuela",
    "tanzania, united republic of": "Tanzania",
    "united republic of tanzania": "Tanzania",
    "dr congo": "Democratic Republic of the Congo",
    drc: "Democratic Republic of the Congo",
    "congo-kinshasa": "Democratic Republic of the Congo",
    "congo-brazzaville": "Congo",
    "republic of the congo": "Congo",
    "cabo verde": "Cape Verde",
    vatican: "Vatican",
    "holy see": "Vatican",
    palestine: "Palestine",
    "state of palestine": "Palestine",
    turkey: "Turkey",
    turkiye: "Turkey",
    "türkiye": "Turkey",
  };

  function canonicalExternalName(value) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "Unknown";
    return (NAME_FIXES[raw] || ALIASES[raw.toLowerCase()] || raw).trim();
  }

  // Admin-1 aliases (postal / nicknames → display name). Applied only to matching state features.
  const STATE_ALIASES = {
    // US
    ca: "California",
    calif: "California",
    california: "California",
    tx: "Texas",
    texas: "Texas",
    ny: "New York",
    "new york": "New York",
    fl: "Florida",
    florida: "Florida",
    dc: "District of Columbia",
    "washington dc": "District of Columbia",
    "washington d.c.": "District of Columbia",
    "d.c.": "District of Columbia",
    // India
    dl: "Delhi",
    delhi: "Delhi",
    "new delhi": "Delhi",
    "nct of delhi": "Delhi",
    mh: "Maharashtra",
    maharashtra: "Maharashtra",
    ka: "Karnataka",
    karnataka: "Karnataka",
    tn: "Tamil Nadu",
    "tamil nadu": "Tamil Nadu",
    "tamilnadu": "Tamil Nadu",
    up: "Uttar Pradesh",
    "uttar pradesh": "Uttar Pradesh",
    wb: "West Bengal",
    "west bengal": "West Bengal",
    gj: "Gujarat",
    gujarat: "Gujarat",
    rj: "Rajasthan",
    rajasthan: "Rajasthan",
    kl: "Kerala",
    kerala: "Kerala",
    tg: "Telangana",
    telangana: "Telangana",
    ap: "Andhra Pradesh",
    "andhra pradesh": "Andhra Pradesh",
    "andhra": "Andhra Pradesh",
    or: "Odisha",
    odisha: "Odisha",
    orissa: "Odisha",
    jk: "Jammu and Kashmir",
    "jammu and kashmir": "Jammu and Kashmir",
    "jammu & kashmir": "Jammu and Kashmir",
    la: "Ladakh",
    ladakh: "Ladakh",
    py: "Puducherry",
    puducherry: "Puducherry",
    pondicherry: "Puducherry",
    goa: "Goa",
    ga: "Goa",
    // Australia
    nsw: "New South Wales",
    "new south wales": "New South Wales",
    vic: "Victoria",
    victoria: "Victoria",
    qld: "Queensland",
    queensland: "Queensland",
    sa: "South Australia",
    "south australia": "South Australia",
    wa: "Western Australia",
    "western australia": "Western Australia",
    tas: "Tasmania",
    tasmania: "Tasmania",
    nt: "Northern Territory",
    "northern territory": "Northern Territory",
    act: "Australian Capital Territory",
    "australian capital territory": "Australian Capital Territory",
    // UAE emirates
    dubai: "Dubai",
    du: "Dubai",
    "abu dhabi": "Abu Dhabi",
    abudhabi: "Abu Dhabi",
    sharjah: "Sharjah",
    sh: "Sharjah",
    ajman: "Ajman",
    aj: "Ajman",
    "umm al quwain": "Umm Al Quwain",
    "umm al quwayn": "Umm Al Quwain",
    "um al quwain": "Umm Al Quwain",
    uq: "Umm Al Quwain",
    "ras al khaimah": "Ras Al Khaimah",
    "ras al khaymah": "Ras Al Khaimah",
    "ras al-khaimah": "Ras Al Khaimah",
    rk: "Ras Al Khaimah",
    fujairah: "Fujairah",
    fujayrah: "Fujairah",
    fu: "Fujairah",
  };


  // Natural Earth puts metropolitan France and its overseas departments in
  // one MultiPolygon. Keep the overseas pieces as separate visitable places.
  const FRENCH_OVERSEAS_PARTS = [
    { id: "GUF", iso2: "GF", name: "French Guiana", test: (b) => b.maxX < -50 && b.minY > -1 && b.maxY < 10 },
    { id: "GLP", iso2: "GP", name: "Guadeloupe", test: (b) => b.minX < -59 && b.maxX > -63 && b.minY >= 15.5 && b.maxY < 18 },
    { id: "MTQ", iso2: "MQ", name: "Martinique", test: (b) => b.minX < -59 && b.maxX > -63 && b.minY >= 13 && b.maxY < 15.5 },
    { id: "MYT", iso2: "YT", name: "Mayotte", test: (b) => b.minX > 43 && b.maxX < 47 && b.minY > -14 && b.maxY < -11 },
    { id: "REU", iso2: "RE", name: "Réunion", test: (b) => b.minX > 53 && b.maxX < 57 && b.minY > -23 && b.maxY < -19 },
  ];

  // —— State ——
  /** @type {{ version: number, locationEnabled: boolean, visited: Record<string, { name: string, firstVisit: string, lastVisit: string, source: string, year?: number }> }} */
  let store = loadStore();
  /** @type {L.Map|null} */
  let map = null;
  /** @type {L.GeoJSON|null} */
  let countryLayer = null;
  /** @type {L.GeoJSON|null} */
  let stateLayer = null;
  /** @type {GeoJSON.FeatureCollection|null} */
  let countriesFC = null;
  /** @type {GeoJSON.FeatureCollection|null} */
  let statesFC = null;
  /** @type {Map<string, GeoJSON.Feature>} id → feature */
  const featureById = new Map();
  /** @type {Map<string, string[]>} lowercase name → ids (may be country + state, e.g. Georgia) */
  const nameIndex = new Map();
  /** @type {L.Marker|null} */
  let userMarker = null;
  let lastGeocodeAt = 0;
  let lastGeocodePos = null;
  let geoWatchId = null;
  let toastTimer = null;
  let selectedPlaceLayer = null;
  /** @type {L.LayerGroup|null} */
  let visitLabelLayer = null;
  /** @type {L.LayerGroup|null} */
  let indiaStateLabelLayer = null;
  /** @type {L.LayerGroup|null} */
  let aeEmirateLabelLayer = null;
  /** @type {"loading"|"ready"|"failed"} */
  let countriesLoadState = "loading";
  /** @type {"loading"|"ready"|"failed"|"skipped"} */
  let statesLoadState = "loading";

  // —— DOM ——
  const $ = (id) => document.getElementById(id);
  const el = {
    count: $("country-count"),
    locToggle: $("loc-toggle"),
    locDot: $("loc-dot"),
    locLabel: $("loc-label"),
    search: $("country-search"),
    searchClear: $("search-clear"),
    btnAdd: $("btn-add-country"),
    autocomplete: $("autocomplete"),
    btnStats: $("btn-stats"),
    btnMenu: $("btn-menu"),
    btnLocate: $("btn-locate"),
    sheet: $("country-sheet"),
    sheetBackdrop: $("sheet-backdrop"),
    sheetTitle: $("sheet-title"),
    sheetSub: $("sheet-sub"),
    sheetMeta: $("sheet-meta"),
    sheetYear: $("sheet-year"),
    sheetYearInput: $("sheet-year-input"),
    sheetStates: $("sheet-states"),
    sheetStatesTitle: $("sheet-states-title"),
    sheetStatesList: $("sheet-states-list"),
    sheetRemove: $("sheet-remove"),
    sheetClose: $("sheet-close"),
    statsPanel: $("stats-panel"),
    statsClose: $("stats-close"),
    statCount: $("stat-count"),
    statUsStates: $("stat-us-states"),
    statInStates: $("stat-in-states"),
    statAuStates: $("stat-au-states"),
    statAeEmirates: $("stat-ae-emirates"),
    statPct: $("stat-pct"),
    visitedList: $("visited-list"),
    visitedEmpty: $("visited-empty"),
    menuPanel: $("menu-panel"),
    menuClose: $("menu-close"),
    btnExport: $("btn-export"),
    btnExportInStates: $("btn-export-in-states"),
    btnExportInStatesCsv: $("btn-export-in-states-csv"),
    btnImport: $("btn-import"),
    importFile: $("import-file"),
    btnClear: $("btn-clear"),
    toast: $("toast"),
  };

  let activePlaceId = null;

  // —— Persistence ——
  function defaultStore() {
    return {
      version: 1,
      locationEnabled: false,
      visited: {},
    };
  }

  function maxVisitYear() {
    return new Date().getFullYear() + 1;
  }

  function normalizeVisitYear(value) {
    if (value === "" || value == null) return undefined;
    const year = Number(value);
    if (!Number.isInteger(year) || year < MIN_VISIT_YEAR || year > maxVisitYear()) {
      return undefined;
    }
    return year;
  }

  function normalizeVisited(rawVisited) {
    if (!rawVisited || typeof rawVisited !== "object") return {};
    const visited = {};
    for (const [id, rawVisit] of Object.entries(rawVisited)) {
      if (!rawVisit || typeof rawVisit !== "object") continue;
      const visit = { ...rawVisit };
      const year = normalizeVisitYear(visit.year);
      if (year === undefined) delete visit.year;
      else visit.year = year;
      visited[id] = visit;
    }
    return visited;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaultStore();
      return {
        ...defaultStore(),
        ...parsed,
        visited: normalizeVisited(parsed.visited),
      };
    } catch {
      return defaultStore();
    }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function visitedDisplayName(id, visit) {
    const feature = featureById.get(id);
    return feature
      ? featureName(feature)
      : canonicalDisplayName(visit && visit.name ? visit.name : id);
  }

  function normalizeVisitedNames() {
    let changed = false;
    for (const [id, visit] of Object.entries(store.visited)) {
      const name = visitedDisplayName(id, visit);
      if (visit.name !== name) {
        visit.name = name;
        changed = true;
      }
    }
    if (changed) saveStore();
    if (el.statsPanel && !el.statsPanel.hidden) openStats();
  }

  // —— Toast ——
  function showToast(msg, ms = 2600) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    requestAnimationFrame(() => el.toast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove("show");
      setTimeout(() => {
        el.toast.hidden = true;
      }, 280);
    }, ms);
  }

  // —— Place helpers ——
  function isStateId(id) {
    return typeof id === "string" && STATE_ID_RE.test(id);
  }

  function isUsStateId(id) {
    return typeof id === "string" && id.startsWith("US-") && STATE_ID_RE.test(id);
  }

  function isInStateId(id) {
    return typeof id === "string" && id.startsWith("IN-") && STATE_ID_RE.test(id);
  }

  function isAuStateId(id) {
    return typeof id === "string" && id.startsWith("AU-") && STATE_ID_RE.test(id);
  }

  function isAeEmirateId(id) {
    return typeof id === "string" && id.startsWith("AE-") && STATE_ID_RE.test(id);
  }

  /** Sub-national units that use canary yellow (not gold). */
  function usesCanaryHighlight(id) {
    return isInStateId(id) || isAeEmirateId(id);
  }

  function stateCountryCode(id) {
    if (!isStateId(id)) return null;
    return id.slice(0, 2); // US | IN | AU | AE
  }

  function featureKind(f) {
    return (f && f.properties && f.properties._kind) || (isStateId(featureId(f)) ? "state" : "country");
  }

  function stateRegionLabel(id) {
    const cc = stateCountryCode(id);
    if (cc === "US") return "US state";
    if (cc === "IN") return "Indian state";
    if (cc === "AU") return "Australian state/territory";
    if (cc === "AE") return "UAE emirate";
    return "State";
  }

  function featureId(f) {
    const p = f.properties || {};
    if (p._id) return String(p._id);
    if (p.iso_3166_2) return String(p.iso_3166_2);
    const candidates = [
      p.ADM0_A3,
      p.ISO_A3,
      p["ISO3166-1-Alpha-3"],
      p.iso_a3,
      p.ISO_A2,
      p["ISO3166-1-Alpha-2"],
      p.iso_a2,
      p.id,
      f.id,
      p.name,
      p.NAME,
      p.ADMIN,
    ];
    for (const c of candidates) {
      if (c == null || c === "") continue;
      const s = String(c);
      if (s === "-99" || s === "undefined" || s === "null") continue;
      return s;
    }
    return "unknown";
  }

  function featureName(f) {
    const p = f.properties || {};
    // _name is set during indexing and is already canonical. The fallback
    // keeps dynamically loaded Natural Earth revisions English too.
    return p._name || canonicalDisplayName(preferredEnglishName(p));
  }

  function isUsaCountryId(id) {
    if (!id) return false;
    if (id === USA_ISO3 || id === USA_ISO2) return true;
    const f = featureById.get(id);
    if (!f || featureKind(f) !== "country") return false;
    return featureName(f) === "United States";
  }

  function isIndiaCountryId(id) {
    if (!id) return false;
    if (id === INDIA_ISO3 || id === INDIA_ISO2) return true;
    const f = featureById.get(id);
    if (!f || featureKind(f) !== "country") return false;
    return featureName(f) === "India";
  }

  function isAustraliaCountryId(id) {
    if (!id) return false;
    if (id === AUSTRALIA_ISO3 || id === AUSTRALIA_ISO2) return true;
    const f = featureById.get(id);
    if (!f || featureKind(f) !== "country") return false;
    return featureName(f) === "Australia";
  }

  function isUaeCountryId(id) {
    if (!id) return false;
    if (id === UAE_ISO3 || id === UAE_ISO2) return true;
    const f = featureById.get(id);
    if (!f || featureKind(f) !== "country") return false;
    const name = featureName(f);
    return name === "United Arab Emirates" || name === "UAE";
  }

  function isIndiaClaimedKashmirFeature(f) {
    const p = (f && f.properties) || {};
    if (String(p._territorialPreference || "") === "india-kashmir") {
      return true;
    }
    const adm0 = String(p.ADM0_A3 || p._id || "");
    if (adm0 === INDIA_CLAIMED_KASHMIR_ID || INDIA_CLAIMED_KASHMIR_ID_RE.test(adm0)) {
      return true;
    }
    if (String(p.BRK_GROUP || "") === INDIA_CLAIMED_KASHMIR_GROUP) {
      return true;
    }
    // Never treat the sovereign India / Pakistan / China country polygons
    // themselves as Kashmir overlays — only the disputed belt features.
    if (adm0 === INDIA_ISO3 || adm0 === "PAK" || adm0 === "CHN") {
      return false;
    }
    const fields = [
      p.ADMIN,
      p.NAME,
      p.NAME_EN,
      p.BRK_NAME,
      p.BRK_GROUP,
      p.GEOUNIT,
      p.SUBUNIT,
      p.SOVEREIGNT,
      p.NAME_SORT,
      p.NOTE_BRK,
    ];
    const namedKashmir = fields.some((value) =>
      INDIA_CLAIMED_KASHMIR_TERMS.test(String(value || ""))
    );
    // Alternate Natural Earth revisions expose the claim matrix even when
    // the feature has a different local id (for example, an Aksai Chin piece).
    const indiaClaim = String(p.ADM0_A3_IN || "") === INDIA_ISO3;
    const pakistanClaim = String(p.ADM0_A3_PK || "") === "PAK";
    const chinaClaim = String(p.ADM0_A3_CN || "") === "CHN";
    const looksDisputed =
      /disputed|indeterminate|claim/i.test(String(p.TYPE || "")) ||
      /claim|disputed|indetermin/i.test(String(p.featurecla || ""));
    return namedKashmir && (looksDisputed || (indiaClaim && (pakistanClaim || chinaClaim)));
  }

  function indiaIsVisited() {
    return Object.keys(store.visited).some((id) => isIndiaCountryId(id));
  }

  function visitedCountryEntries() {
    return Object.entries(store.visited).filter(([id]) => !isStateId(id));
  }

  function visitedUsStateEntries() {
    return Object.entries(store.visited).filter(([id]) => isUsStateId(id));
  }

  function visitedInStateEntries() {
    return Object.entries(store.visited).filter(([id]) => isInStateId(id));
  }

  function visitedAuStateEntries() {
    return Object.entries(store.visited).filter(([id]) => isAuStateId(id));
  }

  function visitedAeEmirateEntries() {
    return Object.entries(store.visited).filter(([id]) => isAeEmirateId(id));
  }

  function visitedStateEntries() {
    return Object.entries(store.visited).filter(([id]) => isStateId(id));
  }

  function visitedCountryCount() {
    return visitedCountryEntries().length;
  }

  function visitedUsStateCount() {
    return visitedUsStateEntries().length;
  }

  function visitedInStateCount() {
    return visitedInStateEntries().length;
  }

  function visitedAuStateCount() {
    return visitedAuStateEntries().length;
  }

  function visitedAeEmirateCount() {
    return visitedAeEmirateEntries().length;
  }

  function visitedStateCount() {
    return visitedStateEntries().length;
  }

  function formatCountPill(countries, usStates, inStates, auStates, aeEmirates) {
    const parts = [
      countries === 1 ? "1 country" : `${countries} countries`,
    ];
    if (usStates > 0) {
      parts.push(usStates === 1 ? "1 US state" : `${usStates} US states`);
    }
    if (inStates > 0) {
      parts.push(
        inStates === 1 ? "1 Indian state" : `${inStates} Indian states`
      );
    }
    if (auStates > 0) {
      parts.push(
        auStates === 1 ? "1 Australian state" : `${auStates} Australian states`
      );
    }
    if (aeEmirates > 0) {
      parts.push(
        aeEmirates === 1 ? "1 UAE emirate" : `${aeEmirates} UAE emirates`
      );
    }
    return parts.join(" · ");
  }

  function updateCountUI() {
    el.count.textContent = formatCountPill(
      visitedCountryCount(),
      visitedUsStateCount(),
      visitedInStateCount(),
      visitedAuStateCount(),
      visitedAeEmirateCount()
    );
  }

  function styleCountryFeature(f) {
    const id = featureId(f);
    // Keep the disputed feature independently searchable/clickable, but fold
    // its rendering into India's gold highlight when India is visited.
    const visited =
      !!store.visited[id] ||
      (isIndiaClaimedKashmirFeature(f) && indiaIsVisited());
    return {
      fillColor: visited ? GOLD_FILL : "rgba(148, 163, 184, 0.30)",
      fillOpacity: visited ? 0.78 : 0.35,
      color: visited ? GOLD_STROKE : "rgba(71, 85, 105, 0.45)",
      weight: visited ? 1.2 : 0.6,
      opacity: 1,
    };
  }

  function styleStateFeature(f) {
    const id = featureId(f);
    const visited = !!store.visited[id];
    const zoom = map ? map.getZoom() : 2;
    const canary = usesCanaryHighlight(id);
    // Always subtle borders; a bit stronger when zoomed in / for canary outlines
    const borderWeight = visited
      ? canary
        ? 1.35
        : 1.15
      : zoom >= 4
        ? canary
          ? 0.95
          : 0.85
        : canary
          ? 0.55
          : 0.45;
    if (visited && canary) {
      // Canary yellow for Indian states + UAE emirates (distinct from country gold).
      return {
        fillColor: CANARY_FILL,
        fillOpacity: 0.9,
        color: CANARY_STROKE,
        weight: borderWeight,
        opacity: 1,
      };
    }
    return {
      fillColor: visited ? GOLD_FILL : "#dce3eb",
      fillOpacity: visited ? 0.82 : 0,
      color: visited ? GOLD_STROKE : "rgba(71, 85, 105, 0.42)",
      weight: borderWeight,
      opacity: 1,
    };
  }

  function refreshLayerStyles() {
    if (countryLayer) countryLayer.setStyle((f) => styleCountryFeature(f));
    if (stateLayer) stateLayer.setStyle((f) => styleStateFeature(f));
    refreshVisitLabels();
    refreshIndiaStateLabels();
    refreshAeEmirateLabels();
    updateCountUI();
  }

  function markVisited(id, name, source) {
    const now = new Date().toISOString();
    const existing = store.visited[id];
    if (existing) {
      existing.lastVisit = now;
      if (name) existing.name = name;
    } else {
      store.visited[id] = {
        name: name || id,
        firstVisit: now,
        lastVisit: now,
        year: new Date().getFullYear(),
        source: source || "manual",
      };
      // Geo path shows its own toast; avoid double notifications
      if (source !== "geo") showToast(`Added ${name || id}`);
    }
    saveStore();
    refreshLayerStyles();
  }

  function unmarkVisited(id) {
    const name = visitedDisplayName(id, store.visited[id]);
    delete store.visited[id];
    saveStore();
    refreshLayerStyles();
    showToast(name ? `Removed ${name}` : "Removed");
  }

  function findFeatureByName(query, { preferKind } = {}) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const pick = (ids) => {
      if (!ids || !ids.length) return null;
      if (preferKind) {
        const preferred = ids.find((id) => {
          const f = featureById.get(id);
          return f && featureKind(f) === preferKind;
        });
        if (preferred) return featureById.get(preferred);
      }
      return featureById.get(ids[0]);
    };
    if (nameIndex.has(q)) return pick(nameIndex.get(q));
    for (const [n, ids] of nameIndex) {
      if (n.startsWith(q)) {
        const f = pick(ids);
        if (f) return f;
      }
    }
    for (const [n, ids] of nameIndex) {
      if (n.includes(q)) {
        const f = pick(ids);
        if (f) return f;
      }
    }
    return null;
  }

  function searchPlaces(query, limit = 8) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    /** @type {Map<string, { id: string, name: string, kind: string, score: number, visited: boolean }>} */
    const best = new Map();
    for (const [n, ids] of nameIndex) {
      if (!n.includes(q)) continue;
      let score = 0;
      if (n === q) score = 100;
      else if (n.startsWith(q)) score = 80;
      else score = 40 - Math.min(n.indexOf(q), 20);
      if (n.length <= 3 && n === q) score = 110;
      for (const id of ids) {
        const f = featureById.get(id);
        if (!f) continue;
        const name = featureName(f);
        const kind = featureKind(f);
        // Prefer exact display-name matches; boost US postal codes over ISO2 collisions (ca→CA vs Canada)
        let s = score;
        if (kind === "state" && name.toLowerCase() === q) s = Math.max(s, 105);
        if (kind === "country" && name.toLowerCase() === q) s = Math.max(s, 108);
        if (kind === "state" && n === q && n.length === 2) s = Math.max(s, 120);
        const prev = best.get(id);
        if (!prev || s > prev.score) {
          best.set(id, {
            id,
            name,
            kind,
            score: s,
            visited: !!store.visited[id],
          });
        }
      }
    }
    return [...best.values()]
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.kind.localeCompare(b.kind) ||
          a.name.localeCompare(b.name)
      )
      .slice(0, limit);
  }

  // —— Map ——
  function initMap() {
    map = L.map("map", {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
      minZoom: 1.5,
      maxZoom: 10,
      maxBounds: [
        [-85, -180],
        [85, 180],
      ],
      maxBoundsViscosity: 0.8,
    }).setView([20, 10], 2);

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 18,
      maxNativeZoom: 16,
      opacity: 1,
    }).addTo(map);

    map.zoomControl.setPosition("bottomleft");
    visitLabelLayer = L.layerGroup().addTo(map);
    indiaStateLabelLayer = L.layerGroup().addTo(map);
    aeEmirateLabelLayer = L.layerGroup().addTo(map);

    map.on("zoomend moveend", () => {
      if (stateLayer) stateLayer.setStyle((f) => styleStateFeature(f));
      refreshVisitLabels();
      refreshIndiaStateLabels();
      refreshAeEmirateLabels();
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function loadCountries() {
    const sources = [
      "./data/countries.geojson",
      "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson",
      GEOJSON_FALLBACK,
    ];
    let lastErr;
    for (const url of sources) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const geo = await res.json();
        if (!geo || !geo.features || !geo.features.length) {
          throw new Error("empty FeatureCollection");
        }
        normalizeCountryFeatures(geo);
        console.info("Countries loaded from", url, geo.features.length);
        return geo;
      } catch (e) {
        lastErr = e;
        console.warn("Country source failed:", url, e);
      }
    }
    try {
      await loadScript(TOPOJSON_CDN);
      const res = await fetch(GEOJSON_URL);
      if (!res.ok) throw new Error("topo fetch failed");
      const topo = await res.json();
      const objectName = topo.objects.countries
        ? "countries"
        : Object.keys(topo.objects)[0];
      const geo = window.topojson.feature(topo, topo.objects[objectName]);
      normalizeCountryFeatures(geo);
      return geo;
    } catch (e) {
      throw lastErr || e;
    }
  }

  async function loadAdmin1File(url, label) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(label + " HTTP " + res.status);
    const geo = await res.json();
    if (!geo || !geo.features || !geo.features.length) {
      throw new Error("empty " + label + " FeatureCollection");
    }
    normalizeStateFeatures(geo);
    console.info(label + " loaded", geo.features.length);
    return geo;
  }

  async function loadAllStates() {
    const results = await Promise.allSettled([
      loadAdmin1File(US_STATES_GEOJSON_URL, "US states"),
      loadAdmin1File(IN_STATES_GEOJSON_URL, "Indian states"),
      loadAdmin1File(AU_STATES_GEOJSON_URL, "Australian states"),
      loadAdmin1File(AE_EMIRATES_GEOJSON_URL, "UAE emirates"),
    ]);
    const features = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        features.push(...r.value.features);
      } else {
        console.warn("Admin-1 load failed", r.reason);
      }
    }
    if (!features.length) throw new Error("no admin-1 features loaded");
    return { type: "FeatureCollection", features };
  }

  function polygonBounds(polygon) {
    const points = [];
    for (const ring of polygon || []) {
      for (const point of ring || []) {
        if (Array.isArray(point) && point.length >= 2) points.push(point);
      }
    }
    if (!points.length) return null;
    return {
      minX: Math.min(...points.map((p) => p[0])),
      maxX: Math.max(...points.map((p) => p[0])),
      minY: Math.min(...points.map((p) => p[1])),
      maxY: Math.max(...points.map((p) => p[1])),
    };
  }

  function isMetropolitanFranceBounds(b) {
    return b && b.minX > -10 && b.maxX < 15 && b.minY > 35 && b.maxY < 55;
  }

  function frenchTerritoryProperties(base, part) {
    return {
      ...base,
      // Do not retain ADMIN=France/NAME=France on a territory: those values
      // would put the territory back into the France search index.
      ADMIN: part.name,
      GEOUNIT: part.name,
      SUBUNIT: part.name,
      NAME: part.name,
      NAME_LONG: part.name,
      NAME_EN: part.name,
      GU_A3: part.id,
      SU_A3: part.id,
      ADM0_A3: part.id,
      ISO_A3: part.id,
      ISO_A2: part.iso2,
      SOVEREIGNT: "France",
      TYPE: "Overseas department",
    };
  }

  function splitFranceOverseas(geo) {
    const result = [];
    for (const feature of geo.features) {
      const p = feature.properties || {};
      const isFrance = String(p.ADMIN || "").trim().toLowerCase() === "france";
      const geometry = feature.geometry;
      if (!isFrance || !geometry || geometry.type !== "MultiPolygon") {
        result.push(feature);
        continue;
      }

      const metro = [];
      const overseas = new Map();
      const unknown = [];
      for (const polygon of geometry.coordinates || []) {
        const bounds = polygonBounds(polygon);
        if (isMetropolitanFranceBounds(bounds)) {
          metro.push(polygon);
          continue;
        }
        const part = FRENCH_OVERSEAS_PARTS.find((candidate) =>
          candidate.test(bounds)
        );
        if (part) {
          const polygons = overseas.get(part.id) || [];
          polygons.push(polygon);
          overseas.set(part.id, polygons);
        } else {
          unknown.push(polygon);
        }
      }

      // Only rewrite when we positively found metropolitan France plus an
      // overseas piece. This leaves alternate country datasets untouched.
      if (!metro.length || (!overseas.size && !unknown.length)) {
        result.push(feature);
        continue;
      }
      result.push({
        ...feature,
        geometry: { type: "MultiPolygon", coordinates: metro },
      });
      for (const part of FRENCH_OVERSEAS_PARTS) {
        const polygons = overseas.get(part.id);
        if (!polygons) continue;
        result.push({
          ...feature,
          properties: frenchTerritoryProperties(p, part),
          geometry: { type: "MultiPolygon", coordinates: polygons },
        });
      }
      unknown.forEach((polygon, index) => {
        const part = {
          id: `FRA-OVERSEAS-${index + 1}`,
          iso2: "",
          name: `French overseas territory ${index + 1}`,
        };
        result.push({
          ...feature,
          properties: frenchTerritoryProperties(p, part),
          geometry: { type: "MultiPolygon", coordinates: [polygon] },
        });
      });
    }
    geo.features = result;
  }

  function normalizeCountryFeatures(geo) {
    splitFranceOverseas(geo);
    for (const f of geo.features) {
      let p = f.properties || {};
      const admin = String(p.ADMIN || "").trim().toLowerCase();
      const geoUnitValue = String(p.GEOUNIT || "").trim();
      const subUnitValue = String(p.SUBUNIT || "").trim();
      const geoUnit =
        geoUnitValue && geoUnitValue.toLowerCase() !== "france"
          ? geoUnitValue
          : subUnitValue && subUnitValue.toLowerCase() !== "france"
            ? subUnitValue
            : "";
      // Some Natural Earth revisions use ADMIN=France for a separate
      // territory feature. Give it the GEOUNIT/SUBUNIT/GU_A3 identity rather than FRA.
      if (admin === "france" && geoUnit) {
        const territoryId =
          [p.GU_A3, p.SU_A3, p.ISO_A3, p.iso_a3].find(
            (c) => c && c !== "-99"
          ) || geoUnit;
        const territoryName = geoUnit || p.NAME_EN || p.NAME_LONG || "French territory";
        p = {
          ...p,
          ADMIN: territoryName,
          GEOUNIT: territoryName,
          SUBUNIT: territoryName,
          NAME: territoryName,
          NAME_LONG: territoryName,
          NAME_EN: territoryName,
          ADM0_A3: territoryId,
          GU_A3: territoryId,
          SU_A3: territoryId,
        };
        f.properties = p;
      }
      const rawNames = [
        ...ENGLISH_NAME_KEYS.map((key) => p[key]),
        p.NAME,
        p.name,
        p.ADMIN,
        p.NAME_LONG,
      ].filter((n) => typeof n === "string" && n.trim());
      const name = canonicalDisplayName(preferredEnglishName(p));
      const iso3 =
        [p.ADM0_A3, p.ISO_A3, p.iso_a3, p["ISO3166-1-Alpha-3"]].find(
          (c) => c && c !== "-99"
        ) || null;
      const iso2 =
        [p.ISO_A2, p.iso_a2, p["ISO3166-1-Alpha-2"]].find(
          (c) => c && c !== "-99"
        ) || null;
      f.properties = {
        ...p,
        name,
        _rawNames: rawNames,
        _kind: "country",
        _territorialPreference: isIndiaClaimedKashmirFeature({ properties: p })
          ? "india-kashmir"
          : undefined,
        ISO_A3: iso3 || undefined,
        ISO_A2: iso2 || undefined,
      };
    }
  }

  function normalizeStateFeatures(geo) {
    for (const f of geo.features) {
      const p = f.properties || {};
      let postal = String(p.postal || "")
        .trim()
        .toUpperCase();
      let iso = p.iso_3166_2 || null;
      if (!iso && postal && (p.adm0_a3 === "USA" || p.iso_a2 === "US")) {
        iso = `US-${postal}`;
      }
      if (!iso && postal && (p.adm0_a3 === "IND" || p.iso_a2 === "IN")) {
        iso = `IN-${postal}`;
      }
      if (!iso && postal && (p.adm0_a3 === AUSTRALIA_ISO3 || p.iso_a2 === AUSTRALIA_ISO2)) {
        iso = `AU-${postal}`;
      }
      if (!iso && postal && (p.adm0_a3 === UAE_ISO3 || p.iso_a2 === UAE_ISO2)) {
        iso = `AE-${postal}`;
      }
      if (!postal && iso && STATE_ID_RE.test(iso)) {
        postal = iso.slice(3);
      }
      const rawNames = [
        ...ENGLISH_NAME_KEYS.map((key) => p[key]),
        p.name,
        p.NAME,
        p.ADMIN,
      ].filter((n) => typeof n === "string" && n.trim());
      const name = canonicalDisplayName(preferredEnglishName(p));
      const countryHint =
        (iso && iso.startsWith("IN-") && "India") ||
        (iso && iso.startsWith("US-") && "USA") ||
        (iso && iso.startsWith("AU-") && "Australia") ||
        (iso && iso.startsWith("AE-") && "UAE") ||
        "";
      f.properties = {
        ...p,
        name,
        postal,
        iso_3166_2: iso,
        _id: iso,
        _kind: "state",
        _rawNames: [
          ...rawNames,
          name,
          postal,
          iso,
          countryHint ? `${name}, ${countryHint}` : null,
          countryHint === "India" ? `${name} state` : null,
          countryHint === "India" ? `${name} UT` : null,
          countryHint === "Australia" ? `${name} state` : null,
          countryHint === "UAE" ? `${name} emirate` : null,
          countryHint === "UAE" ? `${name}, United Arab Emirates` : null,
        ].filter(Boolean),
      };
    }
  }

  function indexName(key, id) {
    if (!key || typeof key !== "string") return;
    const k = key.trim().toLowerCase();
    if (!k) return;
    const arr = nameIndex.get(k) || [];
    if (!arr.includes(id)) arr.push(id);
    nameIndex.set(k, arr);
  }

  function indexFeature(f) {
    const id = featureId(f);
    const name = featureName(f);
    const kind = featureKind(f);
    f.properties = f.properties || {};
    f.properties._id = id;
    f.properties._name = name;
    f.properties._kind = kind;
    featureById.set(id, f);

    indexName(name, id);
    const raw = f.properties._rawNames || [];
    for (const rn of raw) {
      indexName(rn, id);
      if (NAME_FIXES[rn]) indexName(NAME_FIXES[rn], id);
    }
    if (kind === "country") {
      indexName(f.properties.ISO_A2, id);
      indexName(f.properties.ISO_A3, id);
    } else if (kind === "state") {
      indexName(f.properties.postal, id);
      indexName(f.properties.iso_3166_2, id);
      // Disambiguators (Georgia country vs US state; Goa vs etc.)
      if (isUsStateId(id)) {
        indexName(`${name} state`, id);
        indexName(`${name}, usa`, id);
        indexName(`${name}, us`, id);
      } else if (isInStateId(id)) {
        indexName(`${name} state`, id);
        indexName(`${name}, india`, id);
        indexName(`${name}, in`, id);
      } else if (isAuStateId(id)) {
        indexName(`${name} state`, id);
        indexName(`${name}, australia`, id);
        indexName(`${name}, au`, id);
      } else if (isAeEmirateId(id)) {
        indexName(`${name} emirate`, id);
        indexName(`${name}, uae`, id);
        indexName(`${name}, united arab emirates`, id);
        indexName(`${name}, ae`, id);
      }
    }
  }

  function buildCountryIndex(fc) {
    for (const f of fc.features) indexFeature(f);
    for (const [alias, display] of Object.entries(ALIASES)) {
      const ids = nameIndex.get(display.toLowerCase());
      if (!ids) continue;
      const countryId = ids.find((id) => {
        const feat = featureById.get(id);
        return feat && featureKind(feat) === "country";
      });
      if (countryId) indexName(alias, countryId);
    }
  }

  function buildStateIndex(fc) {
    for (const f of fc.features) indexFeature(f);
    for (const [alias, display] of Object.entries(STATE_ALIASES)) {
      const ids = nameIndex.get(display.toLowerCase());
      if (!ids) continue;
      const stateId = ids.find((id) => {
        const feat = featureById.get(id);
        return feat && featureKind(feat) === "state";
      });
      if (stateId) indexName(alias, stateId);
    }
  }

  function addCountryLayer(fc) {
    countriesFC = fc;
    buildCountryIndex(fc);
    normalizeVisitedNames();

    countryLayer = L.geoJSON(fc, {
      style: (f) => styleCountryFeature(f),
      onEachFeature: (feature, layer) => {
        layer.on({
          click: () => openPlaceSheet(featureId(feature)),
          mouseover: (e) => {
            const lay = e.target;
            lay.setStyle({
              weight: 2,
              color: GOLD_HIGHLIGHT,
              fillColor: GOLD_HIGHLIGHT,
              fillOpacity: 0.72,
            });
            lay.bringToFront();
          },
          mouseout: (e) => {
            if (e.target !== selectedPlaceLayer) {
              countryLayer.resetStyle(e.target);
            }
          },
        });
      },
    }).addTo(map);

    refreshVisitLabels();
    updateCountUI();
  }

  function addStateLayer(fc) {
    statesFC = fc;
    buildStateIndex(fc);
    normalizeVisitedNames();

    stateLayer = L.geoJSON(fc, {
      style: (f) => styleStateFeature(f),
      onEachFeature: (feature, layer) => {
        layer.on({
          click: (e) => {
            if (e.originalEvent) L.DomEvent.stopPropagation(e);
            openPlaceSheet(featureId(feature));
          },
          mouseover: (e) => {
            const lay = e.target;
            const canary = usesCanaryHighlight(featureId(feature));
            lay.setStyle({
              weight: 2,
              color: canary ? CANARY_HIGHLIGHT : GOLD_HIGHLIGHT,
              fillColor: canary ? CANARY_HIGHLIGHT : GOLD_HIGHLIGHT,
              fillOpacity: 0.75,
            });
            lay.bringToFront();
          },
          mouseout: (e) => {
            if (e.target !== selectedPlaceLayer) {
              stateLayer.resetStyle(e.target);
            }
          },
        });
      },
    }).addTo(map);

    // Keep states above countries for hit-testing
    stateLayer.bringToFront();
    refreshVisitLabels();
    refreshIndiaStateLabels();
    refreshAeEmirateLabels();
    updateCountUI();
  }

  function visitLabelCenter(id) {
    const layer = findPlaceLayer(id);
    if (!layer || typeof layer.getBounds !== "function") return null;
    try {
      const bounds = layer.getBounds();
      return bounds && bounds.isValid() ? bounds.getCenter() : null;
    } catch {
      return null;
    }
  }

  function indiaRegionInView() {
    if (!map) return false;
    if (map.getZoom() < IN_STATE_LABEL_MIN_ZOOM) return false;
    try {
      const view = map.getBounds();
      const india = L.latLngBounds(INDIA_VIEW_BOUNDS);
      return view.intersects(india);
    } catch {
      return false;
    }
  }

  function uaeRegionInView() {
    if (!map) return false;
    if (map.getZoom() < AE_EMIRATE_LABEL_MIN_ZOOM) return false;
    try {
      const view = map.getBounds();
      const uae = L.latLngBounds(UAE_VIEW_BOUNDS);
      return view.intersects(uae);
    } catch {
      return false;
    }
  }

  function indiaStateLabelText(name) {
    // Slightly shorter labels for a few long UT names so they fit at mid zoom.
    const SHORT = {
      "Dadra and Nagar Haveli and Daman and Diu": "DNH & DD",
      "Andaman and Nicobar": "Andaman & Nicobar",
    };
    return SHORT[name] || name;
  }

  function placeAdminLabel(layerGroup, id, labelText, visited, classBase) {
    const center = visitLabelCenter(id);
    if (!center) return;
    const className = visited ? `${classBase} ${classBase}--visited` : classBase;
    const icon = L.divIcon({
      className: "visited-label-icon",
      html: `<span class="${className}">${escapeHtml(labelText)}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    L.marker(center, {
      icon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 1100,
    }).addTo(layerGroup);
  }

  function refreshIndiaStateLabels() {
    if (!map || !indiaStateLabelLayer) return;
    indiaStateLabelLayer.clearLayers();
    if (!statesFC || !indiaRegionInView()) return;

    for (const feature of statesFC.features) {
      const id = featureId(feature);
      if (!isInStateId(id)) continue;
      placeAdminLabel(
        indiaStateLabelLayer,
        id,
        indiaStateLabelText(featureName(feature)),
        !!store.visited[id],
        "india-state-label"
      );
    }
  }

  function refreshAeEmirateLabels() {
    if (!map || !aeEmirateLabelLayer) return;
    aeEmirateLabelLayer.clearLayers();
    if (!statesFC || !uaeRegionInView()) return;

    for (const feature of statesFC.features) {
      const id = featureId(feature);
      if (!isAeEmirateId(id)) continue;
      placeAdminLabel(
        aeEmirateLabelLayer,
        id,
        featureName(feature),
        !!store.visited[id],
        "ae-emirate-label"
      );
    }
  }

  function refreshVisitLabels() {
    if (!map || !visitLabelLayer) return;
    visitLabelLayer.clearLayers();

    const zoom = map.getZoom();
    const stateEntries = visitedStateEntries();
    const showStatesAtAnyZoom =
      stateEntries.length > 0 && stateEntries.length <= STATE_LABEL_ALWAYS_MAX;
    // At state-level zoom, country labels yield the map to the more useful
    // admin-1 labels. If no states are being shown, keep country labels useful
    // while the user zooms into a visited country.
    const showCountryLabels =
      zoom < STATE_LABEL_MIN_ZOOM || stateEntries.length === 0;
    const showStateLabels =
      showStatesAtAnyZoom || zoom >= STATE_LABEL_MIN_ZOOM;
    // When dedicated regional label layers are active, skip those ids from the
    // visited-only layer so names are not drawn twice.
    const indiaLabelsActive = indiaRegionInView();
    const uaeLabelsActive = uaeRegionInView();

    for (const [id] of Object.entries(store.visited)) {
      const feature = featureById.get(id);
      if (!feature) continue;
      const kind = featureKind(feature);
      if (kind === "country" && !showCountryLabels) continue;
      if (kind === "state" && !showStateLabels) continue;
      if (kind === "state" && isInStateId(id) && indiaLabelsActive) continue;
      if (kind === "state" && isAeEmirateId(id) && uaeLabelsActive) continue;

      const center = visitLabelCenter(id);
      if (!center) continue;
      const label = escapeHtml(featureName(feature));
      const className =
        kind === "state"
          ? "visited-label visited-label--state"
          : "visited-label visited-label--country";
      const icon = L.divIcon({
        className: "visited-label-icon",
        html: `<span class="${className}">${label}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker(center, {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(visitLabelLayer);
    }
  }

  function findPlaceLayer(id) {
    if (isStateId(id) && stateLayer) {
      return (
        stateLayer
          .getLayers()
          .find((layer) => featureId(layer.feature) === id) || null
      );
    }
    if (countryLayer) {
      return (
        countryLayer
          .getLayers()
          .find((layer) => featureId(layer.feature) === id) || null
      );
    }
    return null;
  }

  function clearSelectedPlace() {
    if (selectedPlaceLayer) {
      if (stateLayer && stateLayer.hasLayer(selectedPlaceLayer)) {
        stateLayer.resetStyle(selectedPlaceLayer);
      } else if (countryLayer) {
        countryLayer.resetStyle(selectedPlaceLayer);
      }
    }
    selectedPlaceLayer = null;
  }

  function selectPlaceLayer(id) {
    clearSelectedPlace();
    selectedPlaceLayer = findPlaceLayer(id);
    if (selectedPlaceLayer) {
      const canary = usesCanaryHighlight(id);
      selectedPlaceLayer.setStyle({
        weight: 2.4,
        color: canary ? CANARY_HIGHLIGHT : GOLD_HIGHLIGHT,
        fillColor: canary ? CANARY_HIGHLIGHT : GOLD_HIGHLIGHT,
        fillOpacity: 0.9,
      });
      selectedPlaceLayer.bringToFront();
    }
  }

  function fitPlace(id, maxZoom = 5) {
    try {
      const layer = findPlaceLayer(id);
      if (layer && map) {
        map.fitBounds(layer.getBounds(), {
          maxZoom: isStateId(id) ? Math.max(maxZoom, 5) : maxZoom,
          padding: [40, 40],
        });
      }
    } catch {
      /* ignore */
    }
  }

  // —— Place sheet ——
  function formatDate(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function renderAdmin1Block(opts) {
    if (!el.sheetStates) return;
    const { title, emptyHint, entries, total } = opts;
    const n = entries.length;
    el.sheetStates.hidden = false;
    if (el.sheetStatesTitle) {
      el.sheetStatesTitle.textContent = `${title} · ${n} / ${total}`;
    }
    el.sheetStatesList.innerHTML = "";
    const sorted = [...entries].sort((a, b) =>
      visitedDisplayName(a[0], a[1]).localeCompare(visitedDisplayName(b[0], b[1]))
    );
    if (!sorted.length) {
      const li = document.createElement("li");
      li.className = "sheet-states-empty";
      li.textContent = emptyHint;
      el.sheetStatesList.appendChild(li);
      return;
    }
    for (const [id, v] of sorted) {
      const li = document.createElement("li");
      li.tabIndex = 0;
      const yearLabel = v.year == null ? "Year not set" : String(v.year);
      li.innerHTML = `<span class="name">${escapeHtml(visitedDisplayName(id, v))}</span><span class="date">${escapeHtml(yearLabel)}</span>`;
      const open = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPlaceSheet(id);
        fitPlace(id, 6);
      };
      li.addEventListener("click", open);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open(e);
      });
      el.sheetStatesList.appendChild(li);
    }
  }

  function hideAdmin1Block() {
    if (el.sheetStates) el.sheetStates.hidden = true;
  }

  function openPlaceSheet(id) {
    const f = featureById.get(id);
    if (!f) return;
    activePlaceId = id;
    selectPlaceLayer(id);
    const name = featureName(f);
    const kind = featureKind(f);
    const visit = store.visited[id];
    el.sheetTitle.textContent = name;
    if (kind === "state") {
      const label = stateRegionLabel(id);
      el.sheetSub.textContent = visit
        ? `Visited · ${label}`
        : `Not visited yet · ${label}`;
    } else {
      el.sheetSub.textContent = visit ? "Visited" : "Not visited yet";
    }
    el.sheetMeta.innerHTML = "";
    el.sheetYear.hidden = !visit;
    if (visit) {
      el.sheetYearInput.min = String(MIN_VISIT_YEAR);
      el.sheetYearInput.max = String(maxVisitYear());
      el.sheetYearInput.value = visit.year == null ? "" : String(visit.year);
      el.sheetMeta.innerHTML = `
        <div><dt>First visit</dt><dd>${formatDate(visit.firstVisit)}</dd></div>
        <div><dt>Last visit</dt><dd>${formatDate(visit.lastVisit)}</dd></div>
        <div><dt>Added via</dt><dd>${visit.source === "geo" ? "Location" : "Manual"}</dd></div>
      `;
      el.sheetRemove.hidden = false;
      el.sheetRemove.textContent = "Remove visit";
    } else {
      el.sheetMeta.innerHTML = `<div><dt>Status</dt><dd>Not on your list</dd></div>`;
      el.sheetRemove.hidden = false;
      el.sheetRemove.textContent = "Mark as visited";
    }

    if (kind === "country" && isUsaCountryId(id)) {
      renderAdmin1Block({
        title: "US states visited",
        emptyHint: "No US states marked yet — search California, Texas…",
        entries: visitedUsStateEntries(),
        total: TOTAL_US_STATES,
      });
    } else if (kind === "country" && isIndiaCountryId(id)) {
      renderAdmin1Block({
        title: "Indian states / UTs visited",
        emptyHint: "No Indian states marked yet — search Delhi, Maharashtra…",
        entries: visitedInStateEntries(),
        total: TOTAL_IN_STATES,
      });
    } else if (kind === "country" && isAustraliaCountryId(id)) {
      renderAdmin1Block({
        title: "Australian states / territories visited",
        emptyHint: "No Australian states marked yet — search New South Wales, Victoria…",
        entries: visitedAuStateEntries(),
        total: TOTAL_AU_STATES,
      });
    } else if (kind === "country" && isUaeCountryId(id)) {
      renderAdmin1Block({
        title: "UAE emirates visited",
        emptyHint: "No emirates marked yet — search Dubai, Abu Dhabi…",
        entries: visitedAeEmirateEntries(),
        total: TOTAL_AE_EMIRATES,
      });
    } else {
      hideAdmin1Block();
    }

    el.sheetBackdrop.hidden = false;
    el.sheet.hidden = false;
    requestAnimationFrame(() => el.sheet.classList.add("open"));
  }

  function closePlaceSheet() {
    clearSelectedPlace();
    el.sheet.classList.remove("open");
    setTimeout(() => {
      el.sheet.hidden = true;
      el.sheetBackdrop.hidden = true;
      activePlaceId = null;
      hideAdmin1Block();
    }, 280);
  }

  // —— Stats ——
  function openStats() {
    const nCountries = visitedCountryCount();
    const nUs = visitedUsStateCount();
    const nIn = visitedInStateCount();
    const nAu = visitedAuStateCount();
    const nAe = visitedAeEmirateCount();
    el.statCount.textContent = String(nCountries);
    if (el.statUsStates) el.statUsStates.textContent = String(nUs);
    if (el.statInStates) el.statInStates.textContent = String(nIn);
    if (el.statAuStates) el.statAuStates.textContent = String(nAu);
    if (el.statAeEmirates) el.statAeEmirates.textContent = String(nAe);
    el.statPct.textContent =
      nCountries === 0
        ? "0%"
        : `${Math.min(100, ((nCountries / TOTAL_COUNTRIES_APPROX) * 100).toFixed(1))}%`;

    const groups = [
      { title: "Countries", entries: visitedCountryEntries(), tag: "Country" },
      { title: "US states", entries: visitedUsStateEntries(), tag: "US state" },
      { title: "Indian states", entries: visitedInStateEntries(), tag: "Indian state" },
      { title: "Australian states", entries: visitedAuStateEntries(), tag: "Australian state" },
      { title: "UAE emirates", entries: visitedAeEmirateEntries(), tag: "UAE emirate" },
    ];
    const entries = groups.flatMap((group) => group.entries);
    el.visitedList.innerHTML = "";
    el.visitedEmpty.hidden = entries.length > 0;
    for (const group of groups) {
      if (!group.entries.length) continue;
      const heading = document.createElement("li");
      heading.className = "visited-group-heading";
      heading.textContent = group.title;
      el.visitedList.appendChild(heading);
      const sorted = [...group.entries].sort((a, b) =>
        visitedDisplayName(a[0], a[1]).localeCompare(visitedDisplayName(b[0], b[1]))
      );
      for (const [id, v] of sorted) {
        const li = document.createElement("li");
        const yearLabel = v.year == null ? "Year not set" : `Year ${v.year}`;
        const tag = `<span class="tag">${group.tag}</span>`;
        li.innerHTML = `<span class="name">${escapeHtml(visitedDisplayName(id, v))} ${tag}</span><span class="date">${escapeHtml(yearLabel)}</span>`;
        li.addEventListener("click", () => {
          closeStats();
          openPlaceSheet(id);
          fitPlace(id, isStateId(id) ? 6 : 5);
        });
        el.visitedList.appendChild(li);
      }
    }
    el.statsPanel.hidden = false;
  }

  function openStatsIfVisible() {
    if (!el.statsPanel.hidden) openStats();
  }

  function closeStats() {
    el.statsPanel.hidden = true;
  }

  function openMenu() {
    el.menuPanel.hidden = false;
  }
  function closeMenu() {
    el.menuPanel.hidden = true;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // —— Search / autocomplete ——
  function pickPlaceFromSearch(item) {
    if (!item || !item.id) return;
    if (!store.visited[item.id]) {
      markVisited(item.id, item.name, "manual");
    }
    el.search.value = "";
    el.searchClear.hidden = true;
    el.autocomplete.hidden = true;
    el.search.blur();
    openPlaceSheet(item.id);
    fitPlace(item.id, item.kind === "state" ? 6 : 5);
  }

  function renderAutocomplete(items) {
    el.autocomplete.innerHTML = "";
    if (!items.length) {
      el.autocomplete.hidden = true;
      return;
    }
    for (const item of items) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.dataset.id = item.id;
      let kindTag = "";
      if (item.kind === "state") {
        kindTag = `<span class="tag">${escapeHtml(stateRegionLabel(item.id))}</span>`;
      }
      const visitedTag = item.visited ? '<span class="tag">Visited</span>' : "";
      li.innerHTML = `<span>${escapeHtml(item.name)}</span><span class="tags">${kindTag}${visitedTag}</span>`;
      let picked = false;
      const onPick = (e) => {
        if (e.type === "pointerdown" && e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (picked) return;
        picked = true;
        pickPlaceFromSearch(item);
      };
      const captureOpts = { capture: true };
      li.addEventListener("pointerdown", onPick, captureOpts);
      li.addEventListener("touchstart", onPick, captureOpts);
      li.addEventListener("click", onPick);
      el.autocomplete.appendChild(li);
    }
    el.autocomplete.hidden = false;
  }

  // —— Geolocation ——
  function setLocUI(on) {
    el.locToggle.setAttribute("aria-pressed", on ? "true" : "false");
    el.locLabel.textContent = on ? "Location on" : "Location off";
  }

  function haversineM(a, b) {
    const R = 6371000;
    const toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(b.lat - a.lat);
    const dLon = toR(b.lng - a.lng);
    const lat1 = toR(a.lat);
    const lat2 = toR(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  async function reverseGeocode(lat, lng) {
    const url = `${REVERSE_URL}?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("reverse geocode failed");
    const data = await res.json();
    const code = data.countryCode;
    const name = canonicalExternalName(data.countryName);
    if (!code || !name || code.length !== 2) {
      return null;
    }
    if (!data.countryName) return null;
    return {
      code: code.toUpperCase(),
      name,
      subdivision: data.principalSubdivision || null,
      subdivisionCode: data.principalSubdivisionCode || null,
      raw: data,
    };
  }

  function resolveCountryFromGeocode(result) {
    const code = result.code;
    const name = result.name;
    for (const [id, f] of featureById) {
      if (featureKind(f) !== "country") continue;
      const p = f.properties || {};
      const iso2 = (
        p.ISO_A2 ||
        p["ISO3166-1-Alpha-2"] ||
        p.iso_a2 ||
        ""
      ).toUpperCase();
      if (iso2 && iso2 === code && iso2 !== "-99") {
        return { id, name: featureName(f) };
      }
    }
    const f = findFeatureByName(name, { preferKind: "country" });
    if (f && featureKind(f) === "country") {
      return { id: featureId(f), name: featureName(f) };
    }
    const f2 = findFeatureByName(name.replace(/\s*\(.*\)\s*/g, ""), {
      preferKind: "country",
    });
    if (f2 && featureKind(f2) === "country") {
      return { id: featureId(f2), name: featureName(f2) };
    }
    return null;
  }

  function resolveStateFromGeocode(result) {
    if (!result) return null;
    const country = (result.code || "").toUpperCase();
    if (
      country !== USA_ISO2 &&
      country !== INDIA_ISO2 &&
      country !== AUSTRALIA_ISO2 &&
      country !== UAE_ISO2
    ) {
      return null;
    }
    const prefix =
      country === USA_ISO2
        ? "US"
        : country === INDIA_ISO2
          ? "IN"
          : country === AUSTRALIA_ISO2
            ? "AU"
            : "AE";
    const code = (result.subdivisionCode || "").toUpperCase();
    if (STATE_ID_RE.test(code) && featureById.has(code)) {
      const f = featureById.get(code);
      // Ensure the subdivision belongs to this country
      if (code.startsWith(prefix + "-")) {
        return { id: code, name: featureName(f) };
      }
    }
    // Sometimes postal only ("CA", "DL")
    if (/^[A-Z]{2,3}$/.test(code)) {
      const full = `${prefix}-${code}`;
      if (featureById.has(full)) {
        return { id: full, name: featureName(featureById.get(full)) };
      }
    }
    if (result.subdivision) {
      // Prefer state whose id matches this country prefix
      const f = findFeatureByName(result.subdivision, { preferKind: "state" });
      if (f && featureKind(f) === "state") {
        const id = featureId(f);
        if (id.startsWith(prefix + "-")) {
          return { id, name: featureName(f) };
        }
      }
      // Scan nameIndex for a matching state under this country
      const q = result.subdivision.trim().toLowerCase();
      const ids = nameIndex.get(q) || [];
      for (const id of ids) {
        if (id.startsWith(prefix + "-") && featureById.has(id)) {
          return { id, name: featureName(featureById.get(id)) };
        }
      }
    }
    return null;
  }

  function updateUserMarker(lat, lng) {
    const icon = L.divIcon({
      className: "",
      html: '<div class="user-marker"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    if (userMarker) {
      userMarker.setLatLng([lat, lng]);
    } else {
      userMarker = L.marker([lat, lng], { icon, interactive: false }).addTo(map);
    }
  }

  async function handlePosition(pos, { force = false, center = false } = {}) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    updateUserMarker(lat, lng);
    if (center && map) {
      map.setView([lat, lng], Math.max(map.getZoom(), 5), { animate: true });
    }

    const now = Date.now();
    const here = { lat, lng };
    if (!force) {
      if (now - lastGeocodeAt < GEO_MIN_INTERVAL_MS) return;
      if (
        lastGeocodePos &&
        haversineM(lastGeocodePos, here) < GEO_WATCH_MOVE_M
      ) {
        return;
      }
    }

    lastGeocodeAt = now;
    lastGeocodePos = here;

    try {
      const result = await reverseGeocode(lat, lng);
      if (!result) {
        console.info("Reverse geocode: no confident country (ocean?)");
        return;
      }
      const match = resolveCountryFromGeocode(result);
      if (!match) {
        console.warn("Could not match country", result);
        showToast(`Detected ${result.name}, but couldn't map it`);
        return;
      }

      const stateMatch =
        result.code === USA_ISO2 ||
        result.code === INDIA_ISO2 ||
        result.code === AUSTRALIA_ISO2 ||
        result.code === UAE_ISO2
          ? resolveStateFromGeocode(result)
          : null;

      const alreadyCountry = store.visited[match.id];
      const alreadyState = stateMatch ? store.visited[stateMatch.id] : null;

      // Country stays independent of its admin-1 units
      markVisited(match.id, match.name, "geo");

      if (stateMatch) {
        markVisited(stateMatch.id, stateMatch.name, "geo");
        if (!alreadyState) {
          showToast(`You're in ${stateMatch.name} ✈`);
        } else if (!alreadyCountry) {
          showToast(`You're in ${match.name} ✈`);
        }
      } else if (!alreadyCountry) {
        showToast(`You're in ${match.name} ✈`);
      }
    } catch (err) {
      console.warn("Reverse geocode error", err);
    }
  }

  function onGeoError(err) {
    console.warn("Geolocation error", err);
    if (err.code === 1) {
      showToast("Location permission denied");
      store.locationEnabled = false;
      saveStore();
      setLocUI(false);
      stopWatching();
    } else if (err.code === 2) {
      showToast("Location unavailable");
    } else if (err.code === 3) {
      showToast("Location timed out");
    }
  }

  function startWatching() {
    if (!navigator.geolocation) {
      showToast("Geolocation not supported");
      return;
    }
    stopWatching();
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePosition(pos, { force: true, center: true }),
      onGeoError,
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 }
    );
    geoWatchId = navigator.geolocation.watchPosition(
      (pos) => handlePosition(pos, { force: false }),
      onGeoError,
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 20000 }
    );
  }

  function stopWatching() {
    if (geoWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
  }

  function enableLocation() {
    store.locationEnabled = true;
    saveStore();
    setLocUI(true);
    startWatching();
  }

  function disableLocation() {
    store.locationEnabled = false;
    saveStore();
    setLocUI(false);
    stopWatching();
  }

  // —— Import / export ——
  function downloadBlob(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(store, null, 2)], {
      type: "application/json",
    });
    downloadBlob(`my-travels-${new Date().toISOString().slice(0, 10)}.json`, blob);
    showToast("Exported");
    closeMenu();
  }

  function indianStatesExportRows() {
    return visitedInStateEntries()
      .map(([id, v]) => ({
        id,
        name: visitedDisplayName(id, v),
        year: v.year == null ? null : v.year,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function exportIndianStatesJson() {
    const states = indianStatesExportRows();
    if (!states.length) {
      showToast("No Indian states visited yet");
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      count: states.length,
      states,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    downloadBlob(
      `my-travels-indian-states-${new Date().toISOString().slice(0, 10)}.json`,
      blob
    );
    showToast(`Exported ${states.length} Indian state${states.length === 1 ? "" : "s"}`);
    closeMenu();
  }

  function exportIndianStatesCsv() {
    const states = indianStatesExportRows();
    if (!states.length) {
      showToast("No Indian states visited yet");
      return;
    }
    const esc = (value) => {
      const s = value == null ? "" : String(value);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = ["id,name,year"];
    for (const row of states) {
      lines.push([esc(row.id), esc(row.name), esc(row.year)].join(","));
    }
    const blob = new Blob([lines.join("\n") + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    downloadBlob(
      `my-travels-indian-states-${new Date().toISOString().slice(0, 10)}.csv`,
      blob
    );
    showToast(`Exported ${states.length} Indian state${states.length === 1 ? "" : "s"}`);
    closeMenu();
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object" || !data.visited) {
          throw new Error("Invalid file");
        }
        store = {
          ...defaultStore(),
          ...data,
          visited: normalizeVisited(data.visited),
        };
        normalizeVisitedNames();
        saveStore();
        refreshLayerStyles();
        setLocUI(!!store.locationEnabled);
        if (store.locationEnabled) startWatching();
        showToast("Import complete");
        closeMenu();
      } catch (e) {
        showToast("Import failed");
        console.error(e);
      }
    };
    reader.readAsText(file);
  }

  // —— Events ——
  function bindEvents() {
    el.locToggle.addEventListener("click", () => {
      if (store.locationEnabled) disableLocation();
      else enableLocation();
    });

    el.btnLocate.addEventListener("click", () => {
      if (!navigator.geolocation) {
        showToast("Geolocation not supported");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!store.locationEnabled) {
            enableLocation();
          } else {
            handlePosition(pos, { force: true, center: true });
          }
        },
        onGeoError,
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 }
      );
    });

    function placesReady() {
      return featureById.size > 0;
    }

    function toastIfPlacesNotReady() {
      if (placesReady()) return false;
      if (countriesLoadState === "failed") showToast("Could not load countries");
      else showToast("Map still loading…");
      return true;
    }

    function addTopSearchHit() {
      if (toastIfPlacesNotReady()) return;
      const q = (el.search.value || "").trim();
      if (!q) {
        showToast("Type a country or state");
        return;
      }
      const items = searchPlaces(q, 1);
      if (!items[0]) {
        showToast("No match found");
        return;
      }
      pickPlaceFromSearch(items[0]);
    }

    el.search.addEventListener("input", () => {
      const q = el.search.value;
      el.searchClear.hidden = !q;
      if (q && toastIfPlacesNotReady()) {
        el.autocomplete.hidden = true;
        return;
      }
      renderAutocomplete(searchPlaces(q));
    });
    el.search.addEventListener("focus", () => {
      if (el.search.value) {
        if (toastIfPlacesNotReady()) return;
        renderAutocomplete(searchPlaces(el.search.value));
      }
    });
    el.search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTopSearchHit();
      } else if (e.key === "Escape") {
        el.autocomplete.hidden = true;
        el.search.blur();
      }
    });
    if (el.btnAdd) {
      let addPicked = false;
      const onAdd = (e) => {
        if (e.type === "pointerdown" && e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (addPicked) return;
        addPicked = true;
        addTopSearchHit();
        setTimeout(() => {
          addPicked = false;
        }, 400);
      };
      el.btnAdd.addEventListener("pointerdown", onAdd, { capture: true });
      el.btnAdd.addEventListener("touchstart", onAdd, { capture: true });
      el.btnAdd.addEventListener("click", onAdd);
    }
    el.searchClear.addEventListener("click", () => {
      el.search.value = "";
      el.searchClear.hidden = true;
      el.autocomplete.hidden = true;
      el.search.focus();
    });
    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".search-row")) {
        el.autocomplete.hidden = true;
      }
    });

    el.sheetClose.addEventListener("click", closePlaceSheet);
    el.sheetBackdrop.addEventListener("click", closePlaceSheet);
    el.sheetYearInput.addEventListener("change", () => {
      if (!activePlaceId || !store.visited[activePlaceId]) return;
      const inputValue = el.sheetYearInput.value.trim();
      const year = normalizeVisitYear(inputValue);
      if (inputValue && year === undefined) {
        const previous = store.visited[activePlaceId].year;
        el.sheetYearInput.value = previous == null ? "" : String(previous);
        showToast(`Enter a year from ${MIN_VISIT_YEAR} to ${maxVisitYear()}`);
        return;
      }
      if (year === undefined) delete store.visited[activePlaceId].year;
      else store.visited[activePlaceId].year = year;
      saveStore();
      openStatsIfVisible();
      // Refresh parent-country admin-1 list if that sheet is open
      if (activePlaceId && isUsaCountryId(activePlaceId)) {
        renderAdmin1Block({
          title: "US states visited",
          emptyHint: "No US states marked yet — search California, Texas…",
          entries: visitedUsStateEntries(),
          total: TOTAL_US_STATES,
        });
      } else if (activePlaceId && isIndiaCountryId(activePlaceId)) {
        renderAdmin1Block({
          title: "Indian states / UTs visited",
          emptyHint: "No Indian states marked yet — search Delhi, Maharashtra…",
          entries: visitedInStateEntries(),
          total: TOTAL_IN_STATES,
        });
      } else if (activePlaceId && isAustraliaCountryId(activePlaceId)) {
        renderAdmin1Block({
          title: "Australian states / territories visited",
          emptyHint: "No Australian states marked yet — search New South Wales, Victoria…",
          entries: visitedAuStateEntries(),
          total: TOTAL_AU_STATES,
        });
      } else if (activePlaceId && isUaeCountryId(activePlaceId)) {
        renderAdmin1Block({
          title: "UAE emirates visited",
          emptyHint: "No emirates marked yet — search Dubai, Abu Dhabi…",
          entries: visitedAeEmirateEntries(),
          total: TOTAL_AE_EMIRATES,
        });
      }
      showToast(year === undefined ? "Visit year cleared" : `Visit year saved: ${year}`);
    });
    el.sheetRemove.addEventListener("click", () => {
      if (!activePlaceId) return;
      const id = activePlaceId;
      if (store.visited[id]) {
        unmarkVisited(id);
        closePlaceSheet();
      } else {
        const f = featureById.get(id);
        markVisited(id, f ? featureName(f) : id, "manual");
        openPlaceSheet(id);
      }
    });

    el.btnStats.addEventListener("click", openStats);
    el.count.addEventListener("click", openStats);
    el.statsClose.addEventListener("click", closeStats);
    el.btnMenu.addEventListener("click", openMenu);
    el.menuClose.addEventListener("click", closeMenu);

    el.btnExport.addEventListener("click", exportData);
    if (el.btnExportInStates) {
      el.btnExportInStates.addEventListener("click", exportIndianStatesJson);
    }
    if (el.btnExportInStatesCsv) {
      el.btnExportInStatesCsv.addEventListener("click", exportIndianStatesCsv);
    }
    el.btnImport.addEventListener("click", () => el.importFile.click());
    el.importFile.addEventListener("change", () => {
      const f = el.importFile.files && el.importFile.files[0];
      if (f) importData(f);
      el.importFile.value = "";
    });
    el.btnClear.addEventListener("click", () => {
      if (
        !confirm(
          "Clear all visited countries, states, and emirates (US, India, Australia & UAE)? This cannot be undone."
        )
      )
        return;
      store.visited = {};
      saveStore();
      refreshLayerStyles();
      showToast("All visits cleared");
      closeMenu();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && store.locationEnabled) {
        navigator.geolocation?.getCurrentPosition(
          (pos) => handlePosition(pos, { force: false }),
          () => {},
          { maximumAge: 60000, timeout: 10000 }
        );
      }
    });
  }

  // —— Service worker ——
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // A single reload lets the newly activated v18 worker serve the fresh shell.
      if (reloading || sessionStorage.getItem("mytravels.sw-reloaded-pages-v1")) return;
      reloading = true;
      sessionStorage.setItem("mytravels.sw-reloaded-pages-v1", "1");
      window.location.reload();
    });

    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((registration) => registration.update())
      .catch((e) => {
        console.warn("SW register failed", e);
      });
  }

  // —— Boot ——
  async function boot() {
    bindEvents();
    setLocUI(!!store.locationEnabled);
    updateCountUI();
    initMap();
    registerSW();

    try {
      showToast("Loading map…", 1500);
      const fc = await loadCountries();
      addCountryLayer(fc);
      countriesLoadState = "ready";
    } catch (err) {
      console.error(err);
      countriesLoadState = "failed";
      showToast("Could not load country data");
    }

    try {
      const sfc = await loadAllStates();
      addStateLayer(sfc);
      statesLoadState = "ready";
    } catch (err) {
      console.warn("Admin-1 states failed to load", err);
      statesLoadState = "failed";
    }

    if (store.locationEnabled && countriesLoadState === "ready") {
      startWatching();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
