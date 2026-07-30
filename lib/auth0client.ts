// @auth0/nextjs-auth0 v4 uses an Auth0Client instance + middleware, not the
// v3 handleAuth() API. Check node_modules/@auth0/nextjs-auth0's shipped types
// before changing this against remembered v3 shapes — this file is the one
// place that talks to the SDK, so a version mismatch surfaces here first.
//
// Constructed lazily: instantiating it without credentials logs a warning on
// every render, and the whole point of DEMO_MODE=mock is running with no
// Auth0 tenant at all.
import { Auth0Client } from "@auth0/nextjs-auth0/server";

let client: Auth0Client | null = null;

export function auth0Configured(): boolean {
  return Boolean(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET);
}

export function getAuth0(): Auth0Client {
  if (!client) {
    client = new Auth0Client({
      domain: process.env.AUTH0_DOMAIN,
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      appBaseUrl: process.env.APP_BASE_URL,
      secret: process.env.AUTH0_SECRET,
      authorizationParameters: {
        audience: process.env.AUTH0_AUDIENCE,
        scope: "openid profile email",
      },
    });
  }
  return client;
}
