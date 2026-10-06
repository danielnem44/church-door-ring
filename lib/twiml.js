// What the door team hears when they pick up. TwiML = Twilio's little XML language.
import config from "../church.config.js";

export function esc(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
}

const lang = () => (process.env.TEAM_LANG === "nb" ? "nb" : "en");

const VOICE = {
  nb: { language: "nb-NO", voice: "Polly.Liv" },
  en: { language: "en-GB", voice: "Polly.Amy" },
};

const TEXT = {
  nb: {
    ask: (church, name, member) =>
      `Hei ${member || "du"}! Gud velsigne deg. Dette er ${church}. Noen har akkurat kommet til inngangsdøren, og gleder seg til å være med oss. ${name ? `Navnet er ${name}. ` : ""}Takk for at du er klar til å ta imot. Hvis du kan gå ned og åpne, trykk 1.`,
    thanks: "Takk! Den som venter får beskjed om at du kommer ned.",
    taken: (who) => `${who} går allerede ned. Takk likevel!`,
    expired: "Denne ringingen er utløpt. Ingen venter lenger.",
    noInput: "Ingen svar. Ha det bra.",
  },
  en: {
    ask: (church, name, member) =>
      `Hi ${member || "there"}! God bless you. This is ${church}. Someone has just arrived at the front door, and they are so excited to join us. ${name ? `Their name is ${name}. ` : ""}Thank you for being ready to welcome them. If you can go down and open the door, please press 1.`,
    thanks: "Thanks! The visitor can now see that you are coming down.",
    taken: (who) => `${who} is already going down. Thanks anyway!`,
    expired: "This ring has expired. Nobody is waiting anymore.",
    noInput: "No answer. Goodbye.",
  },
};

export const t = () => TEXT[lang()];
export const church = () => config.churchName || "the church";

export function say(text) {
  const v = VOICE[lang()];
  return `<Say language="${v.language}" voice="${v.voice}">${esc(text)}</Say>`;
}

export function twiml(inner) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
