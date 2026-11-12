import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/signup", "/invite", "/privacy", "/terms", "/api/health", "/api/cron"];
const SESSION_COOKIES = ["__Host-ft_session", "ft_session"];

/**
 * Runs on every page request:
 * 1. Builds a per-request Content Security Policy with a nonce, so only scripts Next.js renders can run (blocks injected scripts / XSS).
 * 2. Fast gate on the session cookie. The real session check runs in each page, route and action.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const dev = process.env.NODE_ENV !== "production";
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const isPublic = pathname === "/" || pathname.startsWith("/marketing/") || PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isPublic && !SESSION_COOKIES.some((c) => req.cookies.get(c))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("content-security-policy", csp);
  // Signed-in pages hold financial and personal data: keep them out of shared caches and the back-forward cache.
  if (!isPublic) res.headers.set("cache-control", "private, no-store");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon|marketing/).*)"] };
