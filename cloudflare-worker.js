const GITHUB_PAGES_ORIGIN =
  "https://huybui0808.github.io/Baitaponluyencode/";

const LARGE_COMPILER_ASSETS = new Set([
  "/vendor/cpp-compiler/compiler/clang.wasm",
  "/vendor/cpp-compiler/compiler/sysroot.tar",
]);

// VI: Chuyển tiếp hai file compiler quá lớn sang GitHub Pages; EN: Proxy the two oversized compiler files from GitHub Pages.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!LARGE_COMPILER_ASSETS.has(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const upstreamUrl = new URL(url.pathname.slice(1), GITHUB_PAGES_ORIGIN);
    const upstream = await fetch(upstreamUrl, { method: request.method });
    const headers = new Headers(upstream.headers);
    headers.set("Cache-Control", "public, max-age=86400");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
