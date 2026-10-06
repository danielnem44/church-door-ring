// The page behind the text-message link.
// GET  /api/claim?id=&m=&k= → who has it now? (nothing changes, so link previews can't claim)
// POST /api/claim           → { id, m, k } the person taps "I'm going down"
import { getStore } from "../lib/store.js";
import { claimToken } from "../lib/twilio.js";
import { claimRing } from "../lib/claim.js";
import { json } from "../lib/http.js";
import crypto from "node:crypto";

const okId = (id) => /^[A-Za-z0-9_-]{6,30}$/.test(id);
const clean = (m) => String(m || "").split(" ")[0].replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 30);
function valid(id, m, k) {
  if (!okId(id) || !m || !k) return false;
  const a = Buffer.from(claimToken(id, m));
  const b = Buffer.from(String(k));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const id = p.get("id") || "";
  const m = clean(p.get("m"));
  if (!valid(id, m, p.get("k"))) return json({ error: "bad_link" }, 403);
  const ring = await getStore().get(`ring:${id}`);
  if (!ring) return json({ status: "expired" });
  return json({ status: ring.status, by: ring.by, visitor: ring.name || "" });
}

export async function POST(request) {
  let b = {};
  try {
    b = await request.json();
  } catch {}
  const id = String(b.id || "");
  const m = clean(b.m);
  if (!valid(id, m, b.k)) return json({ error: "bad_link" }, 403);
  const r = await claimRing(id, m);
  return json({ status: r.result === "expired" ? "expired" : "coming", result: r.result, by: r.by });
}
