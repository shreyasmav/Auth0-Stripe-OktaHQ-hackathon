'use client';

import { useEffect, useState } from 'react';
import type { EventLogEntry } from '@/lib/types';

const SOURCE_COLOR: Record<EventLogEntry['source'], string> = {
  auth0: 'text-blue',
  stripe: 'text-green',
  agent: 'text-ink',
  system: 'text-muted',
};

/**
 * Quiet console-style feed. Polls GET /api/events every 2s and shows the
 * last dozen entries, newest first. Free credibility: the system feels alive.
 */
export default function EventFeed() {
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch('/api/events');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { events: EventLogEntry[] };
        if (alive) {
          setEvents((data.events ?? []).slice(-12).reverse());
          setWarn(false);
        }
      } catch {
        if (alive) setWarn(true);
      }
    }
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="card p-5">
      <h3 className="text-[15px] font-medium">Activity</h3>
      {warn && <p className="mt-2 text-[13px] text-amber">Event feed unreachable, retrying…</p>}
      <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto font-mono text-[11px] leading-relaxed">
        {events.length === 0 && !warn && <p className="text-muted">Waiting for activity…</p>}
        {events.map((e) => (
          <div key={e.id} className="flex gap-2">
            <span className="shrink-0 text-muted">
              {new Date(e.ts).toLocaleTimeString('en-US', { hour12: false })}
            </span>
            <span className={`shrink-0 ${SOURCE_COLOR[e.source] ?? 'text-muted'}`}>
              {e.source}
            </span>
            <span className="text-muted">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
