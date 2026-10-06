// Alerts the door team. Channel is set with NOTIFY_CHANNEL:
//   call      (default) → everyone's phone rings, press 1 to take it
//   whatsapp            → WhatsApp message with a button (needs Meta setup)
//   both                → both at the same time
import { twilioConfigured, placeCall } from "./twilio.js";
import * as wa from "./whatsapp.js";

export function channel() {
  const c = String(process.env.NOTIFY_CHANNEL || "call").toLowerCase();
  return ["call", "whatsapp", "both"].includes(c) ? c : "call";
}

// Test mode = nothing is really sent, it is only printed in the console
export function isMock() {
  const c = channel();
  const callOk = twilioConfigured();
  const waOk = !wa.isMock();
  if (c === "call") return !callOk;
  if (c === "whatsapp") return !waOk;
  return !callOk && !waOk;
}

// Returns { delivered, sids } — how many were reached, and the Twilio call ids
export async function alertTeam({ team, ringId, visitorName, baseUrl }) {
  const c = channel();
  const mock = isMock();
  let delivered = 0;
  const sids = [];
  const jobs = [];

  if (c !== "whatsapp") {
    for (const m of team) {
      jobs.push(
        (async () => {
          if (!twilioConfigured()) {
            if (mock) {
              console.log(`[call:mock] would ring ${m.name} (+${m.number})`);
              delivered++;
            }
            return;
          }
          const url = `${baseUrl}/api/voice?id=${encodeURIComponent(ringId)}&m=${encodeURIComponent(m.name)}`;
          const r = await placeCall({ to: m.number, url });
          if (r.ok) {
            delivered++;
            sids.push(r.sid);
          }
        })()
      );
    }
  }

  if (c !== "call") {
    for (const m of team) {
      if (wa.isMock() && !mock) continue;
      jobs.push(
        wa.sendDoorAlert({ to: m.number, visitorName: visitorName || (process.env.TEAM_LANG === "nb" ? "(uten navn)" : "(no name)"), ringId }).then((r) => {
          if (r.ok) delivered++;
        })
      );
    }
  }

  await Promise.all(jobs);
  return { delivered, sids };
}
