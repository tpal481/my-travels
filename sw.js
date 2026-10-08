/* My Travels — GitHub Pages service worker.
 * HTML/CSS/JS: network-first (updates always reach the device), cache fallback for offline.
 * Local GeoJSON, icons, manifest: cache-first.
 * All paths are relative to the SW location so it works under /<repo>/. */
const CACHE = "mytravels-pages-v4";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./data/countries.geojson",
  "./data/us-states.geojson",
  "./data/in-states.geojson",
  "./data/au-states.geojson",
  "./data/ae-emirates.geojson",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-48.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const SCOPE_PATH = new URL("./", self.location).pathname; // e.g. /my-travels/

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function rel(url) {
  return url.pathname.startsWith(SCOPE_PATH) ? url.pathname.slice(SCOPE_PATH.length) : null;
}

function isAppCode(url) {
  if (url.origin !== self.location.origin) return false;
  const p = rel(url);
  if (p === null) return false;
  return p === "" || /\.html?$/.test(p) || /\.css$/.test(p) || /\.js$/.test(p);
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const p = rel(url);
  if (p === null) return false;
  return p.startsWith("icons/") || p.startsWith("data/") || p === "manifest.webmanifest";
}

function networkFirst(req, fallbackUrl) {
  return fetch(req)
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    })
    .catch(() =>
      caches.match(req)
        .then((hit) => hit || caches.match(req, { ignoreSearch: true }))
        .then((hit) => hit || (fallbackUrl ? caches.match(fallbackUrl) : undefined))
        .then((hit) => hit || Response.error())
    );
}

function cacheFirst(req) {
  return caches.match(req)
    .then((hit) => hit || caches.match(req, { ignoreSearch: true }))
    .then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
    );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, "./index.html"));
    return;
  }
  if (isAppCode(url)) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req));
  }
  // Map tiles, remote CDNs, and reverse-geocode requests go straight to the network.
});
