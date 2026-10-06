// Meta calls this URL when someone on the door team taps "I'm going down".
// GET  = Meta checking the URL once during setup
// POST = real events (button taps, delivery receipts...)
import { getStore } from "../lib/store.js";
import { findMember } from "../lib/team.js";
import { verifySignature, extractButtonTaps, sendText } from "../lib/whatsapp.js";
import { json, monthKey } from "../lib/http.js";

const RING_TTL = 30 * 60;

const TEXT = {
  nb: {
    thanks: "✅ Takk! Den som venter ser nå at du kommer ned.",
    taken: (who) => `👍 ${who} går allerede ned. Takk likevel!`,
    expired: "Denne ringingen er utløpt. Ingen venter lenger.",
  },
  en: {
    thanks: "✅ Thanks! The visitor can now see that you're coming down.",
    taken: (who) => `👍 ${who} is already going down. Thanks anyway!`,
    expired: "This ring has expired. Nobody is waiting anymore.",
  },
};

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  if (
    p.get("hub.mode") === "subscribe" &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(p.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Bad signature", { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const t = TEXT[process.env.TEAM_LANG] || TEXT.nb;
  const store = getStore();

  for (const tap of extractButtonTaps(body)) {
    if (!tap.payload.startsWith("COMING:")) continue;
    const id = tap.payload.slice("COMING:".length);
    const member = findMember(tap.from);
    const who = (member?.name || tap.profileName || "Someone").split(" ")[0];

    const ring = await store.get(`ring:${id}`);
    if (!ring) {
      await sendText({ to: tap.from, text: t.expired });
      continue;
    }

    // First tap wins. Everyone else gets "X is already going down".
    const won = await store.set(`claim:${id}`, who, { nx: true, ex: RING_TTL });
    if (won) {
      ring.status = "coming";
      ring.by = who;
      ring.claimedAt = Date.now();
      await store.set(`ring:${id}`, ring, { ex: RING_TTL });
      await store.incr(`stats:${monthKey()}:claims`).catch(() => {});
      await sendText({ to: tap.from, text: t.thanks });
    } else {
      const winner = (await store.get(`claim:${id}`)) || ring.by || "Someone";
      if (winner !== who) await sendText({ to: tap.from, text: t.taken(winner) });
    }
  }

  // Always answer 200 fast, or Meta keeps retrying
  return json({ ok: true });
}
