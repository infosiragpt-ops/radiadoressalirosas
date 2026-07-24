const STATIC_APP_ROUTES = new Set([
  "/",
  "/store",
  "/nosotros",
  "/contacto",
  "/cart",
  "/my-account",
  "/recuperar-contrasena",
  "/admin",
]);

function normalizedPath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

export function isAppRoute(pathname) {
  const path = normalizedPath(pathname);
  if (STATIC_APP_ROUTES.has(path)) return true;
  return /^\/(?:producto|categoria-producto)\/[^/]+$/.test(path);
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    const indexResponse = await env.ASSETS.fetch(new Request(indexUrl, request));
    if (!indexResponse.ok) return indexResponse;

    const knownRoute = isAppRoute(new URL(request.url).pathname);
    if (knownRoute) return indexResponse;

    const headers = new Headers(indexResponse.headers);
    headers.set("x-robots-tag", "noindex");
    return new Response(request.method === "HEAD" ? null : indexResponse.body, {
      status: 404,
      headers,
    });
  },
};
