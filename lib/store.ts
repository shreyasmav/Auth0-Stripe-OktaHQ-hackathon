// In-memory singleton, pinned to globalThis so Next.js hot-reload doesn't
// re-instantiate it mid-demo. Snapshots to .data/store.json on every write so
// a dev-server restart doesn't wipe state. No database — if you find yourself
// wanting one, you're building the wrong thing (see CLAUDE.md §7.4).
import fs from "node:fs";
import path from "node:path";
import type { Org, Job, Deal, Approval } from "./types";

type StoreShape = {
  orgs: Map<string, Org>;
  jobs: Map<string, Job>;
  deals: Map<string, Deal>;
  approvals: Map<string, Approval>;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const SNAPSHOT_PATH = path.join(DATA_DIR, "store.json");

function emptyStore(): StoreShape {
  return {
    orgs: new Map(),
    jobs: new Map(),
    deals: new Map(),
    approvals: new Map(),
  };
}

function loadSnapshot(): StoreShape {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
    const json = JSON.parse(raw);
    return {
      orgs: new Map(Object.entries(json.orgs ?? {})),
      jobs: new Map(Object.entries(json.jobs ?? {})),
      deals: new Map(Object.entries(json.deals ?? {})),
      approvals: new Map(Object.entries(json.approvals ?? {})),
    };
  } catch {
    return emptyStore();
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __mandateStore: StoreShape | undefined;
}

const store: StoreShape = globalThis.__mandateStore ?? loadSnapshot();
if (!globalThis.__mandateStore) {
  globalThis.__mandateStore = store;
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const json = {
      orgs: Object.fromEntries(store.orgs),
      jobs: Object.fromEntries(store.jobs),
      deals: Object.fromEntries(store.deals),
      approvals: Object.fromEntries(store.approvals),
    };
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(json, null, 2));
  } catch {
    // Best-effort snapshot. A failed write should never break the demo.
  }
}

export const db = {
  orgs: {
    get: (id: string) => store.orgs.get(id),
    all: () => Array.from(store.orgs.values()),
    put: (org: Org) => {
      store.orgs.set(org.id, org);
      persist();
    },
  },
  jobs: {
    get: (id: string) => store.jobs.get(id),
    all: () => Array.from(store.jobs.values()),
    put: (job: Job) => {
      store.jobs.set(job.id, job);
      persist();
    },
  },
  deals: {
    get: (id: string) => store.deals.get(id),
    all: () => Array.from(store.deals.values()),
    put: (deal: Deal) => {
      store.deals.set(deal.id, deal);
      persist();
    },
  },
  approvals: {
    get: (id: string) => store.approvals.get(id),
    all: () => Array.from(store.approvals.values()),
    put: (approval: Approval) => {
      store.approvals.set(approval.id, approval);
      persist();
    },
  },
  reset: (fresh: StoreShape) => {
    store.orgs = fresh.orgs;
    store.jobs = fresh.jobs;
    store.deals = fresh.deals;
    store.approvals = fresh.approvals;
    persist();
  },
};
