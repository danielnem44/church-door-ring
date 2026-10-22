// POST /api/ring        → visitor taps "Ring the church"
// GET  /api/ring?id=... → visitor's page asks "is someone coming?"
import crypto from "node:crypto";
import { isOpen } from "../lib/schedule.js";
import { getStore } from "../lib/store.js";
import { getTeam } from "../lib/team.js";
import { alertTeam, callTeam, isMock } from "../lib/notify.js";
import { json, clientIp, monthKey, baseUrl } from "../lib/http.js";

const RING_TTL = 30 * 60; // keep a ring for 30 minutes
// Same phone scanning again within this time joins the ring it already has (nobody gets rung twice)
const REPEAT_WINDOW = Number(process.env.RING_REPEAT_SECONDS || process.env.RING_COOLDOWN_SECONDS || 60);
const MAX_PER_10_MIN = Number(process.env.MAX_RINGS_PER_10_MIN || 8);

function cleanName(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001f\u007f<>{}&"'`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export async function POST(request) {
  if (!isOpen()) return json({ error: "closed" }, 403);

  const team = getTeam();
  if (team.length === 0) {
    console.error("[ring] DOOR_TEAM is empty");
    return json({ error: "not_configured" }, 500);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }
  const name = cleanName(body.name);
  const store = getStore();

  // Anti-spam 1: the same phone scanning again just follows its first ring (no new calls or texts)
  const id = crypto.randomBytes(9).toString("base64url");
  const ipKey = `rl:ip:${clientIp(request)}`;
  const firstTime = await store.set(ipKey, id, { nx: true, ex: REPEAT_WINDOW });
  if (!firstTime) {
    const prior = await store.get(ipKey);
    if (prior && /^[A-Za-z0-9_-]{6,30}$/.test(String(prior))) {
      return json({ id: prior, notified: 0, repeat: true, mock: isMock() });
    }
    await store.set(ipKey, id, { ex: REPEAT_WINDOW });
  }

  // Anti-spam 2: max N rings per 10 minutes in total (protects the door team + the bill)
  const bucket = `rl:global:${Math.floor(Date.now() / 600000)}`;
  const count = await store.incr(bucket);
  if (count === 1) await store.expire(bucket, 600);
  if (count > MAX_PER_10_MIN) return json({ error: "busy" }, 429);

  const ring = { id, name, status: "ringing", createdAt: Date.now(), by: null };
  await store.set(`ring:${id}`, ring, { ex: RING_TTL });

  // Ring everyone on the door team at the same time
  const { delivered, sids, callsDelayed, delay } = await alertTeam({ team, ringId: id, visitorName: name, baseUrl: baseUrl(request) });

  // Remember the call ids (separate key, so we never overwrite a claim) to stop the other phones later
  if (sids.length) await store.set(`sids:${id}`, sids, { ex: RING_TTL });
  await store.incr(`stats:${monthKey()}:rings`).catch(() => {});

  // Texts went out first. If nobody taps the link in time, the visitor's page poll starts the calls (see GET).
  if (callsDelayed) await store.set(`callat:${id}`, Date.now() + delay * 1000, { ex: RING_TTL });

  if (delivered === 0) {
    await store.expire(ipKey, 1).catch(() => {}); // let them try again straight away
    return json({ error: "send_failed", id }, 502);
  }
  return json({ id, notified: delivered, mock: isMock() });
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[A-Za-z0-9_-]{6,30}$/.test(id)) return json({ error: "bad_id" }, 400);

  const store = getStore();
  const ring = await store.get(`ring:${id}`);
  if (!ring) return json({ error: "not_found" }, 404);

  // Nobody tapped the text link in time? Now the phones ring (only once per ring).
  if (ring.status === "ringing") {
    const callAt = await store.get(`callat:${id}`);
    if (callAt && Date.now() >= Number(callAt) && (await store.set(`callnow:${id}`, 1, { nx: true, ex: RING_TTL }))) {
      const claimed = await store.get(`claim:${id}`);
      if (!claimed) {
        const { sids } = await callTeam({ team: getTeam(), ringId: id, baseUrl: baseUrl(request) });
        if (sids.length) await store.set(`sids:${id}`, sids, { ex: RING_TTL });
      }
    }
  }

  return json({
    status: ring.status, // "ringing" | "coming"
    by: ring.by,
    elapsed: Math.round((Date.now() - ring.createdAt) / 1000),
  });
}
