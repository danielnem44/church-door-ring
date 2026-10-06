// Scan page logic. Plain JavaScript, no build step.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const SCREENS = ["loading", "form", "ringing", "coming", "noanswer", "closed", "offline"];
  const POLL_MS = 2500;
  const MAX_POLL_MS = 15 * 60 * 1000;

  const state = {
    cfg: null,
    lang: null,
    screen: "loading",
    ringId: null,
    ringStartedAt: 0,
    pollTimer: null,
    comingBy: null,
    mock: false,
  };

  // ── storage helpers (can fail in private mode) ──
  const store = {
    get(k, s = localStorage) { try { return s.getItem(k); } catch { return null; } },
    set(k, v, s = localStorage) { try { s.setItem(k, v); } catch {} },
    del(k, s = localStorage) { try { s.removeItem(k); } catch {} },
  };

  // ── language ──
  function pickLanguage(defaultLang) {
    const saved = store.get("lang");
    if (saved && I18N[saved]) return saved;
    for (const l of navigator.languages || [navigator.language || ""]) {
      const code = l.toLowerCase().slice(0, 2);
      if (code === "no" || code === "nb" || code === "nn") return "nb";
      if (I18N[code]) return code;
    }
    return I18N[defaultLang] ? defaultLang : "nb";
  }

  function t(key, vars) {
    let s = (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || "";
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    return s;
  }

  function renderLangs() {
    const nav = $("langs");
    nav.setAttribute("aria-label", t("chooseLanguage"));
    nav.innerHTML = "";
    for (const code of LANG_ORDER) {
      if (!I18N[code]) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.lang = code === "nb" ? "no" : code;
      b.textContent = I18N[code].langName;
      b.setAttribute("aria-pressed", String(code === state.lang));
      b.addEventListener("click", () => setLang(code));
      nav.appendChild(b);
    }
  }

  function setLang(code) {
    state.lang = code;
    store.set("lang", code);
    document.documentElement.lang = code === "nb" ? "no" : code;
    renderText();
  }

  function renderText() {
    document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
    $("visitorName").placeholder = t("namePlaceholder");
    renderLangs();
    renderStatus();
    renderComing();
    renderNext();
    document.title = (state.cfg && state.cfg.churchName ? state.cfg.churchName + " – " : "") + t("ringBtn");
  }

  // ── header ──
  function renderStatus() {
    const pill = $("statusPill");
    if (!state.cfg) { pill.classList.add("hide"); return; }
    pill.classList.remove("hide");
    pill.classList.toggle("closed", !state.cfg.open);
    $("statusText").textContent = state.cfg.open ? t("statusOpen") : t("statusClosed");
  }

  function renderComing() {
    $("comingTitle").textContent = state.comingBy ? t("comingTitle", { name: state.comingBy }) : t("comingTitleAnon");
  }

  function renderNext() {
    const next = state.cfg && state.cfg.next;
    $("nextCard").hidden = !next;
    if (!next) return;
    const dayIndex = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(next.weekday);
    const day = next.inDays === 0 ? t("today") : next.inDays === 1 ? t("tomorrow") : t("weekdays")[dayIndex] || next.weekday;
    const cap = day.charAt(0).toUpperCase() + day.slice(1);
    $("nextText").textContent = `${cap} ${next.serviceStart || next.start}`;
  }

  // ── screens ──
  function show(name) {
    state.screen = name;
    for (const s of SCREENS) $("s-" + s).hidden = s !== name;
    const h = $("s-" + name).querySelector("h1");
    if (h && name !== "loading") { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }

  function setupCallLinks() {
    const phone = (state.cfg && state.cfg.doorPhone) || "";
    const tel = "tel:" + phone.replace(/[^\d+]/g, "");
    document.querySelectorAll(".callLink").forEach((a) => (a.href = tel));
    document.querySelectorAll(".phoneText").forEach((s) => (s.textContent = phone));
  }

  // ── ringing ──
  async function ring(errorEl, btn) {
    errorEl.hidden = true;
    btn.disabled = true;
    let res, data = {};
    try {
      res = await fetch("/api/ring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: $("visitorName").value, lang: state.lang }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      btn.disabled = false;
      return showError(errorEl, t("errOffline"));
    }
    btn.disabled = false;

    if (res.ok && data.id) {
      startTracking(data.id, Date.now(), !!data.mock);
      return;
    }
    if (data.error === "closed") return loadStatus();
    if (data.error === "too_soon") return showError(errorEl, t("errTooSoon", { s: data.retryAfter || 30 }));
    if (data.error === "busy") return showError(errorEl, t("errBusy"));
    return showError(errorEl, t("errFailed"));
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function startTracking(id, startedAt, mock) {
    state.ringId = id;
    state.ringStartedAt = startedAt;
    state.mock = mock;
    state.comingBy = null;
    store.set("ring", JSON.stringify({ id, startedAt, mock }), sessionStorage);
    document.querySelector("#s-ringing .demo").hidden = !mock;
    $("backupNote").hidden = true;
    show("ringing");
    clearTimeout(state.pollTimer);
    poll();
  }

  async function poll() {
    if (!state.ringId) return;
    const elapsed = Date.now() - state.ringStartedAt;
    if (elapsed > MAX_POLL_MS) return stopTracking();

    try {
      const res = await fetch("/api/ring?id=" + encodeURIComponent(state.ringId), { cache: "no-store" });
      if (res.status === 404) return stopTracking("form");
      const data = await res.json();
      if (data.status === "coming") {
        state.comingBy = data.by;
        renderComing();
        show("coming");
        if (navigator.vibrate) try { navigator.vibrate([120, 60, 120]); } catch {}
        store.del("ring", sessionStorage);
        state.ringId = null;
        return;
      }
      if (data.fallbackCalled) $("backupNote").hidden = false;
      const limit = ((state.cfg && state.cfg.noAnswerAfterSeconds) || 90) * 1000;
      if (elapsed > limit && state.screen === "ringing") show("noanswer");
    } catch {
      /* network blip, keep trying */
    }
    state.pollTimer = setTimeout(poll, POLL_MS);
  }

  function stopTracking(screen) {
    clearTimeout(state.pollTimer);
    state.ringId = null;
    store.del("ring", sessionStorage);
    if (screen) show(screen);
  }

  // ── status ──
  async function loadStatus() {
    show("loading");
    const params = new URLSearchParams(location.search);
    const src = params.get("src");
    try {
      const res = await fetch("/api/status" + (src ? "?src=" + encodeURIComponent(src) : ""), { cache: "no-store" });
      state.cfg = await res.json();
    } catch {
      show("offline");
      return;
    }
    // Don't count the same scan twice on refresh
    if (src) history.replaceState(null, "", location.pathname);

    if (!state.lang) state.lang = pickLanguage(state.cfg.defaultLanguage);
    $("churchName").textContent = state.cfg.churchName || "";
    setupCallLinks();
    setLang(state.lang);

    if (!state.cfg.open) return show("closed");

    // Coming back to the page while a ring is still active? Continue it.
    const saved = store.get("ring", sessionStorage);
    if (saved) {
      try {
        const r = JSON.parse(saved);
        if (Date.now() - r.startedAt < MAX_POLL_MS) return startTracking(r.id, r.startedAt, r.mock);
      } catch {}
    }
    show("form");
  }

  // ── events ──
  $("ringForm").addEventListener("submit", (e) => {
    e.preventDefault();
    ring($("formError"), $("ringBtn"));
  });
  $("ringAgain").addEventListener("click", () => ring($("againError"), $("ringAgain")));
  $("startOver").addEventListener("click", () => { $("visitorName").value = ""; show("form"); });
  $("demoClaim").addEventListener("click", async () => {
    if (!state.ringId) return;
    await fetch("/api/demo-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: state.ringId }),
    }).catch(() => {});
  });

  // Fill the page with a language right away so it never shows blank
  state.lang = pickLanguage("nb");
  renderText();
  loadStatus();
})();
