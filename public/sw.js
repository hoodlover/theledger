/* TheLedger service worker — minimal install-prep + offline-shell.
   Bumps CACHE_VERSION to invalidate previous caches on deploy. */
const CACHE_VERSION = "tl-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;

const SHELL_URLS = [
  "/login",
  "/theledger-assets/logo.png",
  "/theledger-assets/PWA.png",
  "/theledger-assets/emblem-wider.webp",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      // best-effort — don't fail install if a single asset 404s
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (_) {}
        })
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache API responses or server-action posts
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/logout" || url.pathname === "/login") return;

  // Stale-while-revalidate for static brand assets
  if (
    url.pathname.startsWith("/theledger-assets/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/icon-maskable.svg"
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_SHELL_CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
    return;
  }

  // Pages: network-first, fall back to /login (cached) when offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(APP_SHELL_CACHE);
        const offlineFallback = await cache.match("/login");
        return (
          offlineFallback ??
          new Response("You are offline.", {
            status: 503,
            headers: { "content-type": "text/plain" },
          })
        );
      })
    );
  }
});
