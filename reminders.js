(function () {
  var sb = window.upwise.sb, A = window.upwiseAlerts, uid = null;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function say(t) { $("msg").textContent = t || ""; }
  function fmt(iso) { return new Date(iso).toLocaleString("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
  function localInput(d) { function p(n) { return ("0" + n).slice(-2); } return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); }
  function xbtn(label, fn) { var b = el("button", "x", "\u00D7"); b.type = "button"; b.setAttribute("aria-label", label); b.addEventListener("click", fn); return b; }
  function sbtn(text, cls, fn) { var b = el("button", "btn " + cls + " small", text); b.type = "button"; b.addEventListener("click", fn); return b; }
  async function db(p) { var r = await p; if (r.error) { say("Could not save: " + r.error.message); throw r.error; } return r; }
  async function act(fn) { say(""); try { await fn(); await load(); } catch (e) {} }

  async function load() {
    var a = await sb.from("reminders").select("id,title,remind_at").eq("status", "pending").order("remind_at");
    var b = await sb.from("reminders").select("id,title,remind_at,status").in("status", ["fired", "dismissed"]).order("remind_at", { ascending: false }).limit(20);
    if (a.error || b.error) { say("Could not load reminders. Reminders need a one-time database setup, or check your connection."); return; }
    var up = $("upcoming"); up.innerHTML = "";
    if (!a.data.length) up.appendChild(el("p", "muted", "Nothing coming up. Add a reminder above."));
    a.data.forEach(function (r) {
      var row = el("div", "card card-top"), info = el("div", "card-info");
      info.appendChild(el("h3", null, r.title)); info.appendChild(el("p", "meta", fmt(r.remind_at)));
      row.appendChild(info);
      row.appendChild(xbtn("Delete reminder", function () { act(function () { return db(sb.from("reminders").delete().eq("id", r.id)); }); }));
      up.appendChild(row);
    });
    var c = $("centre"); c.innerHTML = "";
    if (!b.data.length) c.appendChild(el("p", "muted", "No notifications yet."));
    b.data.forEach(function (r) {
      var row = el("div", "card"), top = el("div", "card-top"), info = el("div", "card-info");
      info.appendChild(el("h3", null, r.title)); info.appendChild(el("p", "meta", fmt(r.remind_at) + (r.status === "fired" ? " \u00B7 New" : " \u00B7 Dismissed")));
      top.appendChild(info);
      if (r.status === "fired") {
        var acts = el("div", "card-actions");
        acts.appendChild(sbtn("Snooze 10 min", "ghost", function () { act(function () { return db(sb.from("reminders").update({ status: "pending", remind_at: new Date(Date.now() + 600000).toISOString() }).eq("id", r.id)); }); }));
        acts.appendChild(sbtn("Dismiss", "primary", function () { act(function () { return db(sb.from("reminders").update({ status: "dismissed" }).eq("id", r.id)); }); }));
        top.appendChild(acts);
      }
      row.appendChild(top); c.appendChild(row);
    });
  }
  window.onAlertsChanged = load;

  $("rem-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("rem-title").value.trim(), w = $("rem-when").value;
    if (!t) return say("Say what the reminder is for.");
    if (!w) return say("Pick a date and time.");
    var d = new Date(w);
    if (isNaN(d) || d.getTime() < Date.now() + 30000) return say("Pick a time in the future.");
    act(async function () { await db(sb.from("reminders").insert({ user_id: uid, title: t, remind_at: d.toISOString() })); $("rem-title").value = ""; $("rem-when").value = ""; });
  });
  document.querySelectorAll("[data-in]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.dataset["in"], d = new Date();
      if (v === "tomorrow") { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); } else d = new Date(Date.now() + parseInt(v, 10) * 60000);
      $("rem-when").value = localInput(d);
    });
  });

  $("auto-go").addEventListener("click", function () {
    act(async function () {
      var mode = $("auto-when").value, now = Date.now(), rows = [];
      function stamp(iso) {
        var p = iso.split("-"), d = mode === "eve" ? new Date(+p[0], +p[1] - 1, +p[2] - 1, 18, 0) : new Date(+p[0], +p[1] - 1, +p[2], 8, 0);
        return d;
      }
      var ex = await db(sb.from("exams").select("id,subject,exam_date"));
      ex.data.forEach(function (x) { var d = stamp(x.exam_date); if (d.getTime() > now) rows.push({ user_id: uid, title: "Exam: " + x.subject, remind_at: d.toISOString(), source: "exam", source_id: x.id }); });
      var as = await db(sb.from("assignments").select("id,title,due_date").eq("done", false).not("due_date", "is", null));
      as.data.forEach(function (x) { var d = stamp(x.due_date); if (d.getTime() > now) rows.push({ user_id: uid, title: "Due: " + x.title, remind_at: d.toISOString(), source: "assignment", source_id: x.id }); });
      if (!rows.length) { say("Nothing to add. Your exams and assignments are either past or have no date."); return; }
      var r = await db(sb.from("reminders").upsert(rows, { onConflict: "user_id,source,source_id,remind_at", ignoreDuplicates: true }).select("id"));
      say(r.data.length ? "Created " + r.data.length + (r.data.length === 1 ? " reminder." : " reminders.") : "You already have all of these reminders.");
    });
  });

  /* settings */
  var S = A.settings;
  $("snd").value = S.sound; $("vol").value = S.volume; $("repmin").value = String(S.repeatMin); $("vib").checked = !!S.vibrate; $("vibp").value = S.vibPattern;
  $("qon").checked = !!S.quietOn; $("qs").value = S.qs; $("qe").value = S.qe;
  function store() { S.sound = $("snd").value; S.volume = parseFloat($("vol").value); S.repeatMin = parseInt($("repmin").value, 10) || 0; S.vibrate = $("vib").checked; S.vibPattern = $("vibp").value; S.quietOn = $("qon").checked; S.qs = $("qs").value || "22:00"; S.qe = $("qe").value || "07:00"; A.save(); syncPush(); }
  ["snd", "vol", "repmin", "vib", "vibp", "qon", "qs", "qe"].forEach(function (id) { $(id).addEventListener("change", store); });
  $("prev").addEventListener("click", function () {
    store(); A.stop();
    if (S.sound === "off" && !S.vibrate) { $("perm-state").textContent = "Choose a sound or turn on vibration first. Both are off."; return; }
    if (S.sound !== "off") A.play(S.sound);
    if (S.vibrate) A.vibrate();
  });
  $("tvib").addEventListener("click", function () {
    store(); A.stop();
    $("perm-state").textContent = A.vibrate() ? "Vibrating now." : "This phone or browser did not vibrate. Some browsers need you to tap the page first, and iPhones do not allow it.";
  });
  /* background (push) alerts */
  var pushSub = null;
  function b64ToBytes(b) {
    var pad = "=".repeat((4 - b.length % 4) % 4), raw = atob((b + pad).replace(/-/g, "+").replace(/_/g, "/")), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function pushSay(t) { $("push-state").textContent = t; }
  function pushUi(on) { $("push-on").hidden = on; $("push-off").hidden = !on; }
  function prefs() {
    return { tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || null), quiet_on: !!S.quietOn, quiet_start: S.qs, quiet_end: S.qe, vib: S.vibPattern };
  }
  function syncPush() {
    if (!pushSub) return;
    sb.from("push_subscriptions").update(prefs()).eq("endpoint", pushSub.endpoint).then(function () {});
  }
  async function pushInit() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { pushSay("This browser does not support background alerts. On iPhone, add UPWISE to the home screen first."); $("push-on").disabled = true; return; }
    try {
      var reg = await navigator.serviceWorker.ready;
      pushSub = await reg.pushManager.getSubscription();
      pushUi(!!pushSub);
      pushSay(pushSub ? "Background alerts are on for this device." : "Background alerts are off.");
    } catch (e) { pushSay("Could not check background alerts."); }
  }
  $("push-on").addEventListener("click", async function () {
    pushSay("Setting up\u2026");
    try {
      if ((await A.permission()) !== "granted") { pushSay("Allow notifications first. If they are blocked, turn them on in your browser's site settings."); return; }
      var k = await (await fetch("/api/push-key")).json();
      if (!k.key) { pushSay("The server is not set up for background alerts yet."); return; }
      var reg = await navigator.serviceWorker.ready;
      pushSub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(k.key) }));
      var j = pushSub.toJSON();
      var row = prefs(); row.user_id = uid; row.endpoint = j.endpoint; row.p256dh = j.keys.p256dh; row.auth = j.keys.auth;
      var r = await sb.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
      if (r.error) { pushSay("Could not save this device: " + r.error.message); return; }
      pushUi(true); pushSay("Background alerts are on for this device. Tap Send a test.");
    } catch (e) { pushSay("Could not turn on background alerts: " + (e.message || "try again.")); }
  });
  $("push-off").addEventListener("click", async function () {
    try {
      if (pushSub) { var ep = pushSub.endpoint; await pushSub.unsubscribe(); await sb.from("push_subscriptions").delete().eq("endpoint", ep); }
      pushSub = null; pushUi(false); pushSay("Background alerts are off.");
    } catch (e) { pushSay("Could not turn them off. Try again."); }
  });
  $("push-test").addEventListener("click", async function () {
    pushSay("Sending a test\u2026");
    try {
      var s2 = await sb.auth.getSession();
      var r = await fetch("/api/push-test", { method: "POST", headers: { Authorization: "Bearer " + s2.data.session.access_token } });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { pushSay(d.error || "The test could not be sent."); return; }
      pushSay(d.sent ? "Test sent. A notification should appear in a moment, even if you leave the app." : "The test could not be delivered. Try turning background alerts off and on again.");
    } catch (e) { pushSay("The test could not be sent. Check your connection."); }
  });

  function permState() {
    var s = !("Notification" in window) ? "Not supported in this browser." : Notification.permission === "granted" ? "Notifications are on." : Notification.permission === "denied" ? "Notifications are blocked. Turn them on in your browser's site settings." : "Notifications are off.";
    $("perm-state").textContent = s;
  }
  $("perm").addEventListener("click", async function () { await A.permission(); permState(); });
  permState();

  (async function init() {
    var s = await sb.auth.getSession();
    if (!s.data.session) { location.href = "login.html"; return; }
    uid = s.data.session.user.id;
    document.body.hidden = false;
    load();
    pushInit();
  })();
})();
