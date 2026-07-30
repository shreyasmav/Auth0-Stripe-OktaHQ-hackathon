// Agent (M2M) token minting — CLAUDE.md §9.2. Raw client_credentials via
// fetch, no SDK. Cached per org id until 60s before expiry.
//
// When AUTH0_AGENT_CLIENT_ID isn't configured (DEMO_MODE=mock / the
// zero-external-services parachute), we mint a locally-signed token instead
// of calling Auth0 — the shape of the claims is identical to what the real
// Client Credentials Exchange Action (§9.3) would set. Either way the
// server-side gate in verify.ts reads the mandate ONLY from verified JWT
// claims, never from the store.
import { SignJWT } from "jose";
import type { Mandate } from "../types";
import { db } from "../store";
import { BUYER_MANDATE, SEED_IDS } from "../seed";

export const MANDATE_CLAIM = "https://mandate.dev/mandate";
export const ORG_CLAIM = "https://mandate.dev/org_id";

type CachedToken = { token: string; expiresAt: number };

// Pinned to globalThis for the same reason lib/store.ts is: Next.js
// re-instantiates module singletons across hot reloads and across route
// handlers, so plain module-level Maps silently reset mid-demo.
declare global {
  // eslint-disable-next-line no-var
  var __mandateAgentState: { tokenCache: Map<string, CachedToken>; overrides: Map<string, Mandate> } | undefined;
}

const agentState =
  globalThis.__mandateAgentState ?? { tokenCache: new Map(), overrides: new Map() };
globalThis.__mandateAgentState = agentState;

const tokenCache = agentState.tokenCache;

const DEMO_SIGNING_SECRET = new TextEncoder().encode(
  process.env.AUTH0_SECRET || "dev-only-demo-signing-secret-not-for-production",
);

// Hackathon shortcut (§9.3): a static map keyed by org_id standing in for
// org metadata. A real deployment reads this from the Auth0 Organization's
// metadata inside the Client Credentials Exchange Action. This is the source
// the token is MINTED from — it is not what the /pay gate reads. That gate
// only ever trusts the verified claim on the signed token (lib/auth0/verify.ts).
const mandateOverrides = agentState.overrides;

function mandateForOrg(orgId: string): Mandate {
  const override = mandateOverrides.get(orgId);
  if (override) return override;
  if (orgId === SEED_IDS.buyerOrg) return BUYER_MANDATE;
  return { ...BUYER_MANDATE, maxAmountCents: 0 };
}

/** Admin-only (see /dashboard/mandate). Invalidates the cached token for the
 * org so the very next agent token reflects the new ceiling. */
export function setMandateOverride(orgId: string, maxAmountCents: number) {
  const current = mandateForOrg(orgId);
  mandateOverrides.set(orgId, { ...current, maxAmountCents });
  tokenCache.delete(orgId);
}

async function mintLocalToken(orgId: string, scopes: string[]): Promise<string> {
  const mandate = mandateForOrg(orgId);
  const jwt = await new SignJWT({
    scope: scopes.join(" "),
    [ORG_CLAIM]: orgId,
    [MANDATE_CLAIM]: mandate,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`agt_buyer_01@clients`)
    .setIssuedAt()
    .setIssuer(`https://${process.env.AUTH0_DOMAIN || "demo.mandate.dev"}/`)
    .setAudience(process.env.AUTH0_AUDIENCE || "https://api.mandate.dev")
    .setExpirationTime("1h")
    .sign(DEMO_SIGNING_SECRET);
  return jwt;
}

async function mintRemoteToken(orgId: string): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.AUTH0_AGENT_CLIENT_ID,
      client_secret: process.env.AUTH0_AGENT_CLIENT_SECRET,
      audience: process.env.AUTH0_AUDIENCE,
      organization: orgId,
    }),
  });
  if (!res.ok) {
    throw new Error(`agent token mint failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return { token: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

/**
 * Mints (or returns a cached) agent access token for the given org, scoped
 * to deals:negotiate + deals:read only — never payments:execute. The
 * buying agent literally cannot pay; it holds no token that permits it.
 */
export async function getAgentToken(orgId: string): Promise<string> {
  const cached = tokenCache.get(orgId);
  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token;
  }

  const isConfigured = Boolean(process.env.AUTH0_AGENT_CLIENT_ID && process.env.AUTH0_AGENT_CLIENT_SECRET);
  if (isConfigured) {
    const { token, expiresIn } = await mintRemoteToken(orgId);
    tokenCache.set(orgId, { token, expiresAt: Date.now() + expiresIn * 1000 });
    return token;
  }

  const token = await mintLocalToken(orgId, ["deals:negotiate", "deals:read"]);
  tokenCache.set(orgId, { token, expiresAt: Date.now() + 60 * 60 * 1000 });
  return token;
}

/**
 * Mints the elevated, single-use token produced by an approval (front-
 * channel mode). Scoped to payments:execute for exactly one deal id and
 * amount via authorization_details — the same shape a CIBA grant would
 * carry, just signed locally instead of by the tenant.
 */
export async function mintElevatedToken(
  orgId: string,
  dealId: string,
  amountCents: number,
  approverUserId: string,
): Promise<string> {
  const jwt = await new SignJWT({
    scope: "payments:execute",
    [ORG_CLAIM]: orgId,
    authorization_details: [
      { type: "procurement_payment", deal_id: dealId, amount: amountCents, currency: "usd" },
    ],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(approverUserId)
    .setIssuedAt()
    .setIssuer(`https://${process.env.AUTH0_DOMAIN || "demo.mandate.dev"}/`)
    .setAudience(process.env.AUTH0_AUDIENCE || "https://api.mandate.dev")
    .setExpirationTime("5m")
    .sign(DEMO_SIGNING_SECRET);
  return jwt;
}

export function getMandateSnapshotForDisplay(orgId: string): Mandate {
  // Only ever used for read-only display fallback (e.g. seeding a Deal's
  // mandateSnapshot before a token has been minted). Authorization decisions
  // must go through verify.ts against the signed token, never this.
  db.orgs.get(orgId); // touch store for parity with real lookups; unused
  return mandateForOrg(orgId);
}
