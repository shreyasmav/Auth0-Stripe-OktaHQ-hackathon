// §9.4: CIBA over raw fetch. bc-authorize, then poll the token endpoint.
// The approval layer catches CibaUnavailableError and falls back to the
// front channel, which is a first-class path, not a consolation prize.

/** Thrown when the tenant cannot do CIBA (missing env, no add-on, bad RAR). */
export class CibaUnavailableError extends Error {
  constructor(reason: string) {
    super(`CIBA unavailable: ${reason}`);
    this.name = 'CibaUnavailableError';
  }
}

type CibaEnv = {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
};

function cibaEnv(): CibaEnv {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CIBA_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CIBA_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    throw new CibaUnavailableError('missing AUTH0_DOMAIN or AUTH0_CIBA_* env');
  }
  return {
    domain,
    clientId,
    clientSecret,
    audience: process.env.AUTH0_AUDIENCE ?? 'https://api.mandate.dev',
  };
}

/**
 * binding_message rules that bite: max 64 chars, alphanumeric plus space
 * and +-_.,:# only. A dollar sign gets the whole request rejected.
 */
export function sanitizeBindingMessage(msg: string): string {
  return msg.replace(/[^a-zA-Z0-9 +\-_.,:#]/g, '').slice(0, 64);
}

export type CibaStart = {
  authReqId: string;
  interval: number; // seconds between polls
  expiresIn: number; // seconds until the request expires
};

/** Starts a backchannel authentication request. Push goes to the approver's phone. */
export async function startCiba(opts: {
  approverSub: string;
  bindingMessage: string;
  authorizationDetails: unknown[];
}): Promise<CibaStart> {
  const { domain, clientId, clientSecret, audience } = cibaEnv();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    login_hint: JSON.stringify({
      format: 'iss_sub',
      iss: `https://${domain}/`,
      sub: opts.approverSub,
    }),
    scope: 'openid payments:execute',
    audience,
    binding_message: sanitizeBindingMessage(opts.bindingMessage),
    // The RAR type must be pre-registered on the API or this call fails.
    authorization_details: JSON.stringify(opts.authorizationDetails),
    // Must stay at or under 300. Above that Auth0 switches to email delivery
    // and the phone never buzzes.
    requested_expiry: '300',
  });

  let res: Response;
  try {
    res = await fetch(`https://${domain}/bc-authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    throw new CibaUnavailableError(`bc-authorize network error: ${String(err)}`);
  }
  if (!res.ok) {
    // Typical causes: tenant lacks the CIBA add-on, RAR type not registered.
    throw new CibaUnavailableError(`bc-authorize returned ${res.status}`);
  }
  const data = (await res.json()) as {
    auth_req_id: string;
    interval?: number;
    expires_in?: number;
  };
  return {
    authReqId: data.auth_req_id,
    interval: data.interval ?? 5,
    expiresIn: Math.min(data.expires_in ?? 300, 300),
  };
}

export type CibaPoll =
  | { status: 'pending'; slowDown?: boolean }
  | { status: 'approved'; accessToken: string; authorizationDetails?: unknown }
  | { status: 'denied' }
  | { status: 'expired' };

const GRANT_PRIMARY = 'urn:openid:params:grant-type:ciba';
const GRANT_FALLBACK = 'urn:openid:params:oauth:grant-type:ciba';
// The docs show the primary form. Some references show the oauth variant.
// On unsupported_grant_type we switch once and remember.
let grantType = GRANT_PRIMARY;

/**
 * One poll of the token endpoint for a pending CIBA request.
 * Server-side only. The browser polls our API, never Auth0 directly.
 */
export async function pollCiba(authReqId: string): Promise<CibaPoll> {
  const { domain, clientId, clientSecret } = cibaEnv();

  const attempt = async (grant: string) => {
    const res = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: grant,
        auth_req_id: authReqId,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    return { res, data };
  };

  let { res, data } = await attempt(grantType);
  if (!res.ok && data.error === 'unsupported_grant_type' && grantType === GRANT_PRIMARY) {
    grantType = GRANT_FALLBACK;
    ({ res, data } = await attempt(grantType));
  }

  if (res.ok) {
    return {
      status: 'approved',
      accessToken: String(data.access_token),
      authorizationDetails: data.authorization_details,
    };
  }
  switch (data.error) {
    case 'authorization_pending':
      return { status: 'pending' };
    case 'slow_down':
      return { status: 'pending', slowDown: true };
    case 'access_denied':
      return { status: 'denied' };
    case 'expired_token':
      return { status: 'expired' };
    default:
      // Transient or unknown. Keep polling until the deadline passes.
      return { status: 'pending' };
  }
}
