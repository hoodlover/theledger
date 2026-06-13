import { NextResponse, type NextRequest } from "next/server";
import { verifySessionCookie, SESSION_COOKIE } from "@/lib/auth";

// Public paths that don't require auth.
const PUBLIC_PATHS = ["/login", "/logout"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Next.js internals + static assets + manifest + favicon
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/theledger-assets/") ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/icon-maskable.svg" ||
    pathname.startsWith("/api/auth/")
  ) {
    return true;
  }
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionCookie(cookie);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") {
      url.searchParams.set("next", pathname + req.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything EXCEPT static assets explicitly excluded above.
    // The function does the precise gating; this matcher just narrows.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
