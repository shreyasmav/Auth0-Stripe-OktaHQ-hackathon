import { NextResponse, type NextRequest } from 'next/server';
import { getAuth0 } from '@/lib/auth0';
import { auth0Configured } from '@/lib/env';

// §9.1: v4 mounts /auth/* (login, logout, callback, profile) from here.
// With Auth0 unconfigured this is a pass-through so mock mode needs nothing.

export async function middleware(request: NextRequest) {
  if (!auth0Configured()) return NextResponse.next();
  const auth0 = getAuth0();
  if (!auth0) return NextResponse.next();
  return auth0.middleware(request);
}

export const config = {
  // Skip static assets and the Stripe webhook. The webhook must receive its
  // raw body untouched for signature verification.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)'],
};
