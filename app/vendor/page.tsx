import { db } from "@/lib/store";
import { ConnectButton } from "./ConnectButton";

export const dynamic = "force-dynamic";

export default async function VendorPage() {
  const vendors = db.orgs.all().filter((o) => o.kind === "vendor");
  const deals = db.deals.all().filter((d) => vendors.some((v) => v.id === d.vendorOrgId));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold">Vendor orgs</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {vendors.map((vendor) => (
          <div key={vendor.id} className="rounded-lg border border-line bg-panel p-5">
            <div className="text-lg font-semibold">{vendor.name}</div>
            <div className="text-sm text-white/40">Rate ${((vendor.hourlyRateCents ?? 0) / 100).toFixed(2)}/hr</div>
            <div className="mt-3">
              {vendor.stripeAccountId ? (
                <span className="rounded bg-ok/20 px-2 py-1 text-xs font-semibold text-ok">
                  Connected · {vendor.stripeAccountId}
                </span>
              ) : (
                <ConnectButton orgId={vendor.id} />
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold text-white/80">Deals</h2>
      <div className="flex flex-col gap-2">
        {deals.length === 0 && <div className="text-white/40">No deals yet.</div>}
        {deals.map((deal) => (
          <a
            key={deal.id}
            href={`/deals/${deal.id}`}
            className="flex items-center justify-between rounded-lg border border-line bg-panel px-4 py-3 hover:bg-white/5"
          >
            <span>{vendors.find((v) => v.id === deal.vendorOrgId)?.name}</span>
            <span className="text-sm uppercase text-white/50">{deal.state.replace(/_/g, " ")}</span>
          </a>
        ))}
      </div>
    </main>
  );
}
