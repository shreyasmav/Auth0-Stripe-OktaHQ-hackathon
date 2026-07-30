import { logEvent, resetStore } from '@/lib/store';

// POST /api/seed -> {ok:true}. Instant and total reset back to the §11.1
// fixtures. Runs between demo takes, so no auth and no ceremony.
export async function POST() {
  resetStore();
  logEvent('system', 'Store reset to seed fixtures.');
  return Response.json({ ok: true });
}
