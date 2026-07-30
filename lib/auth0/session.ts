// User session + org helpers. In DEMO_MODE=mock (or simply when Auth0 isn't
// configured — the "no external service" parachute in CLAUDE.md §14), this
// hands back a fake but shaped-correctly session for the seeded admin user
// so /dashboard and /dashboard/mandate are navigable with zero setup.
import { auth0Configured, getAuth0 } from "../auth0client";
import type { OrgRole } from "../types";
import { SEED_IDS } from "../seed";

export type AppSession = {
  userId: string;
  email: string;
  name: string;
  orgId: string;
  role: OrgRole;
  mocked: boolean;
};

function mockSession(): AppSession {
  return {
    userId: SEED_IDS.adminUser,
    email: "admin@acme-facilities.example",
    name: "Acme Admin",
    orgId: SEED_IDS.buyerOrg,
    role: "admin",
    mocked: true,
  };
}

export async function getAppSession(): Promise<AppSession | null> {
  if (process.env.DEMO_MODE === "mock" || !auth0Configured()) {
    return mockSession();
  }

  const session = await getAuth0().getSession();
  if (!session) return null;

  const user = session.user as Record<string, unknown>;
  const orgId = (user["org_id"] as string) ?? (session as unknown as { org_id?: string }).org_id ?? SEED_IDS.buyerOrg;
  const roles = (user["https://mandate.dev/roles"] as string[]) ?? ["requester"];

  return {
    userId: String(user.sub ?? ""),
    email: String(user.email ?? ""),
    name: String(user.name ?? user.email ?? "Unknown"),
    orgId,
    role: roles.includes("admin") ? "admin" : "requester",
    mocked: false,
  };
}

export function requireAdmin(session: AppSession | null): session is AppSession {
  return Boolean(session && session.role === "admin");
}
