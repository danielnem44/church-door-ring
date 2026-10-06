// POST /api/demo-claim {id} → pretend someone on the door team pressed 1.
// ONLY works in test mode (no Twilio keys set), so you can show the whole
// flow to people without making real calls.
import { getStore } from "../lib/store.js";
import { getTeam } from "../lib/team.js";
import { isMock } from "../lib/notify.js";
import { json } from "../lib/http.js";

export async function POST(request) {
  if (!isMock()) return new Response("Not found", { status: 404 });
  const { id } = await request.json().catch(() => ({}));
  const store = getStore();
  const ring = id && (await store.get(`ring:${id}`));
  if (!ring) return json({ error: "not_found" }, 404);
  const who = (getTeam()[0]?.name || "Anna").split(" ")[0];
  if (await store.set(`claim:${id}`, who, { nx: true, ex: 1800 })) {
    ring.status = "coming";
    ring.by = who;
    await store.set(`ring:${id}`, ring, { ex: 1800 });
  }
  return json({ ok: true });
}
