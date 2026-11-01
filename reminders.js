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
  $("snd").value = S.sound; $("vol").value = S.volume; $("rep").checked = !!S.repeat;
  $("qon").checked = !!S.quietOn; $("qs").value = S.qs; $("qe").value = S.qe;
  function store() { S.sound = $("snd").value; S.volume = parseFloat($("vol").value); S.repeat = $("rep").checked; S.quietOn = $("qon").checked; S.qs = $("qs").value || "22:00"; S.qe = $("qe").value || "07:00"; A.save(); }
  ["snd", "vol", "rep", "qon", "qs", "qe"].forEach(function (id) { $(id).addEventListener("change", store); });
  $("prev").addEventListener("click", function () {
    store(); A.stop();
    if (S.sound === "off") { $("perm-state").textContent = "Choose a sound first. Sounds are off until you pick one."; return; }
    A.play(S.sound);
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
  })();
})();
