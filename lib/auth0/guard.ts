import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from './session';
import { auth0Configured } from '@/lib/env';

/**
 * Page guard for anything that should require a real login.
 *
 * With Auth0 configured and no session, this sends the visitor to
 * /auth/login with returnTo set, so they land back where they were aiming.
 * With Auth0 NOT configured it returns the mock user, because the demo has to
 * keep working with zero external services (§14) - the guard tightens
 * automatically the moment real credentials exist, with no code change.
 */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;
  if (!auth0Configured()) {
    // getSessionUser only returns null when Auth0 IS configured, so this is
    // defensive rather than reachable.
    throw new Error('no_session_and_no_mock');
  }
  redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
}
