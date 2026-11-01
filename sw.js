// UPWISE service worker.
// Network first: you always get the newest version when online, and pages you have visited
// still open when offline. It never touches /api/ calls or other sites (login and database).
const CACHE = "upwise-v3";
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

const VIB = {
  short: [300, 150, 300],
  long: [800, 300, 800, 300, 800],
  sos: [200, 100, 200, 100, 200, 300, 600, 100, 600, 100, 600, 300, 200, 100, 200, 100, 200]
};

// a push arrives from the server, even when UPWISE is closed
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // if UPWISE is open and visible, let the app ring its own alarm instead of a system notification
    const open = list.filter((c) => c.visibilityState === "visible");
    if (open.length && !d.test) {
      open.forEach((c) => c.postMessage({ type: "reminder", id: d.id, title: d.body, remind_at: d.remind_at }));
      return;
    }
    const opts = {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.id || "upwise",
      renotify: true,
      requireInteraction: true,
      data: { url: "/reminders.html" }
    };
    if (d.quiet) opts.silent = true; // quiet hours: show it, but with no sound or vibration
    else opts.vibrate = VIB[d.vib] || VIB.long;
    await self.registration.showNotification(d.title || "UPWISE reminder", opts);
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/app.html";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
