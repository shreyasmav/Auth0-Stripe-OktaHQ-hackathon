// JWT verification — CLAUDE.md §8. The /pay gate reads the mandate and the
// payment scope ONLY from a verified signed token, never from the store.
// Real tenant: verify against the tenant JWKS. No tenant configured (mock
// mode): verify against the same local HS256 secret agent.ts signs with —
// the verification step is real either way, only the key source differs.
import { jwtVerify, createRemoteJWKSet, type JWTVerifyResult } from "jose";
import { MANDATE_CLAIM, ORG_CLAIM } from "./agent";
import type { Mandate } from "../types";

const DEMO_SIGNING_SECRET = new TextEncoder().encode(
  process.env.AUTH0_SECRET || "dev-only-demo-signing-secret-not-for-production",
);

export type VerifiedClaims = {
  sub: string;
  scope: string;
  orgId?: string;
  mandate?: Mandate;
  authorizationDetails?: Array<{ type: string; deal_id: string; amount: number; currency: string }>;
  raw: JWTVerifyResult["payload"];
};

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getRemoteJwks() {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(`https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`));
  }
  return remoteJwks;
}

export class TokenVerificationError extends Error {}

export async function verifyAgentToken(bearerToken: string): Promise<VerifiedClaims> {
  const isRemote = Boolean(process.env.AUTH0_DOMAIN && process.env.AUTH0_AGENT_CLIENT_ID);

  let payload: JWTVerifyResult["payload"];
  try {
    if (isRemote) {
      const result = await jwtVerify(bearerToken, getRemoteJwks(), {
        audience: process.env.AUTH0_AUDIENCE,
      });
      payload = result.payload;
    } else {
      const result = await jwtVerify(bearerToken, DEMO_SIGNING_SECRET, {
        audience: process.env.AUTH0_AUDIENCE || "https://api.mandate.dev",
      });
      payload = result.payload;
    }
  } catch (err) {
    throw new TokenVerificationError(`token verification failed: ${(err as Error).message}`);
  }

  return {
    sub: String(payload.sub ?? ""),
    scope: String(payload.scope ?? ""),
    orgId: payload[ORG_CLAIM] as string | undefined,
    mandate: payload[MANDATE_CLAIM] as Mandate | undefined,
    authorizationDetails: payload["authorization_details"] as VerifiedClaims["authorizationDetails"],
    raw: payload,
  };
}

export function hasScope(claims: VerifiedClaims, scope: string): boolean {
  return claims.scope.split(" ").includes(scope);
}
