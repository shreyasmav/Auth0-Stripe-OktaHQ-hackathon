import { getSessionUser } from '@/lib/auth0/session';
import { auth0Configured } from '@/lib/env';

export const dynamic = 'force-dynamic';

// GET /api/me -> { authConfigured, signedIn, user }
//
// The nav needs to know whether someone is actually signed in, not just
// whether Auth0 is configured. Without this it can only show both Sign in and
// Sign out at once and never say who you are.
export async function GET() {
  const configured = auth0Configured();
  const user = await getSessionUser();
  return Response.json({
    authConfigured: configured,
    // With Auth0 unconfigured getSessionUser returns the mock user, which is
    // a working session for the demo but not a real sign-in. Say which.
    signedIn: Boolean(user) && configured,
    mocked: Boolean(user) && !configured,
    user: user
      ? { name: user.name, email: user.email, orgId: user.orgId, role: user.role }
      : null,
  });
}
