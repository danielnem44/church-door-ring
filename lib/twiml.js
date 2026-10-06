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
      `Hei ${member || "du"}, Gud velsigne deg! Noen står ved inngangsdøren til ${church}. ${name ? `Navn: ${name}. ` : ""}Kan du gå ned? Trykk 1.`,
    thanks: "Takk! Den som venter får beskjed om at du kommer ned.",
    taken: (who) => `${who} går allerede ned. Takk likevel!`,
    expired: "Denne ringingen er utløpt. Ingen venter lenger.",
    noInput: "Ingen svar. Ha det bra.",
  },
  en: {
    ask: (church, name, member) =>
      `Hi ${member || "there"}, God bless! Someone is at the front door of ${church}. ${name ? `Name: ${name}. ` : ""}Can you go down? Press 1.`,
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
