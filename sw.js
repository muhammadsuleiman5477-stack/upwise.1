// UPWISE service worker.
// Network first: you always get the newest version when online, and pages you have visited
// still open when offline. It never touches /api/ calls or other sites (login and database).
const CACHE = "upwise-v1";
const PRECACHE = [
  "/", "/index.html", "/offline.html", "/styles.css", "/site.js", "/pwa.js",
  "/tools.html", "/tools.js", "/privacy.html", "/terms.html", "/contact.html",
  "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/offline.html") : Response.error()))
      )
  );
});
