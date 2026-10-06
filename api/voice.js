// Twilio calls this when a door-team member PICKS UP.
// We answer with TwiML: "Someone is waiting… press 1 if you're going down."
import { getStore } from "../lib/store.js";
import { readTwilioRequest } from "../lib/twilio.js";
import { say, twiml, esc, t, church } from "../lib/twiml.js";
import { baseUrl } from "../lib/http.js";

async function handle(request) {
  const base = baseUrl(request);
  const { ok, query } = await readTwilioRequest(request, base);
  if (!ok) return new Response("Bad signature", { status: 401 });

  const id = query.get("id") || "";
  const member = (query.get("m") || "").split(" ")[0].slice(0, 30);
  if (!/^[A-Za-z0-9_-]{6,30}$/.test(id)) return twiml(say(t().expired) + "<Hangup/>");

  const store = getStore();
  const ring = await store.get(`ring:${id}`);
  if (!ring) return twiml(say(t().expired) + "<Hangup/>");

  // Someone already took it? Tell this person and hang up.
  const winner = await store.get(`claim:${id}`);
  if (winner) return twiml(say(t().taken(winner)) + "<Hangup/>");

  const action = `${base}/api/voice-gather?id=${encodeURIComponent(id)}&m=${encodeURIComponent(member)}`;
  const gather =
    `<Gather input="dtmf" numDigits="1" finishOnKey="" timeout="8" action="${esc(action)}" method="POST">` +
    say(t().ask(church(), ring.name)) +
    `</Gather>`;
  // Two chances to press 1, then goodbye
  return twiml(gather + gather + say(t().noInput) + "<Hangup/>");
}

export const POST = handle;
export const GET = handle;
