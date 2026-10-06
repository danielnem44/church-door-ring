// Alerts the door team. Channel is set with NOTIFY_CHANNEL:
//   call      (default) → everyone's phone rings, press 1 to take it
//   whatsapp            → WhatsApp message with a button (needs Meta setup)
//   both                → both at the same time
import { twilioConfigured, placeCall, sendSms, claimToken } from "./twilio.js";
import * as wa from "./whatsapp.js";
import { church } from "./twiml.js";

// Text messages with a tap link, on top of the call: set NOTIFY_SMS=true
export const smsOn = () => /^(1|true|yes|on)$/i.test(String(process.env.NOTIFY_SMS || ""));

const SMS_TEXT = {
  en: (church, name, url) => `${church}: someone is at the front door${name ? ` (${name})` : ""}. If you can go down and open, tap here: ${url}`,
  nb: (church, name, url) => `${church}: noen står ved inngangsdøren${name ? ` (${name})` : ""}. Kan du gå ned og åpne, trykk her: ${url}`,
};

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

  if (smsOn() && twilioConfigured()) {
    const txt = SMS_TEXT[process.env.TEAM_LANG === "nb" ? "nb" : "en"];
    const first = (n) => n.split(" ")[0];
    for (const m of team) {
      const who = first(m.name);
      const link = `${baseUrl}/claim?id=${encodeURIComponent(ringId)}&m=${encodeURIComponent(who)}&k=${claimToken(ringId, who)}`;
      jobs.push(
        sendSms({ to: m.number, body: txt(church(), visitorName, link) }).then((r) => {
          if (r.ok) delivered++;
        })
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
