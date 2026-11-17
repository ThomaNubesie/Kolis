import { NextResponse, type NextRequest } from "next/server";

// Keep Quorly and Kolis apart on the shared admin-web build. Quorly lives ONLY on
// quorly.ca; on the Kolis hosts (business.kolis.ca / admin.kolis.ca / the raw
// netlify domain) the Quorly-only routes are sent to quorly.ca so business.kolis
// is no longer "linked" to Quorly.
const QUORLY_ONLY = /^\/(forms|prospecting|join)(\/|$)/;

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const isQuorlyHost = /quorly/i.test(host);
  const path = req.nextUrl.pathname;
  if (!isQuorlyHost && QUORLY_ONLY.test(path)) {
    return NextResponse.redirect(new URL(path + req.nextUrl.search, "https://quorly.ca"));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/forms/:path*", "/prospecting/:path*", "/join/:path*"] };
