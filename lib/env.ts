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

export function auth0Configured(): boolean {
  return Boolean(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID);
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
