import { NextResponse, type NextRequest } from "next/server";
import { auth0Configured, getAuth0 } from "./lib/auth0client";

// v4 handles /auth/login, /auth/logout, /auth/callback, /auth/profile, and
// /auth/access-token entirely through this middleware — there is no
// api/auth/[auth0]/route.ts handler to write. That's the biggest v3→v4
// surface change (CLAUDE.md §9.1 flags this file as the one to trust over
// remembered v3 APIs); the repo layout's mention of an auth route file is a
// v3-ism this codebase intentionally does not carry over.
export async function middleware(request: NextRequest) {
  if (!auth0Configured()) return NextResponse.next();
  return getAuth0().middleware(request);
}

export const config = {
  matcher: [
    /*
     * Skip static assets and Next internals; run on everything else so the
     * auth middleware can attach/refresh the session on every navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
