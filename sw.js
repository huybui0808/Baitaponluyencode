// VI: Cập nhật giao diện và tái sử dụng compiler đã cache, tránh tải lại khoảng 95 MB. EN: Refresh the app shell while reusing cached compiler assets to avoid another ~95 MB download.
const CACHE_NAME = "onluyencpp-offline-v44";
const APP_FILES = [
  "./",
  "./index.html",
  "./Style.css",
  "./theme.js",
  "./script.js",
  "./admin.js",
  "./admin.css",
  "./workers/cpp-compiler-worker.js",
  "./workers/cpp-runner-worker.js",
  "./vendor/cpp-compiler/compiler/index.js",
  "./vendor/cpp-compiler/compiler/clang.wasm",
  "./vendor/cpp-compiler/compiler/lld.wasm",
  "./vendor/cpp-compiler/compiler/sysroot.tar",
  "./vendor/cpp-compiler/compiler/clang.js",
  "./vendor/cpp-compiler/compiler/lld.js",
  "./vendor/cpp-compiler/wasi/index.js",
  "./vendor/cpp-compiler/wasi/wasi.js",
  "./vendor/cpp-compiler/wasi/wasi_defs.js",
  "./vendor/cpp-compiler/wasi/fd.js",
  "./vendor/cpp-compiler/wasi/fs_mem.js",
  "./vendor/cpp-compiler/wasi/fs_opfs.js",
  "./vendor/cpp-compiler/wasi/debug.js",
  "./vendor/cpp-compiler/wasi/strace.js",
  "./data/part1.json",
  "./data/part2.json",
  "./data/part3.json",
  "./data/part4.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const previousCaches = (await caches.keys())
        .filter((key) => key.startsWith("onluyencpp-offline-") && key !== CACHE_NAME)
        .reverse();
      const largeAssets = APP_FILES.filter((path) => path.startsWith("./vendor/"));
      const shellAndData = APP_FILES.filter((path) => !path.startsWith("./vendor/"));
      const oldCache = previousCaches.length
        ? await caches.open(previousCaches[0])
        : await caches.open(CACHE_NAME);
      const missingLargeAssets = [];

      for (const path of largeAssets) {
        const url = new URL(path, self.registration.scope).href;
        const saved = oldCache ? await oldCache.match(url) : null;
        if (saved) await cache.put(url, saved);
        else missingLargeAssets.push(path);
      }

      await cache.addAll([
        ...shellAndData.map((path) => new Request(new URL(path, self.registration.scope), { cache: "reload" })),
        ...missingLargeAssets,
      ]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("onluyencpp-offline-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const isAppShell =
    request.mode === "navigate" ||
    (/\.(?:html|css|js|json)$/i.test(url.pathname) && !url.pathname.includes("/vendor/"));

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // VI: Luon kiem tra ban moi cua giao dien/du lieu khi co mang; cache de du phong offline.
    // EN: Revalidate app shell/data online; use the cached copy when offline.
    if (isAppShell) {
      try {
        const response = await fetch(new Request(request, { cache: "no-cache" }));
        if (response.ok && response.type === "basic") {
          try {
            await cache.put(request, response.clone());
          } catch (_) {
            // Keep the live response usable even if the browser cache is full.
          }
        }
        return response;
      } catch (error) {
        const cached = await cache.match(request) || await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        throw error;
      }
    }

    // VI: Cac file compiler lon dung cache-first de tranh tai lai WASM.
    // EN: Keep large compiler assets cache-first to avoid repeated WASM downloads.
    const cached = await cache.match(request) || await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      try {
        await cache.put(request, response.clone());
      } catch (_) {
        // Keep the live response usable even if the browser cache is full.
      }
    }
    return response;
  })());
});
