/* MyICE service worker: keeps the app itself on the device so it opens with no signal, and receives
   price-drop alerts (Web Push). Pages are served from the saved copy straight away and refreshed in the
   background. Live lookups (prices, alerts) are never cached. */
const CACHE = "myice-shell-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.indexOf("myice-") === 0 && k !== CACHE).map(k => caches.delete(k))))   // only MyICE's own copies: MyEV shares this website address
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;            // other websites: not touched
  if (u.pathname.endsWith("/ping.txt") || u.pathname.endsWith("/version.txt")) return;         // connection check: always the network
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(r, { ignoreSearch: true });
      const fresh = fetch(r, { cache: "no-cache" }).then(res => {
        if (res && res.ok) cache.put(r.mode === "navigate" ? "./" : r, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(fresh); return hit; }
      const res = await fresh;
      if (res) return res;
      if (r.mode === "navigate") { const home = await cache.match("./"); if (home) return home; }
      return Response.error();
    })
  );
});

/* price-drop alert from the MyICE service */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch (x) { try { d = { body: e.data.text() }; } catch (y) {} }
  e.waitUntil(self.registration.showNotification(d.title || "MyICE", {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || "chintzy",
    renotify: true,
    timestamp: d.ts || Date.now(),
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if (w.url.indexOf(self.registration.scope) === 0 && "focus" in w) return w.focus(); }
    return clients.openWindow(target);
  }));
});
