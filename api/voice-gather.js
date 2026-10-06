// Twilio calls this when a door-team member presses a key.
// 1 = "I'm going down". The first person to press 1 wins.
import { getStore } from "../lib/store.js";
import { readTwilioRequest, cancelCall } from "../lib/twilio.js";
import { say, twiml, esc, t } from "../lib/twiml.js";
import { baseUrl, monthKey } from "../lib/http.js";

const RING_TTL = 30 * 60;

export async function POST(request) {
  const base = baseUrl(request);
  const { ok, params, query } = await readTwilioRequest(request, base);
  if (!ok) return new Response("Bad signature", { status: 401 });

  const id = query.get("id") || "";
  const who = (query.get("m") || "Someone").split(" ")[0].slice(0, 30) || "Someone";
  if (!/^[A-Za-z0-9_-]{6,30}$/.test(id)) return twiml(say(t().expired) + "<Hangup/>");

  // Any other key: hear the question again
  if (params.Digits !== "1") {
    const again = `${base}/api/voice?id=${encodeURIComponent(id)}&m=${encodeURIComponent(who)}`;
    return twiml(`<Redirect method="POST">${esc(again)}</Redirect>`);
  }

  const store = getStore();
  const ring = await store.get(`ring:${id}`);
  if (!ring) return twiml(say(t().expired) + "<Hangup/>");

  // First press wins. Everyone after gets "X is already going down".
  const won = await store.set(`claim:${id}`, who, { nx: true, ex: RING_TTL });
  if (!won) {
    const winner = (await store.get(`claim:${id}`)) || "Someone";
    return twiml(say(winner === who ? t().thanks : t().taken(winner)) + "<Hangup/>");
  }

  ring.status = "coming";
  ring.by = who;
  ring.claimedAt = Date.now();
  await store.set(`ring:${id}`, ring, { ex: RING_TTL });
  await store.incr(`stats:${monthKey()}:claims`).catch(() => {});

  // Stop the phones that are still ringing (not this one)
  const sids = (await store.get(`sids:${id}`)) || [];
  await Promise.all(sids.filter((s) => s !== params.CallSid).map(cancelCall));

  return twiml(say(t().thanks) + "<Hangup/>");
}
