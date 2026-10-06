// POST /api/ring        → visitor taps "Ring the church"
// GET  /api/ring?id=... → visitor's page asks "is someone coming?"
import crypto from "node:crypto";
import { isOpen } from "../lib/schedule.js";
import { getStore } from "../lib/store.js";
import { getTeam } from "../lib/team.js";
import { alertTeam, isMock } from "../lib/notify.js";
import { json, clientIp, monthKey, baseUrl } from "../lib/http.js";

const RING_TTL = 30 * 60; // keep a ring for 30 minutes
const PER_PHONE_COOLDOWN = Number(process.env.RING_COOLDOWN_SECONDS || 45);
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

  // Anti-spam 1: one ring per phone every ~45 seconds
  const ipKey = `rl:ip:${clientIp(request)}`;
  const firstTime = await store.set(ipKey, 1, { nx: true, ex: PER_PHONE_COOLDOWN });
  if (!firstTime) {
    const ttl = await store.ttl(ipKey);
    return json({ error: "too_soon", retryAfter: Math.max(ttl, 1) }, 429);
  }

  // Anti-spam 2: max N rings per 10 minutes in total (protects the door team + the bill)
  const bucket = `rl:global:${Math.floor(Date.now() / 600000)}`;
  const count = await store.incr(bucket);
  if (count === 1) await store.expire(bucket, 600);
  if (count > MAX_PER_10_MIN) return json({ error: "busy" }, 429);

  const id = crypto.randomBytes(9).toString("base64url");
  const ring = { id, name, status: "ringing", createdAt: Date.now(), by: null };
  await store.set(`ring:${id}`, ring, { ex: RING_TTL });

  // Ring everyone on the door team at the same time
  const { delivered, sids } = await alertTeam({ team, ringId: id, visitorName: name, baseUrl: baseUrl(request) });

  // Remember the call ids (separate key, so we never overwrite a claim) to stop the other phones later
  if (sids.length) await store.set(`sids:${id}`, sids, { ex: RING_TTL });
  await store.incr(`stats:${monthKey()}:rings`).catch(() => {});

  if (delivered === 0) return json({ error: "send_failed", id }, 502);
  return json({ id, notified: delivered, mock: isMock() });
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[A-Za-z0-9_-]{6,30}$/.test(id)) return json({ error: "bad_id" }, 400);

  const ring = await getStore().get(`ring:${id}`);
  if (!ring) return json({ error: "not_found" }, 404);

  return json({
    status: ring.status, // "ringing" | "coming"
    by: ring.by,
    elapsed: Math.round((Date.now() - ring.createdAt) / 1000),
  });
}
