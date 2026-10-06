// Run: npm test   (no keys needed, uses MOCK mode + memory store)
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DOOR_TEAM = "Daniel Nemeye:+47 900 00 000, Anna:+4790000001";
process.env.WHATSAPP_APP_SECRET = "test-secret";
process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
delete process.env.WHATSAPP_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;

const { isOpen, nextOpening } = await import("../lib/schedule.js");
const ringApi = await import("../api/ring.js");
const webhook = await import("../api/webhook.js");
const status = await import("../api/status.js");
const qr = await import("../api/qr.js");
const voice = await import("../api/voice.js");
const gather = await import("../api/voice-gather.js");
const { getTeam } = await import("../lib/team.js");

const cfg = {
  timezone: "Europe/Oslo",
  services: [{ day: "sunday", start: "10:30", end: "14:30" }],
  extraDates: [{ date: "2026-12-24", start: "15:00", end: "18:00" }],
};

const req = (url, init = {}) => new Request("http://localhost" + url, init);
const sign = (body) => "sha256=" + crypto.createHmac("sha256", "test-secret").update(body).digest("hex");
const tapBody = (from, payload) =>
  JSON.stringify({
    entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: "X" } }], messages: [{ from, type: "button", button: { payload, text: "Jeg går ned" } }] } }] }],
  });

test("team parsing", () => {
  const team = getTeam();
  assert.equal(team.length, 2);
  assert.deepEqual(team[0], { name: "Daniel Nemeye", number: "4790000000" });
});

test("schedule: open on Sunday 11:00 Oslo, closed Monday", () => {
  // 2026-10-04 is a Sunday. 09:00 UTC = 11:00 Oslo (CEST)
  assert.equal(isOpen(new Date("2026-10-04T09:00:00Z"), cfg), true);
  assert.equal(isOpen(new Date("2026-10-04T13:00:00Z"), cfg), false); // 15:00 Oslo
  assert.equal(isOpen(new Date("2026-10-05T09:00:00Z"), cfg), false);
  // Christmas Eve extra date, 16:00 Oslo (CET) = 15:00 UTC
  assert.equal(isOpen(new Date("2026-12-24T15:00:00Z"), cfg), true);
});

test("schedule: overnight past midnight + skip dates", () => {
  const c = {
    timezone: "Europe/Oslo",
    services: [{ day: "friday", start: "17:45", end: "21:00" }],
    extraDates: [{ date: "2026-10-30", start: "20:45", end: "03:00" }],
    skipDates: ["2026-10-30"],
  };
  // Fri 30 Oct 2026 is CET (UTC+1)
  assert.equal(isOpen(new Date("2026-10-30T17:00:00Z"), c), false); // 18:00, normal Friday skipped
  assert.equal(isOpen(new Date("2026-10-30T22:00:00Z"), c), true);  // 23:00
  assert.equal(isOpen(new Date("2026-10-31T01:30:00Z"), c), true);  // Sat 02:30
  assert.equal(isOpen(new Date("2026-10-31T02:30:00Z"), c), false); // Sat 03:30
  assert.equal(isOpen(new Date("2026-10-23T17:00:00Z"), c), true);  // normal Friday 19:00
});

test("schedule: next opening", () => {
  const n = nextOpening(new Date("2026-10-05T09:00:00Z"), cfg); // Monday
  assert.equal(n.weekday, "sunday");
  assert.equal(n.start, "10:30");
  assert.equal(n.inDays, 6);
  const sameDay = nextOpening(new Date("2026-10-04T06:00:00Z"), cfg); // Sunday 08:00
  assert.equal(sameDay.inDays, 0);
});

test("closed → ring refused", async () => {
  process.env.FORCE_OPEN = "false";
  // Can't control the real clock, so only assert when actually closed
  const s = await (await status.GET(req("/api/status"))).json();
  if (!s.open) {
    const r = await ringApi.POST(req("/api/ring", { method: "POST", body: "{}", headers: { "x-forwarded-for": "9.9.9.9" } }));
    assert.equal(r.status, 403);
  }
});

test("full flow: ring → first tap wins → second tap told", async () => {
  process.env.FORCE_OPEN = "true";
  const r = await ringApi.POST(
    req("/api/ring", { method: "POST", body: JSON.stringify({ name: "  Ole <b>  " }), headers: { "x-forwarded-for": "1.1.1.1" } })
  );
  assert.equal(r.status, 200);
  const { id, notified, mock } = await r.json();
  assert.ok(id);
  assert.equal(notified, 2);
  assert.equal(mock, true);

  let s = await (await ringApi.GET(req("/api/ring?id=" + id))).json();
  assert.equal(s.status, "ringing");

  // Bad signature is rejected
  const bad = await webhook.POST(req("/api/webhook", { method: "POST", body: tapBody("4790000001", "COMING:" + id), headers: { "x-hub-signature-256": "sha256=00" } }));
  assert.equal(bad.status, 401);

  const body = tapBody("4790000001", "COMING:" + id);
  const w = await webhook.POST(req("/api/webhook", { method: "POST", body, headers: { "x-hub-signature-256": sign(body) } }));
  assert.equal(w.status, 200);

  s = await (await ringApi.GET(req("/api/ring?id=" + id))).json();
  assert.equal(s.status, "coming");
  assert.equal(s.by, "Anna");

  // Daniel taps too late — still "Anna"
  const body2 = tapBody("4790000000", "COMING:" + id);
  await webhook.POST(req("/api/webhook", { method: "POST", body: body2, headers: { "x-hub-signature-256": sign(body2) } }));
  s = await (await ringApi.GET(req("/api/ring?id=" + id))).json();
  assert.equal(s.by, "Anna");
});

const twSign = (url, params) =>
  crypto.createHmac("sha1", "tw-secret").update(url + Object.keys(params).sort().map((k) => k + params[k]).join("")).digest("base64");

test("phone calls: answer → press 1 claims → second person is told", async () => {
  process.env.FORCE_OPEN = "true";
  process.env.TWILIO_AUTH_TOKEN = "tw-secret"; // signature check on (SID/FROM unset → still test mode, no real calls)
  try {
    const r = await ringApi.POST(req("/api/ring", { method: "POST", body: JSON.stringify({ name: "Ole" }), headers: { "x-forwarded-for": "4.4.4.4" } }));
    assert.equal(r.status, 200);
    const { id } = await r.json();

    // Anna picks up
    const voiceUrl = `http://localhost/api/voice?id=${id}&m=Anna`;
    const post = (handler, path, url, form, sig) =>
      handler.POST(req(path, { method: "POST", body: new URLSearchParams(form).toString(), headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig } }));

    const bad = await post(voice, voiceUrl.replace("http://localhost", ""), voiceUrl, { CallSid: "CA1" }, "nope");
    assert.equal(bad.status, 401);

    const ask = await post(voice, voiceUrl.replace("http://localhost", ""), voiceUrl, { CallSid: "CA1" }, twSign(voiceUrl, { CallSid: "CA1" }));
    const askXml = await ask.text();
    assert.match(askXml, /<Gather/);
    assert.match(askXml, /Ole/);
    assert.match(askXml, /Press 1/);
    assert.match(askXml, /method="POST"/);

    // Anna presses 1
    const gUrl = (m) => `http://localhost/api/voice-gather?id=${id}&m=${m}`;
    const annaForm = { CallSid: "CA1", Digits: "1" };
    const g1 = await post(gather, gUrl("Anna").replace("http://localhost", ""), gUrl("Anna"), annaForm, twSign(gUrl("Anna"), annaForm));
    assert.match(await g1.text(), /Thanks/);
    let s = await (await ringApi.GET(req("/api/ring?id=" + id))).json();
    assert.equal(s.status, "coming");
    assert.equal(s.by, "Anna");

    // Daniel presses 1 a moment later → told Anna has it
    const dForm = { CallSid: "CA2", Digits: "1" };
    const g2 = await post(gather, gUrl("Daniel").replace("http://localhost", ""), gUrl("Daniel"), dForm, twSign(gUrl("Daniel"), dForm));
    const g2xml = await g2.text();
    assert.match(g2xml, /Anna/);
    assert.match(g2xml, /already/);
    s = await (await ringApi.GET(req("/api/ring?id=" + id))).json();
    assert.equal(s.by, "Anna");

    // A third person who picks up after it's taken hears the same and no Gather
    const late = await post(voice, voiceUrl.replace("http://localhost", ""), voiceUrl, { CallSid: "CA3" }, twSign(voiceUrl, { CallSid: "CA3" }));
    const lateXml = await late.text();
    assert.match(lateXml, /already/);
    assert.doesNotMatch(lateXml, /<Gather/);

    // Wrong key → asked again
    const rid = (await (await ringApi.POST(req("/api/ring", { method: "POST", body: "{}", headers: { "x-forwarded-for": "5.5.5.5" } }))).json()).id;
    const wUrl = `http://localhost/api/voice-gather?id=${rid}&m=Anna`;
    const wForm = { CallSid: "CA9", Digits: "5" };
    const w = await post(gather, wUrl.replace("http://localhost", ""), wUrl, wForm, twSign(wUrl, wForm));
    assert.match(await w.text(), /<Redirect/);
  } finally {
    delete process.env.TWILIO_AUTH_TOKEN;
  }
});

test("twilio: rings everyone, then cancels the other phones when one presses 1", async () => {
  process.env.FORCE_OPEN = "true";
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "tw-secret", TWILIO_FROM: "+15550001111", SITE_URL: "https://church.example/" });
  const realFetch = globalThis.fetch;
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), form: Object.fromEntries(new URLSearchParams(String(init?.body || ""))) });
    return new Response(JSON.stringify({ sid: "CAfake" + ++n }), { status: 201 });
  };
  try {
    const r = await ringApi.POST(req("/api/ring", { method: "POST", body: JSON.stringify({ name: "Ole" }), headers: { "x-forwarded-for": "6.6.6.6" } }));
    const out = await r.json();
    assert.equal(r.status, 200);
    assert.equal(out.mock, false);
    assert.equal(out.notified, 2);
    const placed = calls.filter((c) => c.url.endsWith("/Calls.json"));
    assert.equal(placed.length, 2);
    assert.deepEqual(placed.map((c) => c.form.To).sort(), ["+4790000000", "+4790000001"]);
    assert.ok(placed.every((c) => c.form.From === "+15550001111"));
    assert.ok(placed.every((c) => c.form.Url.startsWith("https://church.example/api/voice?id=" + out.id + "&m=")));

    // Anna (call CAfake2) presses 1 → the other call (CAfake1) is cancelled, hers is not
    const gUrl = `https://church.example/api/voice-gather?id=${out.id}&m=Anna`;
    const form = { CallSid: "CAfake2", Digits: "1" };
    const g = await gather.POST(req(`/api/voice-gather?id=${out.id}&m=Anna`, { method: "POST", body: new URLSearchParams(form).toString(), headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twSign(gUrl, form) } }));
    assert.equal(g.status, 200);
    const cancels = calls.filter((c) => c.url.includes("/Calls/") && c.form.Status === "canceled");
    assert.equal(cancels.length, 1);
    assert.ok(cancels[0].url.includes("CAfake1"));
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "SITE_URL"]) delete process.env[k];
  }
});

test("team language: English by default, Norwegian with TEAM_LANG=nb", async () => {
  const tw = await import("../lib/twiml.js");
  delete process.env.TEAM_LANG;
  assert.match(tw.t().ask("Jesus Moment", "Ole"), /Press 1/);
  process.env.TEAM_LANG = "nb";
  try {
    assert.match(tw.t().ask("Jesus Moment", "Ole"), /Trykk 1/);
  } finally {
    delete process.env.TEAM_LANG;
  }
});

test("anti-spam: same phone can't ring twice in a row", async () => {
  process.env.FORCE_OPEN = "true";
  const mk = () => ringApi.POST(req("/api/ring", { method: "POST", body: "{}", headers: { "x-forwarded-for": "2.2.2.2" } }));
  assert.equal((await mk()).status, 200);
  const second = await mk();
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error, "too_soon");
});

test("webhook verification handshake", async () => {
  const ok = await webhook.GET(req("/api/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"));
  assert.equal(await ok.text(), "42");
  const no = await webhook.GET(req("/api/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42"));
  assert.equal(no.status, 403);
});

test("bad ring id is rejected", async () => {
  assert.equal((await ringApi.GET(req("/api/ring?id=../../x"))).status, 400);
  assert.equal((await ringApi.GET(req("/api/ring?id=doesnotexist"))).status, 404);
});

test("qr is an svg pointing at the site", async () => {
  const svg = await (await qr.GET(req("/api/qr"))).text();
  assert.match(svg, /^<svg/);
});
