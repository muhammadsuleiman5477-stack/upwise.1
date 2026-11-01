(function () {
  var sb = window.upwise.sb, uid = null, busy = false;
  var KEY = "upwise-alerts";
  var S = { sound: "off", volume: 0.4, repeat: false, quietOn: false, qs: "22:00", qe: "07:00" };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || "{}"); for (var k in saved) S[k] = saved[k]; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---- sound: made in the browser, never plays unless the person chose a sound ---- */
  var ctx = null, loopTimer = null;
  function audio() {
    if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, vol, type) {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + start;
    o.type = type || "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus(a)); o.start(t); o.stop(t + dur + 0.05);
  }
  // master bus: a gain stage feeding a limiter, so loud sounds get much louder without crackling
  var master = null;
  function bus(a) {
    if (!master) {
      var comp = a.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 14; comp.attack.value = 0.002; comp.release.value = 0.15;
      master = a.createGain(); master.gain.value = 1;
      master.connect(comp); comp.connect(a.destination);
    }
    return master;
  }
  // a tone that slides from one pitch to another (sirens)
  function sweep(f1, f2, start, dur, vol, type) {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + start, v = Math.max(vol, 0.0002);
    o.type = type || "sawtooth";
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.04);
    g.gain.setValueAtTime(v, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus(a)); o.start(t); o.stop(t + dur + 0.05);
  }
  var SOUNDS = {
    chime: function (v) { tone(784, 0, 0.5, v * 0.8); tone(988, 0.18, 0.7, v * 0.8); },
    bell: function (v) { tone(660, 0, 1.2, v * 0.7); tone(1320, 0, 0.8, v * 0.25); },
    pulse: function (v) { tone(520, 0, 0.18, v); tone(520, 0.3, 0.18, v); tone(520, 0.6, 0.18, v); },
    fanfare: function (v) {
      var n = [523, 659, 784, 1047, 784, 1047];
      for (var i = 0; i < n.length; i++) tone(n[i], i * 0.16, i === n.length - 1 ? 0.6 : 0.22, v * 0.7, "triangle");
    },
    alarm: function (v) { for (var i = 0; i < 6; i++) tone(i % 2 ? 660 : 880, i * 0.28, 0.22, v * 0.8, "square"); },
    clock: function (v) { for (var r = 0; r < 3; r++) for (var i = 0; i < 4; i++) tone(1400, r * 0.9 + i * 0.14, 0.09, v * 0.8, "square"); },
    siren: function (v) { sweep(600, 1300, 0, 0.9, v * 0.7); sweep(1300, 600, 0.9, 0.9, v * 0.7); sweep(600, 1300, 1.8, 0.9, v * 0.7); },
    emergency: function (v) { for (var i = 0; i < 6; i++) tone(i % 2 ? 770 : 960, i * 0.4, 0.38, v * 0.75, "square"); },
    rising: function (v) { for (var i = 0; i < 6; i++) tone(500 + i * 160, i * 0.35, 0.28, v * (0.35 + i * 0.13), "square"); },
    // layered square and saw waves around 3 kHz, where hearing is most sensitive: the loudest option
    ultra: function (v) {
      for (var i = 0; i < 8; i++) {
        tone(i % 2 ? 3200 : 2800, i * 0.18, 0.16, v * 0.8, "square");
        tone(i % 2 ? 1600 : 1400, i * 0.18, 0.16, v * 0.5, "sawtooth");
      }
    }
  };
  // how much the loud sounds are pushed before the limiter (gentle sounds are left alone)
  var BOOST = { fanfare: 1.2, alarm: 2, clock: 2.2, siren: 2.4, emergency: 2.4, rising: 2, ultra: 3 };
  function play(kind) {
    if (!SOUNDS[kind]) return;
    var a = audio(); if (!a) return;
    bus(a).gain.value = BOOST[kind] || 1;
    SOUNDS[kind](Math.min(Math.max(Number(S.volume) || 0.4, 0.05), 1) * 0.95); // the volume slider goes all the way to full
  }
  function stopSound() { if (loopTimer) clearInterval(loopTimer); loopTimer = null; }
  function startSound(kind) {
    stopSound(); play(kind);
    if (S.repeat) {
      var n = 0;
      loopTimer = setInterval(function () { n++; if (n >= 20) { stopSound(); return; } play(kind); }, 3000);
    }
  }

  function toMin(s) { var p = String(s).split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
  function quiet() {
    if (!S.quietOn) return false;
    var n = new Date(), m = n.getHours() * 60 + n.getMinutes(), a = toMin(S.qs), b = toMin(S.qe);
    return a <= b ? (m >= a && m < b) : (m >= a || m < b);
  }
  async function permission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "default") return await Notification.requestPermission();
    return Notification.permission;
  }
  async function sysNotify(rem) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      var opts = { body: rem.title, icon: "/icon-192.png", tag: rem.id };
      var reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) reg.showNotification("UPWISE reminder", opts); else new Notification("UPWISE reminder", opts);
    } catch (e) {}
  }

  /* ---- on-screen alert cards ---- */
  function stack() {
    var s = document.getElementById("alert-stack");
    if (!s) {
      s = document.createElement("div"); s.id = "alert-stack"; s.className = "alert-stack";
      s.setAttribute("role", "region"); s.setAttribute("aria-label", "Reminders");
      document.body.appendChild(s);
    }
    return s;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
  }
  function done(card) { if (card.parentNode) card.parentNode.removeChild(card); changed(); }
  function showAlert(rem, late) {
    var card = el("div", "alert-card");
    card.appendChild(el("h4", null, rem.title));
    card.appendChild(el("div", "meta", late ? "Missed at " + new Date(rem.remind_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }) : "Now"));
    var r = el("div", "row2");
    var sn = el("button", "btn ghost small", "Snooze 10 min"); sn.type = "button";
    sn.addEventListener("click", async function () {
      stopSound();
      await sb.from("reminders").update({ status: "pending", remind_at: new Date(Date.now() + 600000).toISOString() }).eq("id", rem.id);
      done(card);
    });
    var dm = el("button", "btn primary small", "Dismiss"); dm.type = "button";
    dm.addEventListener("click", async function () {
      stopSound();
      await sb.from("reminders").update({ status: "dismissed" }).eq("id", rem.id);
      done(card);
    });
    r.appendChild(sn); r.appendChild(dm);
    if (!late && S.sound !== "off" && S.repeat) {
      var st = el("button", "btn ghost small", "Stop sound"); st.type = "button";
      st.addEventListener("click", stopSound); r.appendChild(st);
    }
    card.appendChild(r);
    stack().appendChild(card);
  }
  function notify(rem, late) {
    showAlert(rem, late);
    if (late || quiet()) return;
    sysNotify(rem);
    if (S.sound !== "off") { startSound(S.sound); try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]); } catch (e) {} }
  }

  /* ---- checking for due reminders ---- */
  function changed() { if (typeof window.onAlertsChanged === "function") window.onAlertsChanged(); renderCard(); }
  async function tick() {
    if (busy || !uid || (navigator.onLine === false)) return;
    busy = true;
    try {
      var r = await sb.from("reminders").select("id,title,remind_at").eq("status", "pending")
        .lte("remind_at", new Date().toISOString()).order("remind_at").limit(10);
      if (r.error || !r.data) return;
      for (var i = 0; i < r.data.length; i++) {
        var rem = r.data[i];
        // claim it first, so two open tabs never alert twice
        var c = await sb.from("reminders").update({ status: "fired" }).eq("id", rem.id).eq("status", "pending").select("id");
        if (c.error || !c.data || !c.data.length) continue;
        notify(rem, Date.now() - new Date(rem.remind_at).getTime() > 120000);
      }
    } finally { busy = false; changed(); }
  }

  /* ---- small "Reminders" card on the Today screen ---- */
  async function renderCard() {
    var box = document.getElementById("rem-list"); if (!box || !uid) return;
    var r = await sb.from("reminders").select("id,title,remind_at").eq("status", "pending").order("remind_at").limit(3);
    if (r.error) return;
    box.innerHTML = "";
    if (!r.data.length) { box.appendChild(el("p", "muted", "No reminders set.")); }
    r.data.forEach(function (x) {
      var row = el("div", "tx-row"), mid = el("div", "grow");
      mid.appendChild(el("div", null, x.title));
      mid.appendChild(el("div", "meta", new Date(x.remind_at).toLocaleString("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })));
      row.appendChild(mid); box.appendChild(row);
    });
    var a = el("a", null, "Manage reminders"); a.href = "reminders.html"; a.style.color = "var(--accent)"; box.appendChild(a);
  }

  window.upwiseAlerts = { settings: S, save: save, play: play, stop: stopSound, permission: permission, check: tick, quiet: quiet };

  (async function init() {
    var s = await sb.auth.getSession();
    if (!s.data.session) return;
    uid = s.data.session.user.id;
    tick(); renderCard();
    setInterval(tick, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
    window.addEventListener("online", tick);
  })();
})();
