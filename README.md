# Church Door Ring (Jesus Moment)

Scan a QR code at the church door → the **whole door team's phones ring at the same time** → the first person to press **1** goes down and opens. The visitor sees **"Anna kommer ned"** on their phone.

The visitor only needs mobile data. No call credit, no app, no Facebook.

```
Visitor scans QR ──► scan page ──► "Ring kirken"
                                        │
              All door team phones ring at the same time
                                        │
       First one picks up and presses 1 ──► visitor sees "Anna kommer ned"
       The other phones stop ringing. Anyone who already picked up hears
       "Anna går allerede ned. Takk likevel!"
```

**What's included**

- **Scan page** in Norsk, English, Français and Kiswahili. The visitor picks the language.
- **Closed screen** outside service times, showing the next service.
- **"I have call credit, call instead"** button on every screen.
- **Printable door sign** at `/sign`, with the QR code and the door phone number.
- **Anti-spam:** ringing only works during service times, one ring per phone every 45 seconds, and a maximum of 8 rings per 10 minutes.
- **Numbers for leadership** at `/api/stats`: how many scanned, rang and got answered.
- **WhatsApp as an option** later (`NOTIFY_CHANNEL=whatsapp` or `both`). See the end of this guide.

---

## 1. Try it on your computer first (5 min)

You need Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
```

Open `.env.local` and set `FORCE_OPEN=true`, so you can ring even when there's no service.

```bash
npm run dev
```

Open http://localhost:3000 and http://localhost:3000/sign.

With no Twilio keys it runs in **test mode**:

- Nobody is called. The "calls" are only printed in the terminal.
- After you tap Ring, the page shows a **"Test: pretend someone answered"** button. Use it to show the whole flow to leadership.

Run the automatic tests with `npm test`.

---

## 2. Church settings

Open **`church.config.js`**. It already has Jesus Moment's name, door phone and service times. Check the **end times**: ringing stops at `end`, so make it later than the service really finishes.

The door team's phone numbers do **not** go here. They go in `DOOR_TEAM` (step 6), so they stay private.

---

## 3. Twilio setup (phone calls) (about 30 min)

Twilio is the service that makes the phone calls. No Facebook is needed.

### 3a. Create an account and upgrade it

1. Go to https://www.twilio.com and sign up. They verify your email and your phone.
2. **Upgrade the account** (Console → Upgrade). You add an address, a payment card and a starting balance.

**Do not test with a free trial account.** Trial accounts can only call numbers you have verified (max 5), custom spoken text is restricted, and trials end after 30 days. For this project, upgrade first. Calls cost a few kroner each when answered.

### 3b. Allow calls to Norway

Console → **Voice → Settings → Geo permissions** → turn on **Norway**. Without this, every call fails.

### 3c. Get a phone number to call from

Console → **Phone Numbers → Buy a number**.

- **Easiest: a US number with Voice.** It costs about $1.15 a month and has no paperwork. Calls from it to Norwegian phones work.
- A Norwegian number looks nicer on the team's phones, but Twilio requires proof of a Norwegian address and ID or company papers, which takes extra time.

Tell the door team: **save this number in your phone as "Kirkedør"**, so you know it's the church calling and you don't ignore it. The number goes in `TWILIO_FROM`, with a `+`, like `+15551234567`.

### 3d. Copy your keys

Console → **Account → API keys & tokens** (or the Console home page). Copy:

- **Account SID** → `TWILIO_ACCOUNT_SID`
- **Auth Token** → `TWILIO_AUTH_TOKEN`

The Auth Token is like a password. Never post it or put it in GitHub.

---

## 4. Database (Upstash Redis, free)

The site needs a small database to remember who is ringing and who answered.

1. In Vercel, open your project and go to **Storage**, or **Marketplace → Upstash → Redis**.
2. Create a free database and **connect it to the project**. The keys are added automatically.

Without the database, ringing will not work reliably on Vercel.

---

## 5. Put it online (Vercel)

1. Put this folder on GitHub (`.env.local` stays out of it; `.gitignore` already handles that). **You do the push yourself.**
2. On https://vercel.com, click **Add New → Project**, import the repo, and set the framework preset to **Other**.
3. Add the environment variables (step 6), then click **Deploy**.
4. Your site is now at something like `https://church-door-ring.vercel.app`. Put that address in `SITE_URL` and **redeploy**. **Twilio needs `SITE_URL` to find the page that talks to the team.**

---

## 6. Environment variables (Vercel → Settings → Environment Variables)

| Name | Example | What it is |
|---|---|---|
| `DOOR_TEAM` | `Daniel:+4791234567, Anna:+4798765432` | Who gets the phone call |
| `TWILIO_ACCOUNT_SID` | `AC...` | From step 3d |
| `TWILIO_AUTH_TOKEN` | `...` | From step 3d |
| `TWILIO_FROM` | `+15551234567` | The number from step 3c |
| `SITE_URL` | `https://church-door-ring.vercel.app` | Your Vercel address |
| `TEAM_LANG` | `nb` | Language the team hears: `nb` or `en` |
| `STATS_KEY` | `some-password` | For `/api/stats?key=...` |

The Upstash keys are added by step 4.

**Tip:** you can add the church button phone to `DOOR_TEAM` too, e.g. `Dørtelefon:+4748391028`. It then rings together with everyone else, and someone near it can press 1.

---

## 7. Test it for real

1. Set `FORCE_OPEN=true` on Vercel, then redeploy.
2. Open your site on your phone and tap **Ring kirken**.
3. Every phone in `DOOR_TEAM` should ring from your Twilio number.
4. Pick up one phone. You hear: *"Hei! Noen venter ved inngangsdøren til Jesus Moment… Trykk 1 hvis du går ned og åpner."*
5. Press **1**. The other phones stop ringing, and the visitor's screen changes to **"… kommer ned"** within a few seconds.
6. **Set `FORCE_OPEN` back to `false`**, then redeploy.
7. Open `https://YOUR-SITE/sign` and click **Print**. Laminate it and put it on the door.

---

## Cost

- **Twilio calls:** about $0.077 per minute to a Norwegian mobile. You are normally only charged for calls that are answered. A ring that is answered and taken in about 30 seconds costs a few øre per person who picked up.
- **Twilio number:** about $1.15 a month.
- **Vercel and Upstash:** the free plans are enough for this. Vercel's free Hobby plan is meant for non-commercial use, which a church project should fit, but check their terms.
- **Tip:** only put the people on door duty that day in `DOOR_TEAM`.

Prices change, so check Twilio's price page for Norway before you rely on these numbers.

---

## Numbers for leadership

Open `https://YOUR-SITE/api/stats?key=YOUR_STATS_KEY` to see this month and last month:

```json
{ "2026-10": { "scans": 14, "rings": 9, "answered": 8 } }
```

**Every ring is someone who might have gone home before.**

---

## Privacy

- The visitor's name (optional) is kept for 30 minutes, then deleted automatically.
- Visitors' phone numbers are never collected.
- Door team numbers live only in the `DOOR_TEAM` setting on Vercel, never in the code.
- Stats are only counts, with no names.
- Everyone on the door team must agree to get these calls. Ask them first.

---

## Something not working?

| Problem | Check |
|---|---|
| Nobody's phone rings | Geo permission for Norway (3b)? Account upgraded (3a)? Numbers in `DOOR_TEAM` have the country code? Look in Twilio Console → **Monitor → Logs → Calls**, and in Vercel → **Logs** for lines starting with `[twilio]`. |
| Phone rings but you hear nothing useful or the call drops | `SITE_URL` must be your real Vercel address, then redeploy. Twilio Console → **Monitor → Logs → Errors** shows what Twilio could not reach. |
| Pressing 1 does nothing | Same as above. Also check `TWILIO_AUTH_TOKEN` is the right one. A wrong token makes the site reject Twilio's messages. |
| Page says "Couldn't send" | Same as the first row. |
| Page always shows "closed" | Times in `church.config.js`. The time zone is Europe/Oslo. |
| Works locally, not on Vercel | Upstash Redis connected? (step 4) |
| The team ignores the call | They should save the Twilio number as "Kirkedør". |

---

## Optional: WhatsApp (later, if the church wants it)

The WhatsApp code is still in the project. It needs a Meta (Facebook) developer account, a business portfolio and an approved message template, which is why we started with calls.

To use it, set these in Vercel:

- `NOTIFY_CHANNEL` = `whatsapp` (WhatsApp only) or `both` (calls and WhatsApp)
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_TEMPLATE_NAME` = `door_ring` and `WHATSAPP_TEMPLATE_LANG` = `nb`

The template (category **Utility**, language Norwegian, variable type **Number**):

> Noen venter ved inngangsdøren nede. Navn: {{1}}. Trykk på knappen hvis du går ned og åpner.

with one **Quick reply** button: `Jeg går ned`.

Then in the Meta app: **WhatsApp → Configuration → Webhook** → Callback URL `https://YOUR-SITE/api/webhook`, Verify token = your `WHATSAPP_VERIFY_TOKEN`, subscribe to **messages**.

---

## Files

```
church.config.js        ← church name, phone, service times (edit this)
public/index.html       ← scan page
public/app.js           ← scan page logic
public/i18n.js          ← all text, per language (add languages here)
public/sign.html        ← printable door sign
api/ring.js             ← start a ring / check status
api/voice.js            ← what the team hears when they pick up
api/voice-gather.js     ← what happens when someone presses 1
api/webhook.js          ← WhatsApp button taps (only if WhatsApp is on)
api/status.js           ← open or closed right now
api/qr.js               ← the QR code image
api/stats.js            ← numbers for leadership
api/demo-claim.js       ← test-mode only "pretend someone answered"
lib/                    ← schedule, Twilio, WhatsApp, database helpers
scripts/dev-server.js   ← run locally with `npm run dev`
scripts/test.js         ← `npm test`
```

The Kiswahili text in `public/i18n.js` should be checked by a native speaker in the church.
