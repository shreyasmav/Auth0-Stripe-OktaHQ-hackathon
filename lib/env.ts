// Behavior flags (CLAUDE.md §4). Read lazily via getters so process.env is
// consulted at request time, not at module load. Defaults are the parachute
// combination: mock + frontchannel + scripted runs with zero external services.

export const flags: {
  demoMode: 'live' | 'mock';
  approvalMode: 'ciba' | 'frontchannel';
  negotiationMode: 'llm' | 'scripted';
} = {
  get demoMode(): 'live' | 'mock' {
    return process.env.DEMO_MODE === 'live' ? 'live' : 'mock';
  },
  get approvalMode(): 'ciba' | 'frontchannel' {
    return process.env.APPROVAL_MODE === 'ciba' ? 'ciba' : 'frontchannel';
  },
  get negotiationMode(): 'llm' | 'scripted' {
    return process.env.NEGOTIATION_MODE === 'llm' ? 'llm' : 'scripted';
  },
};

/**
 * True only when the FULL set the v4 client needs is present.
 *
 * Checking domain and client id alone lets a half-filled .env.local look
 * configured, then fail inside the Auth0Client constructor and silently fall
 * back to the mock user - which reads as "login is broken" rather than
 * "login is not set up". Requiring all four makes the state unambiguous.
 */
export function auth0Configured(): boolean {
  return Boolean(
    process.env.AUTH0_DOMAIN &&
      process.env.AUTH0_CLIENT_ID &&
      process.env.AUTH0_CLIENT_SECRET &&
      process.env.AUTH0_SECRET &&
      process.env.APP_BASE_URL,
  );
}

/** Names the env vars still missing, for a precise setup error in the UI. */
export function auth0MissingVars(): string[] {
  return (
    ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'APP_BASE_URL'] as const
  ).filter((k) => !process.env[k]);
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Connected account that receives the vendor's share.
 *
 * Vendors normally get an account id by completing Connect onboarding on
 * /vendor. This is the override for a demo where that has not been done: set
 * STRIPE_ACCOUNT_ID and every deal routes its destination charge there.
 *
 * It must be a connected account of the platform that STRIPE_SECRET_KEY
 * belongs to. An account id from a different platform is rejected by Stripe
 * with "No such destination", so check the key and the account agree.
 */
export function defaultConnectedAccount(): string | undefined {
  const id = process.env.STRIPE_ACCOUNT_ID?.trim();
  return id && id.startsWith('acct_') ? id : undefined;
}

/** Stripe Projects id, recorded in the event feed for traceability only. */
export function stripeProjectId(): string | undefined {
  return process.env.STRIPE_PROJECT_ID?.trim() || undefined;
}
