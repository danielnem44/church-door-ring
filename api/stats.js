// GET /api/stats?key=YOUR_STATS_KEY → simple numbers to show church leadership:
// how many scanned, rang, got answered — this month and last month.
import { getStore } from "../lib/store.js";
import { json, monthKey } from "../lib/http.js";
import { trialDays } from "../lib/trial.js"; // TEMP door-ring trial

export async function GET(request) {
  // TEMP door-ring trial: Pulse sends the key as an X-Stats-Key header
  const key = request.headers.get("x-stats-key") || new URL(request.url).searchParams.get("key");
  if (!process.env.STATS_KEY || key !== process.env.STATS_KEY) {
    return new Response("Not found", { status: 404 });
  }
  const store = getStore();
  const now = new Date();
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
  const out = {};
  for (const m of [monthKey(now), monthKey(last)]) {
    const get = async (k) => Number((await store.get(`stats:${m}:${k}`)) || 0);
    out[m] = {
      scans: await get("scans"),
      rings: await get("rings"),
      answered: await get("claims"),
    };
  }
  out.trial = await trialDays(7); // TEMP door-ring trial
  return json(out);
}
