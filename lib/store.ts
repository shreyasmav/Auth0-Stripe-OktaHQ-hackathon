import fs from 'node:fs';
import path from 'node:path';
import type { Approval, Deal, EventLogEntry, Job, Org } from './types';
import { seedData } from './seed';

type Store = {
  orgs: Map<string, Org>;
  jobs: Map<string, Job>;
  deals: Map<string, Deal>;
  approvals: Map<string, Approval>;
  events: EventLogEntry[];
};

const SNAPSHOT = path.join(process.cwd(), '.data', 'store.json');

function fresh(): Store {
  const s: Store = { orgs: new Map(), jobs: new Map(), deals: new Map(), approvals: new Map(), events: [] };
  seedData(s.orgs, s.jobs);
  return s;
}

function load(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    return {
      orgs: new Map(raw.orgs),
      jobs: new Map(raw.jobs),
      deals: new Map(raw.deals),
      approvals: new Map(raw.approvals),
      events: raw.events ?? [],
    };
  } catch {
    return fresh();
  }
}

// Pin to globalThis so Next.js hot reload doesn't re-instantiate mid-demo.
const g = globalThis as unknown as { __mandateStore?: Store };
export const store: Store = g.__mandateStore ?? (g.__mandateStore = load());

export function snapshot() {
  try {
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
    fs.writeFileSync(
      SNAPSHOT,
      JSON.stringify({
        orgs: [...store.orgs],
        jobs: [...store.jobs],
        deals: [...store.deals],
        approvals: [...store.approvals],
        events: store.events.slice(-200),
      }),
    );
  } catch {
    // snapshot is best-effort; never let persistence kill a request mid-demo
  }
}

/** Total reset back to seed fixtures. Must be instant: it runs between demo takes. */
export function resetStore() {
  const s = fresh();
  store.orgs = s.orgs;
  store.jobs = s.jobs;
  store.deals = s.deals;
  store.approvals = s.approvals;
  store.events = [];
  try { fs.rmSync(SNAPSHOT, { force: true }); } catch {}
}

let eventSeq = 0;
export function logEvent(source: EventLogEntry['source'], text: string) {
  store.events.push({ id: `evt_${++eventSeq}_${Date.now()}`, source, text, ts: Date.now() });
  if (store.events.length > 200) store.events.splice(0, store.events.length - 200);
  snapshot();
}
