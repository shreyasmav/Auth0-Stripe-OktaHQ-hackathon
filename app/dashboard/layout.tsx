import { requireUser } from '@/lib/auth0/guard';

export const dynamic = 'force-dynamic';

/**
 * Login gate for /dashboard and everything under it, including the
 * admin-only mandate page.
 *
 * The dashboard itself is a client component, so the check lives here where
 * it can redirect server-side before any markup ships. With Auth0
 * unconfigured requireUser hands back the mock user and this is a no-op, so
 * the zero-config demo path is unaffected.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUser('/dashboard');
  return <>{children}</>;
}
