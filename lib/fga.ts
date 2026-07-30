// One interface, two implementations. FGA_MODE selects which. In `fga` mode
// this would call Auth0 FGA's check API against a store modeling:
//
//   type: deal
//     relations: buyer_agent, vendor_agent, buyer_admin
//     permissions:
//       view_terms:            buyer_agent | vendor_agent | buyer_admin
//       view_budget_ceiling:   buyer_agent | buyer_admin        # NOT vendor
//       view_vendor_floor:     vendor_agent                     # NOT buyer
//
// In `local` mode we implement the identical tuple checks in-process — same
// answers, only the storage is faked. This is the mechanism that makes the
// vendor agent un-promptinjectable into revealing the buyer's ceiling: it was
// never handed that field in the first place.
import type { Actor } from "./types";

export type DealField = "terms" | "budget_ceiling" | "vendor_floor";

const PERMISSIONS: Record<DealField, Actor[]> = {
  terms: ["buyer_agent", "vendor_agent", "buyer_admin", "vendor_admin"],
  budget_ceiling: ["buyer_agent", "buyer_admin"],
  vendor_floor: ["vendor_agent", "vendor_admin"],
};

function localCanRead(actor: Actor, field: DealField): boolean {
  return PERMISSIONS[field].includes(actor);
}

async function fgaCanRead(actor: Actor, dealId: string, field: DealField): Promise<boolean> {
  const apiUrl = process.env.FGA_API_URL;
  const storeId = process.env.FGA_STORE_ID;
  if (!apiUrl || !storeId) return localCanRead(actor, field);

  try {
    const res = await fetch(`${apiUrl}/stores/${storeId}/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tuple_key: {
          user: `actor:${actor}`,
          relation: `view_${field}`,
          object: `deal:${dealId}`,
        },
      }),
    });
    if (!res.ok) return localCanRead(actor, field);
    const json = await res.json();
    return Boolean(json.allowed);
  } catch {
    return localCanRead(actor, field);
  }
}

/**
 * canRead(actor, dealId, field) — every piece of context handed into an
 * agent's prompt must pass through this. `dealId` is unused in local mode
 * (the permission model is static) but kept in the signature so switching
 * FGA_MODE to `fga` doesn't require touching call sites.
 */
export async function canRead(actor: Actor, dealId: string, field: DealField): Promise<boolean> {
  const mode = process.env.FGA_MODE ?? "local";
  if (mode === "fga") return fgaCanRead(actor, dealId, field);
  return localCanRead(actor, field);
}

export function fgaMode(): "local" | "fga" {
  return process.env.FGA_MODE === "fga" ? "fga" : "local";
}
