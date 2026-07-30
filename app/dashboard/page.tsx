import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/auth0/session";
import { db } from "@/lib/store";
import { getMandateSnapshotForDisplay } from "@/lib/auth0/agent";
import { NewJobForm } from "./NewJobForm";

// Reads the live in-memory store; prerendering it would bake in an empty
// deal list at build time.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getAppSession();
  if (!session) redirect("/");

  const org = db.orgs.get(session.orgId);
  const jobs = db.jobs.all().filter((j) => j.buyerOrgId === session.orgId);
  const deals = db.deals.all().filter((d) => d.buyerOrgId === session.orgId).sort((a, b) => b.createdAt - a.createdAt);
  const mandate = getMandateSnapshotForDisplay(session.orgId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      {session.mocked && (
        <div className="mb-6 inline-block rounded bg-white/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white/60">
          MOCK
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{org?.name ?? "Buyer org"}</h1>
          <p className="text-white/50">
            Signed in as {session.name} · {session.role}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded bg-panel px-3 py-1 text-sm uppercase text-white/60">{org?.tier ?? "free"}</span>
          {session.role === "admin" && (
            <a href="/dashboard/mandate" className="rounded border border-line px-3 py-1 text-sm hover:bg-panel">
              Mandate settings
            </a>
          )}
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-line bg-panel p-5">
        <div className="text-xs uppercase tracking-wide text-white/50">Agent mandate ceiling</div>
        <div className="text-3xl font-semibold tabular-nums">${(mandate.maxAmountCents / 100).toFixed(2)}</div>
        <div className="mt-1 text-sm text-white/40">Categories: {mandate.categories.join(", ")}</div>
      </div>

      <NewJobForm />

      <h2 className="mb-3 mt-10 text-lg font-semibold text-white/80">Deals</h2>
      <div className="flex flex-col gap-2">
        {deals.length === 0 && <div className="text-white/40">No deals yet — start a job above.</div>}
        {deals.map((deal) => (
          <a
            key={deal.id}
            href={`/deals/${deal.id}`}
            className="flex items-center justify-between rounded-lg border border-line bg-panel px-4 py-3 hover:bg-white/5"
          >
            <span>{jobs.find((j) => j.id === deal.jobId)?.title ?? deal.jobId}</span>
            <span className="text-sm uppercase text-white/50">{deal.state.replace(/_/g, " ")}</span>
          </a>
        ))}
      </div>
    </main>
  );
}
