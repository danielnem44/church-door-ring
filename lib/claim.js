// Shared "I'm going down" logic for the text-message link. First one wins.
import { getStore } from "./store.js";
import { cancelCall } from "./twilio.js";
import { monthKey } from "./http.js";

const RING_TTL = 30 * 60;

// Returns { result: "won" | "taken" | "expired", by }
export async function claimRing(id, who) {
  const store = getStore();
  const ring = await store.get(`ring:${id}`);
  if (!ring) return { result: "expired" };

  const won = await store.set(`claim:${id}`, who, { nx: true, ex: RING_TTL });
  if (!won) {
    const winner = (await store.get(`claim:${id}`)) || ring.by || "Someone";
    return { result: winner === who ? "won" : "taken", by: winner };
  }

  ring.status = "coming";
  ring.by = who;
  ring.claimedAt = Date.now();
  await store.set(`ring:${id}`, ring, { ex: RING_TTL });
  await store.incr(`stats:${monthKey()}:claims`).catch(() => {});

  // Stop the phones that are still ringing
  const sids = (await store.get(`sids:${id}`)) || [];
  await Promise.all(sids.map(cancelCall));
  return { result: "won", by: who };
}
