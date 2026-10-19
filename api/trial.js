// TEMP door-ring trial: POST /api/trial → the visitor tapped a "call instead" link.
// Delete after the trial (see lib/trial.js).
import { getStore } from "../lib/store.js";
import { trialCount } from "../lib/trial.js";
import { clientIp } from "../lib/http.js";

export async function POST(request) {
  // One count per phone every 10 seconds, so double taps don't inflate it
  const first = await getStore().set(`rl:call:${clientIp(request)}`, 1, { nx: true, ex: 10 }).catch(() => "OK");
  if (first) await trialCount("calls");
  return new Response(null, { status: 204 });
}
