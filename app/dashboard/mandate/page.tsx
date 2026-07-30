import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/auth0/session";
import { getMandateSnapshotForDisplay } from "@/lib/auth0/agent";
import { MandateForm } from "./MandateForm";

export const dynamic = "force-dynamic";

export default async function MandatePage() {
  const session = await getAppSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/dashboard");

  const mandate = getMandateSnapshotForDisplay(session.orgId);

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold">Agent mandate</h1>
      <p className="mb-8 text-white/50">
        This ceiling is stamped as a custom claim on the agent&rsquo;s Auth0 access token by the Client Credentials
        Exchange Action. Changing it here invalidates the cached token — the next negotiation mints a fresh one with
        the new ceiling.
      </p>
      <MandateForm initialMaxAmountCents={mandate.maxAmountCents} categories={mandate.categories} />
    </main>
  );
}
