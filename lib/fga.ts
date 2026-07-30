// §9.5: one interface, two implementations, FGA_MODE selects.
// Every field handed into an agent's prompt context goes through canRead().
// The vendor agent cannot be prompt-injected into leaking the buyer's
// ceiling because it was never given the ceiling in the first place.

export type FgaActor = 'buyer_agent' | 'vendor_agent' | 'buyer_admin';
export type FgaField = 'view_terms' | 'view_budget_ceiling' | 'view_vendor_floor';

// The tuple model, identical in both modes. local mode fakes the storage,
// never the answers.
const TUPLES: Record<FgaField, FgaActor[]> = {
  view_terms: ['buyer_agent', 'vendor_agent', 'buyer_admin'],
  view_budget_ceiling: ['buyer_agent', 'buyer_admin'], // NOT the vendor
  view_vendor_floor: ['vendor_agent'], // NOT the buyer
};

type FgaToken = { accessToken: string; expiresAt: number };
const g = globalThis as unknown as { __fgaToken?: FgaToken };

async function getFgaToken(apiUrl: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (g.__fgaToken && g.__fgaToken.expiresAt - 60 > now) return g.__fgaToken.accessToken;

  const clientId = process.env.FGA_CLIENT_ID;
  const clientSecret = process.env.FGA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const audience = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const res = await fetch('https://auth.fga.dev/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    g.__fgaToken = {
      accessToken: data.access_token,
      expiresAt: now + (data.expires_in ?? 3600),
    };
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Remote check against the Auth0 FGA HTTP API. Returns null on any failure
 * so the caller can fall back to the identical local tuple logic. A dead
 * FGA endpoint must never take the demo down.
 */
async function checkRemote(
  actor: FgaActor,
  dealId: string,
  field: FgaField,
): Promise<boolean | null> {
  const apiUrl = process.env.FGA_API_URL;
  const storeId = process.env.FGA_STORE_ID;
  if (!apiUrl || !storeId) return null;

  const token = await getFgaToken(apiUrl);
  if (!token) return null;

  try {
    const base = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const res = await fetch(`${base}/stores/${storeId}/check`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        // Tuple naming must match the model written to the FGA store.
        tuple_key: {
          user: `user:${actor}`,
          relation: field,
          object: `deal:${dealId}`,
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { allowed?: boolean };
    return data.allowed === true;
  } catch {
    return null;
  }
}

/**
 * May this actor read this field of this deal?
 * FGA_MODE=fga asks the real store and falls back to local on failure.
 * Everything else answers from the in-process tuples.
 */
export async function canRead(
  actor: FgaActor,
  dealId: string,
  field: FgaField,
): Promise<boolean> {
  if (process.env.FGA_MODE === 'fga') {
    const remote = await checkRemote(actor, dealId, field);
    if (remote !== null) return remote;
  }
  return TUPLES[field].includes(actor);
}
