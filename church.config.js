// ─────────────────────────────────────────────────────────────
//  CHURCH SETTINGS — edit this file, then redeploy.
//  (Phone numbers of the door team are NOT here. They go in the
//   environment variable DOOR_TEAM, so they stay private.)
// ─────────────────────────────────────────────────────────────

export default {
  // Shown on the scan page and the door sign
  churchName: "Jesus Moment",

  // The church door phone (the button phone). Shown as a backup
  // for people who have call credit.
  doorPhone: "+47 483 91 028",

  // All times below are in this time zone
  timezone: "Europe/Oslo",

  // When ringing is ON. Outside these times people see the "closed" screen.
  // start/end = when the QR ringing works (opens 15 min before the service).
  // serviceStart = the time printed on the door sign.
  // If end is earlier than start (e.g. 21:00 → 03:00) it runs past midnight.
  // day: monday | tuesday | wednesday | thursday | friday | saturday | sunday
  services: [
    { name: "Bible Study",        day: "tuesday",   serviceStart: "18:00", start: "17:45", end: "20:30" },
    { name: "Midweek Service",    day: "wednesday", serviceStart: "18:00", start: "17:45", end: "20:30" },
    { name: "Night shift Prayer", day: "friday",    serviceStart: "18:00", start: "17:45", end: "21:00" },
    { name: "Sunday Service",     day: "sunday",    serviceStart: "15:00", start: "14:45", end: "18:00" },
  ],

  // One-off events. Date is YYYY-MM-DD.
  extraDates: [
    { name: "Overnight Prayer", date: "2026-10-30", serviceStart: "21:00", start: "20:45", end: "03:00" },
  ],

  // Days where the normal weekly service is NOT happening
  // (e.g. replaced by an overnight, or cancelled). Extra dates still work.
  skipDates: ["2026-10-30"],

  // Language the scan page starts in if we can't guess from the phone.
  // Available: nb (Norsk), en (English), fr (Français), sw (Kiswahili)
  defaultLanguage: "nb",

  // How many seconds the visitor waits before we say "no answer yet"
  // and show the call button.
  noAnswerAfterSeconds: 90,
};
