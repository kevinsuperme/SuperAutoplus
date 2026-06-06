const PUBLIC_CLIENT_ROUTES = new Set(["/pxl-plus", "/luckmail-code"]);

export function normalizePublicPath(pathname: string) {
  const path = String(pathname || "").trim() || "/";
  if (path === "/") return path;
  return path.replace(/\/+$/, "");
}

export function isPublicClientRoute(pathname: string, route: string) {
  return normalizePublicPath(pathname) === route;
}

export function getPublicClientRoute(pathname: string) {
  const normalized = normalizePublicPath(pathname);
  return PUBLIC_CLIENT_ROUTES.has(normalized) ? normalized : "";
}
