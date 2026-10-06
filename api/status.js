// GET /api/status  → is ringing open right now? + church info for the page
import config from "../church.config.js";
import { isOpen, nextOpening } from "../lib/schedule.js";
import { getStore } from "../lib/store.js";
import { json, monthKey } from "../lib/http.js";

export async function GET(request) {
  const url = new URL(request.url);
  // Count scans that came from the door QR (the QR link has ?src=door)
  if (url.searchParams.get("src") === "door") {
    try {
      await getStore().incr(`stats:${monthKey()}:scans`);
    } catch (e) {
      console.error("[status] stats failed", e);
    }
  }
  const open = isOpen();
  return json({
    open,
    next: open ? null : nextOpening(),
    churchName: config.churchName,
    doorPhone: config.doorPhone,
    defaultLanguage: config.defaultLanguage,
    noAnswerAfterSeconds: config.noAnswerAfterSeconds,
    services: config.services, // used by the door sign
  });
}
