// Works out if ringing is open right now, using the church's time zone.
import config from "../church.config.js";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

// Local date/time parts in the church time zone
export function localParts(date = new Date(), timeZone = config.timezone) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    isoDate: `${p.year}-${p.month}-${p.day}`,
    weekday: p.weekday.toLowerCase(),
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

// All time windows that apply on a given local day
function windowsFor(isoDate, weekday, cfg) {
  const skipped = (cfg.skipDates || []).includes(isoDate);
  const regular = skipped ? [] : (cfg.services || []).filter((s) => s.day.toLowerCase() === weekday);
  const extra = (cfg.extraDates || []).filter((s) => s.date === isoDate);
  return [...regular, ...extra].map((s) => ({ start: s.start, end: s.end, serviceStart: s.serviceStart || s.start, name: s.name || "" }));
}

export function isOpen(date = new Date(), cfg = config) {
  if (process.env.FORCE_OPEN === "true") return true;
  const now = localParts(date, cfg.timezone);
  const crossesMidnight = (w) => toMinutes(w.end) <= toMinutes(w.start);

  // Windows that start today
  const today = windowsFor(now.isoDate, now.weekday, cfg).some((w) =>
    crossesMidnight(w)
      ? now.minutes >= toMinutes(w.start)
      : now.minutes >= toMinutes(w.start) && now.minutes < toMinutes(w.end)
  );
  if (today) return true;

  // Windows that started yesterday and run past midnight (e.g. 21:00 → 03:00)
  const y = localParts(new Date(date.getTime() - 86400000), cfg.timezone);
  return windowsFor(y.isoDate, y.weekday, cfg).some((w) => crossesMidnight(w) && now.minutes < toMinutes(w.end));
}

// Next time ringing opens: { weekday, date, start, inDays } or null
export function nextOpening(date = new Date(), cfg = config) {
  for (let i = 0; i <= 14; i++) {
    const d = new Date(date.getTime() + i * 86400000);
    const p = localParts(d, cfg.timezone);
    const windows = windowsFor(p.isoDate, p.weekday, cfg)
      .filter((w) => i > 0 || toMinutes(w.start) > localParts(date, cfg.timezone).minutes)
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    if (windows.length) {
      const w = windows[0];
      return { weekday: p.weekday, date: p.isoDate, start: w.start, serviceStart: w.serviceStart, name: w.name, inDays: i };
    }
  }
  return null;
}

export { DAYS };
