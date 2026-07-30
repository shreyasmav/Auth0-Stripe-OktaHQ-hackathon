import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { auth0Configured } from '@/lib/env';

// §9.1: v4 SDK uses one Auth0Client instance mounted via middleware.
// No handleAuth(). Constructed lazily so missing env never crashes module
// load. Mock mode must work with zero external services configured.

let client: Auth0Client | null = null;
let constructionFailed = false;

/**
 * Returns the shared Auth0Client, or null when Auth0 is not configured.
 * The constructor reads AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET,
 * AUTH0_SECRET and APP_BASE_URL from the environment on its own.
 */
export function getAuth0(): Auth0Client | null {
  if (!auth0Configured() || constructionFailed) return null;
  if (client) return client;
  try {
    client = new Auth0Client();
    return client;
  } catch {
    // Partial or bad config. Degrade to mock paths instead of crashing.
    constructionFailed = true;
    return null;
  }
}
