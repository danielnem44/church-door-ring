// Talks to the WhatsApp Cloud API (Meta).
// If WHATSAPP_TOKEN is not set we run in MOCK mode: messages are only
// printed to the console. Handy for testing on your own computer.
import crypto from "node:crypto";

const GRAPH = "https://graph.facebook.com";

export function isMock() {
  return !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID;
}

async function send(payload) {
  if (isMock()) {
    console.log("[whatsapp:mock] would send:", JSON.stringify(payload));
    return { ok: true, mock: true };
  }
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const res = await fetch(`${GRAPH}/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[whatsapp] send failed", res.status, JSON.stringify(body));
    return { ok: false, status: res.status, error: body?.error?.message || "send failed" };
  }
  return { ok: true, id: body?.messages?.[0]?.id };
}

// The "someone is at the door" message. Uses an approved template
// (see README: template name door_ring, one variable = visitor name,
// one quick-reply button). The button carries the ring id back to us.
export function sendDoorAlert({ to, visitorName, ringId }) {
  return send({
    to,
    type: "template",
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME || "door_ring",
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "nb" },
      components: [
        { type: "body", parameters: [{ type: "text", text: visitorName }] },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [{ type: "payload", payload: `COMING:${ringId}` }],
        },
      ],
    },
  });
}

// Plain text. Only works if that person messaged us in the last 24 hours
// (tapping the button counts), which is exactly when we use it.
export function sendText({ to, text }) {
  return send({ to, type: "text", text: { body: text } });
}

// Checks that a webhook call really comes from Meta.
export function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    if (process.env.VERCEL_ENV === "production") {
      console.error("[whatsapp] WHATSAPP_APP_SECRET missing — rejecting webhook in production.");
      return false;
    }
    console.warn("[whatsapp] WHATSAPP_APP_SECRET not set — skipping signature check (dev only).");
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const given = signatureHeader.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

// Pulls the button taps out of a webhook body:
// returns [{ from: "4791234567", payload: "COMING:abc", profileName }]
export function extractButtonTaps(body) {
  const taps = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const msg of value.messages || []) {
        let payload = null;
        if (msg.type === "button") payload = msg.button?.payload;
        if (msg.type === "interactive") payload = msg.interactive?.button_reply?.id;
        if (payload) taps.push({ from: msg.from, payload, profileName: names[msg.from] });
      }
    }
  }
  return taps;
}
