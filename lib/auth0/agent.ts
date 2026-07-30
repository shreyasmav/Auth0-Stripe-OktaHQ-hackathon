import { decodeJwt } from 'jose';
import { BUYER_MANDATE } from '@/lib/seed';

// §9.2: raw client_credentials mint for the agent identity. One POST, no SDK.
// The normal agent token carries deals:negotiate and deals:read only.
// payments:execute is never on this path. That gap is the product.

export type AgentToken = {
  accessToken: string;
  expiresAt: number; // unix seconds
  scope: string;
  mock: boolean;
};

// Cache by org id until 60s before expiry. Pinned to globalThis so a
// Next.js hot reload does not refetch mid-demo.
const g = globalThis as unknown as { __agentTokenCache?: Map<string, AgentToken> };
const cache = g.__agentTokenCache ?? (g.__agentTokenCache = new Map<string, AgentToken>());

/**
 * Mints (or returns a cached) M2M access token for the given org's agent.
 * Never throws. With AUTH0_AGENT_CLIENT_ID missing, returns a clearly fake
 * mock payload so the whole app runs with zero external services.
 */
export async function getAgentToken(orgId: string): Promise<AgentToken> {
  const now = Math.floor(Date.now() / 1000);
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt - 60 > now) return cached;

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_AGENT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_AGENT_CLIENT_SECRET;
  const audience = process.env.AUTH0_AUDIENCE ?? 'https://api.mandate.dev';

  if (!domain || !clientId || !clientSecret) {
    return {
      accessToken: `mock_agent_${orgId}`,
      expiresAt: now + 3600,
      scope: 'deals:negotiate deals:read',
      mock: true,
    };
  }

  try {
    const res = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience,
        organization: orgId,
      }),
    });
    if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
    const data = (await res.json()) as {
      access_token: string;
      expires_in?: number;
      scope?: string;
    };
    const token: AgentToken = {
      accessToken: data.access_token,
      expiresAt: now + (data.expires_in ?? 3600),
      scope: data.scope ?? 'deals:negotiate deals:read',
      mock: false,
    };
    cache.set(orgId, token);
    return token;
  } catch {
    // A failed mint degrades to mock. Short expiry so we retry soon.
    return {
      accessToken: `mock_agent_${orgId}`,
      expiresAt: now + 300,
      scope: 'deals:negotiate deals:read',
      mock: true,
    };
  }
}

/**
 * Display-only claim decode for the token drawer (§12). No verification here.
 * The authorization decision always goes through verifyBearer in verify.ts.
 */
export function decodeAgentClaims(accessToken: string): Record<string, unknown> {
  if (accessToken.startsWith('mock_agent_')) {
    return {
      mock: true,
      sub: 'agt_buyer_01@clients',
      scope: 'deals:negotiate deals:read',
      'https://mandate.dev/org_id': accessToken.replace('mock_agent_', ''),
      'https://mandate.dev/mandate': {
        max_amount: BUYER_MANDATE.maxAmountCents,
        currency: BUYER_MANDATE.currency,
        categories: BUYER_MANDATE.categories,
        expires_at: BUYER_MANDATE.expiresAt,
      },
    };
  }
  try {
    return decodeJwt(accessToken) as Record<string, unknown>;
  } catch {
    return { error: 'undecodable_token' };
  }
}
