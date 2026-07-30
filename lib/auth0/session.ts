import { getAuth0 } from '@/lib/auth0';
import { auth0Configured } from '@/lib/env';

export type SessionUser = {
  sub: string;
  name: string;
  email: string;
  orgId: string;
  role: 'admin' | 'requester';
};

// Zero-config default so every page works with no external services (§14).
export const MOCK_USER: SessionUser = {
  sub: 'mock|alex',
  name: 'Alex Admin',
  email: 'alex@acme.dev',
  orgId: 'org_acme',
  role: 'admin',
};

/**
 * Current user, mapped to the app's shape.
 * Not configured: the mock user, always. Configured: the real Auth0 v4
 * session, or null when there is no session (callers redirect to /auth/login).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!auth0Configured()) return MOCK_USER;
  const auth0 = getAuth0();
  if (!auth0) return MOCK_USER;
  try {
    const session = await auth0.getSession();
    if (!session) return null;
    const u = session.user;
    // Role comes from a custom claim when the Action sets one. Default admin.
    const roleClaim =
      (u['https://mandate.dev/role'] as string | undefined) ??
      (Array.isArray(u['https://mandate.dev/roles'])
        ? ((u['https://mandate.dev/roles'] as string[])[0] as string | undefined)
        : undefined);
    return {
      sub: u.sub,
      name: u.name ?? u.email ?? u.sub,
      email: u.email ?? '',
      orgId: (u.org_id as string | undefined) ?? 'org_acme',
      role: roleClaim === 'requester' ? 'requester' : 'admin',
    };
  } catch {
    return null;
  }
}
