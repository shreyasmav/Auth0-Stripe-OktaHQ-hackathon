import { auth0Configured, flags, stripeConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

// GET /api/flags -> runtime behavior flags for the client (MOCK chip, auth
// links, mode readouts). Read at request time so env changes show without a
// rebuild.
export async function GET() {
  return Response.json({
    demoMode: flags.demoMode,
    approvalMode: flags.approvalMode,
    negotiationMode: flags.negotiationMode,
    auth0Configured: auth0Configured(),
    stripeConfigured: stripeConfigured(),
  });
}
