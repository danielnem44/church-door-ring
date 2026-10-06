export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

export function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

// The public address of the site, without a trailing slash.
// Set SITE_URL on Vercel. Without it we use the address the request came in on.
export function baseUrl(request) {
  const fromEnv = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  return fromEnv || new URL(request.url).origin;
}

// Month key for simple stats, e.g. "2026-10"
export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}
