// CIBA — CLAUDE.md §9.4. Requires an Enterprise-tier (or add-on) Auth0
// tenant; assume it's unavailable until confirmed otherwise and treat
// APPROVAL_MODE=frontchannel as the first-class path, not a fallback.
//
// Gotchas that will silently break this:
//   - binding_message: required, <=64 chars, alphanumeric + "+-_.,:#" only.
//     A "$" is rejected — write "850.00 USD", not "$850.00".
//   - requested_expiry must be <=300. Above that Auth0 switches to email
//     delivery and the phone never buzzes.
//   - grant_type is documented as urn:openid:params:grant-type:ciba. If Auth0
//     returns unsupported_grant_type, retry with
//     urn:openid:params:oauth:grant-type:ciba before assuming anything else.
//   - Every `type` in authorization_details must be pre-registered on the API
//     in the dashboard (procurement_payment) or /bc-authorize fails.
import type { Deal } from "../types";

const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";
const CIBA_GRANT_TYPE_FALLBACK = "urn:openid:params:oauth:grant-type:ciba";

export type RarPayload = {
  type: "procurement_payment";
  deal_id: string;
  amount: number;
  currency: string;
  vendor: string;
  scope_of_work: string;
  deadline: string;
};

export function buildBindingMessage(amountCents: number, vendorName: string): string {
  // Alphanumeric + "+-_.,:#" only, 64 char max, no "$".
  const msg = `Approve ${(amountCents / 100).toFixed(2)} USD to ${vendorName}`;
  return msg.replace(/[^A-Za-z0-9+\-_.,:#\s]/g, "").slice(0, 64);
}

export function buildAuthorizationDetails(
  deal: Deal,
  vendorName: string,
  scopeOfWork: string,
  deadline: string,
): RarPayload[] {
  return [
    {
      type: "procurement_payment",
      deal_id: deal.id,
      amount: deal.amountCents ?? 0,
      currency: "usd",
      vendor: vendorName,
      scope_of_work: scopeOfWork,
      deadline,
    },
  ];
}

export async function bcAuthorize(
  approverUserId: string,
  bindingMessage: string,
  authorizationDetails: RarPayload[],
): Promise<{ authReqId: string; interval: number; expiresIn: number }> {
  const params = new URLSearchParams({
    client_id: process.env.AUTH0_CIBA_CLIENT_ID ?? "",
    client_secret: process.env.AUTH0_CIBA_CLIENT_SECRET ?? "",
    login_hint: JSON.stringify({
      format: "iss_sub",
      iss: `https://${process.env.AUTH0_DOMAIN}/`,
      sub: approverUserId,
    }),
    scope: "openid payments:execute",
    audience: process.env.AUTH0_AUDIENCE ?? "",
    binding_message: bindingMessage,
    authorization_details: JSON.stringify(authorizationDetails),
    requested_expiry: "300",
  });

  const res = await fetch(`https://${process.env.AUTH0_DOMAIN}/bc-authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`bc-authorize failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return { authReqId: json.auth_req_id, interval: json.interval ?? 5, expiresIn: json.expires_in ?? 300 };
}

export type CibaPollResult =
  | { status: "approved"; token: string }
  | { status: "pending" }
  | { status: "denied" }
  | { status: "expired" };

export async function pollCiba(authReqId: string, grantType = CIBA_GRANT_TYPE): Promise<CibaPollResult> {
  const params = new URLSearchParams({
    grant_type: grantType,
    auth_req_id: authReqId,
    client_id: process.env.AUTH0_CIBA_CLIENT_ID ?? "",
    client_secret: process.env.AUTH0_CIBA_CLIENT_SECRET ?? "",
  });

  const res = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const json = await res.json().catch(() => ({}));

  if (res.ok) {
    return { status: "approved", token: json.access_token };
  }
  if (json.error === "unsupported_grant_type" && grantType === CIBA_GRANT_TYPE) {
    return pollCiba(authReqId, CIBA_GRANT_TYPE_FALLBACK);
  }
  if (json.error === "authorization_pending" || json.error === "slow_down") {
    return { status: "pending" };
  }
  if (json.error === "access_denied") {
    return { status: "denied" };
  }
  return { status: "expired" };
}
