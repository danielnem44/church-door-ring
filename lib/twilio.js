// Phone calls through Twilio (no Facebook needed).
// Flow: we ask Twilio to call each door team member. When they pick up,
// Twilio asks OUR server what to say (api/voice.js). They press 1 → api/voice-gather.js.
import crypto from "node:crypto";

export function twilioConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

function auth() {
  return "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
}

const callsUrl = () => `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls`;

// Rings one phone. `to` = digits only with country code, e.g. 4791234567
export async function placeCall({ to, url }) {
  const res = await fetch(`${callsUrl()}.json`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      To: `+${to}`,
      From: process.env.TWILIO_FROM,
      Url: url,
      Method: "POST",
      Timeout: String(process.env.CALL_RING_SECONDS || 30), // ring this long before giving up
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[twilio] call failed", res.status, body?.code, body?.message);
    return { ok: false, error: body?.message || "call failed" };
  }
  return { ok: true, sid: body.sid };
}

// Sends one text message. `to` = digits only with country code.
export async function sendSms({ to, body }) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: `+${to}`, From: process.env.TWILIO_FROM, Body: body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[twilio] sms failed", res.status, data?.code, data?.message);
    return { ok: false, error: data?.message || "sms failed" };
  }
  return { ok: true, sid: data.sid };
}

// A short secret code in each text link, so only the person who got the text can claim.
export function claimToken(id, member) {
  const secret = process.env.CLAIM_SECRET || process.env.TWILIO_AUTH_TOKEN || "dev-only";
  return crypto.createHmac("sha256", secret).update(`${id}|${member}`).digest("hex").slice(0, 16);
}

// Stops a phone that is still ringing (used when someone else already answered).
// Phones that are already mid-call are left alone; they will just hear "already taken".
export async function cancelCall(sid) {
  try {
    await fetch(`${callsUrl()}/${encodeURIComponent(sid)}.json`, {
      method: "POST",
      headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ Status: "canceled" }),
    });
  } catch (e) {
    console.error("[twilio] cancel failed", e);
  }
}

// Checks that a request really comes from Twilio (X-Twilio-Signature).
// fullUrl must be the exact public URL Twilio called, including ?query.
export function verifyTwilioSignature(fullUrl, params, signature) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    if (process.env.VERCEL_ENV === "production") {
      console.error("[twilio] TWILIO_AUTH_TOKEN missing — rejecting request in production.");
      return false;
    }
    return true; // local testing only
  }
  if (!signature) return false;
  const data = fullUrl + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", token).update(data, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Reads a request from Twilio and checks its signature.
// Returns { ok, params, query }
export async function readTwilioRequest(request, baseUrl) {
  const u = new URL(request.url);
  let params = {};
  if (request.method === "POST") {
    const raw = await request.text();
    params = Object.fromEntries(new URLSearchParams(raw));
  }
  const ok = verifyTwilioSignature(`${baseUrl}${u.pathname}${u.search}`, params, request.headers.get("x-twilio-signature"));
  return { ok, params, query: u.searchParams };
}
