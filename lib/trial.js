// TEMP door-ring trial: per-day numbers for the one-week Pulse panel.
// Delete this file, api/trial.js and every "TEMP door-ring trial" line after the trial.
import { getStore } from "./store.js";
import { localParts } from "./schedule.js";

const KEEP = 35 * 24 * 3600; // keep trial numbers ~5 weeks, then Redis drops them

const day = (date = new Date()) => localParts(date).isoDate;

// kind: "scans" | "rings" | "calls"
export async function trialCount(kind) {
  try {
    const store = getStore();
    const k = `trial:${day()}:${kind}`;
    if ((await store.incr(k)) === 1) await store.expire(k, KEEP);
  } catch (e) {
    console.error("[trial] count failed", e);
  }
}

// Call right after a ring is claimed. Counted on the day the ring started.
export async function trialAnswered(ring) {
  try {
    const store = getStore();
    const k = `trial:${day(new Date(ring.createdAt))}:answers`;
    const list = (await store.get(k)) || [];
    list.push({ s: Math.round((ring.claimedAt - ring.createdAt) / 1000), by: ring.by || "Someone" });
    await store.set(k, list, { ex: KEEP });
  } catch (e) {
    console.error("[trial] answer failed", e);
  }
}

// Last `days` days in church time, oldest first
export async function trialDays(days = 7) {
  const store = getStore();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = day(new Date(Date.now() - i * 864e5));
    const get = async (kind) => Number((await store.get(`trial:${date}:${kind}`)) || 0);
    const answers = (await store.get(`trial:${date}:answers`)) || [];
    const rings = await get("rings");
    const by = {};
    for (const a of answers) by[a.by] = (by[a.by] || 0) + 1;
    out.push({
      date,
      scans: await get("scans"),
      rings,
      answered: answers.length,
      missed: Math.max(0, rings - answers.length),
      answerSeconds: answers.map((a) => a.s),
      calls: await get("calls"),
      by,
    });
  }
  return out;
}
