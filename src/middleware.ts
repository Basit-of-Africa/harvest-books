import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/signup", "/invite"];

/** Fast gate on the session cookie; the real session check runs in each page and action. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get("hb_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon|api/health).*)"] };
