import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Mandate } from '@/lib/types';
import { BUYER_MANDATE } from '@/lib/seed';
import { store } from '@/lib/store';

// §8: the authorization decision reads verified claims, never the store's
// mandateSnapshot. This module is the only place a bearer token is trusted.

export type VerifiedAgent = {
  scopes: string[];
  mandate?: Mandate;
  orgId?: string;
  authorizationDetails?: Array<{
    type: string;
    deal_id: string;
    amount: number;
    currency: string;
  }>;
  raw: Record<string, unknown>;
};

// JWKS is cached per domain across requests.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksDomain = '';

function getJwks(domain: string) {
  if (!jwks || jwksDomain !== domain) {
    jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    jwksDomain = domain;
  }
  return jwks;
}

/** Maps the custom mandate claim (snake_case per §8) to the app's Mandate. */
function claimToMandate(raw: unknown): Mandate | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.maxAmountCents === 'number') return r as unknown as Mandate;
  if (typeof r.max_amount === 'number') {
    return {
      maxAmountCents: r.max_amount,
      currency: 'usd',
      categories: Array.isArray(r.categories) ? (r.categories as string[]) : [],
      expiresAt: typeof r.expires_at === 'number' ? r.expires_at : 0,
    };
  }
  return undefined;
}

function fromJwtPayload(payload: JWTPayload): VerifiedAgent {
  const scopes =
    typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];
  const mandate = claimToMandate(payload['https://mandate.dev/mandate']);
  const orgId =
    (payload['https://mandate.dev/org_id'] as string | undefined) ??
    (payload.org_id as string | undefined);
  const rawDetails = payload.authorization_details;
  const authorizationDetails = Array.isArray(rawDetails)
    ? rawDetails
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map((d) => ({
          type: String(d.type ?? ''),
          deal_id: String(d.deal_id ?? ''),
          amount: Number(d.amount ?? 0),
          currency: String(d.currency ?? 'usd'),
        }))
    : undefined;
  return { scopes, mandate, orgId, authorizationDetails, raw: payload as Record<string, unknown> };
}

/**
 * Verifies a bearer token and returns what the caller may do.
 *
 * Order of trust:
 * 1. A real JWT verified against the tenant JWKS (agent token or CIBA grant).
 * 2. A front-channel approval grantedToken looked up in the store. Single
 *    use: consumption clears grantedToken, so a spent token no longer matches.
 * 3. Anything else gets negotiate-only scopes. That powers the 403 beat, so
 *    garbage or absent elevation is an expected input here, not an error.
 */
export async function verifyBearer(token: string): Promise<VerifiedAgent> {
  const domain = process.env.AUTH0_DOMAIN;

  if (domain && token.split('.').length === 3) {
    try {
      const { payload } = await jwtVerify(token, getJwks(domain), {
        issuer: `https://${domain}/`,
        audience: process.env.AUTH0_AUDIENCE ?? 'https://api.mandate.dev',
      });
      return fromJwtPayload(payload);
    } catch {
      // Not a valid JWT for this tenant. Try the approval-token path.
    }
  }

  const approval = [...store.approvals.values()].find(
    (a) => a.grantedToken !== undefined && a.grantedToken === token,
  );
  if (approval && approval.status === 'approved') {
    const deal = store.deals.get(approval.dealId);
    return {
      scopes: ['payments:execute', 'deals:negotiate'],
      mandate: BUYER_MANDATE,
      orgId: deal?.buyerOrgId ?? 'org_acme',
      authorizationDetails: [
        {
          type: 'procurement_payment',
          deal_id: approval.dealId,
          amount: deal?.amountCents ?? 0,
          currency: 'usd',
        },
      ],
      raw: { mock: true, approvalId: approval.id, mode: approval.mode },
    };
  }

  return {
    scopes: ['deals:negotiate', 'deals:read'],
    mandate: BUYER_MANDATE,
    orgId: 'org_acme',
    raw: { mock: true, note: 'unverified_token_negotiate_only' },
  };
}
