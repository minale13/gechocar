import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Local admin auto-bypass: when enabled (e.g. a private/internal deployment or
// during development), /admin is reachable without a real Supabase session.
// It still requires the local admin cookie set by /login for full write access,
// but navigation itself is not blocked.
const AUTO_BYPASS_ENABLED =
  process.env.NEXT_PUBLIC_ADMIN_BYPASS === "1" ||
  process.env.ADMIN_BYPASS === "1";

export function middleware(request: NextRequest) {
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");

  if (!isAdminRoute) {
    return NextResponse.next();
  }

  // Auto-bypass: /admin is reachable directly when enabled. The admin page
  // client-side guard still honors the local admin cookie/localStorage marker.
  if (AUTO_BYPASS_ENABLED) {
    return NextResponse.next();
  }

  // Check for local admin session cookie or Supabase session tokens
  const adminSession = request.cookies.get("gecho-admin-auth");
  const supabaseSession = request.cookies.get("sb-access-token") || request.cookies.get("sb-refresh-token");
  const hasValidSession = adminSession || supabaseSession;

  if (!hasValidSession && !isLoginRoute) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
