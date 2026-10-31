(function () {
  var sb = window.upwise.sb, uid = null, tz = null;
  var exams = [], tasks = [], blocks = [];
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var ORDER = [1, 2, 3, 4, 5, 6, 0];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function say(t) { $("msg").textContent = t || ""; }
  function today() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function utc(s) { var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function between(a, b) { return Math.round((utc(b) - utc(a)) / 864e5); }
  function fmtDate(s) {
    return new Date(utc(s)).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  function todayIdx() {
    try {
      var w = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: tz }).format(new Date());
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w);
    } catch (e) { return new Date().getDay(); }
  }
  async function db(p) {
    var r = await p;
    if (r.error) { say("Could not save: " + r.error.message); throw r.error; }
    return r;
  }
  async function act(fn) { say(""); try { await fn(); await load(); } catch (e) { /* shown */ } }
  function delBtn(label, fn) {
    var b = el("button", "x", "\u00D7"); b.type = "button"; b.setAttribute("aria-label", label);
    b.addEventListener("click", fn); return b;
  }

  async function load() {
    var a = await sb.from("exams").select("id,subject,exam_date").order("exam_date", { ascending: true });
    var b = await sb.from("assignments").select("id,title,subject,due_date,done").order("created_at", { ascending: true });
    var c = await sb.from("study_blocks").select("id,subject,weekday,start_time,end_time").order("start_time", { ascending: true });
    if (a.error || b.error || c.error) { say("Could not load your data. Check your connection and try again."); return; }
    exams = a.data; tasks = b.data; blocks = c.data;
    renderExams(); renderTasks(); renderPlan();
  }

  function renderExams() {
    var box = $("exam-list"); box.innerHTML = "";
    if (!exams.length) { box.appendChild(el("p", "muted", "No exams yet. Add one to start a countdown.")); return; }
    exams.forEach(function (x) {
      var n = between(today(), x.exam_date);
      var card = el("article", "card card-top" + (n < 0 ? " past" : ""));
      card.appendChild(el("div", "big", n < 0 ? "\u2014" : String(n)));
      var info = el("div", "card-info");
      info.appendChild(el("h3", null, x.subject));
      info.appendChild(el("p", "meta", fmtDate(x.exam_date) + " \u00B7 " + (n < 0 ? "Exam passed" : n === 0 ? "Today. You have got this." : n === 1 ? "1 day to go" : n + " days to go")));
      card.appendChild(info);
      card.appendChild(delBtn("Delete exam", function () { if (confirm("Delete this exam?")) act(function () { return db(sb.from("exams").delete().eq("id", x.id)); }); }));
      box.appendChild(card);
    });
  }

  function renderTasks() {
    var ul = $("task-list"); ul.innerHTML = "";
    var done = tasks.filter(function (t) { return t.done; }).length;
    $("task-prog").textContent = tasks.length ? done + " of " + tasks.length + " done" : "";
    if (!tasks.length) { var li0 = el("li", null); li0.appendChild(el("span", "muted", "No assignments yet.")); ul.appendChild(li0); return; }
    var t0 = today();
    tasks.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      var x = a.due_date || "9999", y = b.due_date || "9999";
      return x < y ? -1 : x > y ? 1 : 0;
    }).forEach(function (t) {
      var li = el("li", t.done ? "done" : "");
      var cb = el("input"); cb.type = "checkbox"; cb.checked = t.done; cb.setAttribute("aria-label", t.title);
      cb.addEventListener("change", function () { act(function () { return db(sb.from("assignments").update({ done: cb.checked }).eq("id", t.id)); }); });
      var box = el("span"); box.appendChild(document.createTextNode(t.title));
      var bits = [];
      if (t.subject) bits.push(t.subject);
      var late = false;
      if (t.due_date) {
        var n = between(t0, t.due_date);
        late = !t.done && n < 0;
        bits.push(late ? "Overdue by " + Math.abs(n) + (Math.abs(n) === 1 ? " day" : " days") : n === 0 ? "Due today" : "Due " + fmtDate(t.due_date));
      }
      if (bits.length) { var m = el("div", "meta" + (late ? " warn" : ""), bits.join(" \u00B7 ")); box.appendChild(m); }
      li.appendChild(cb); li.appendChild(box);
      li.appendChild(delBtn("Delete assignment", function () { act(function () { return db(sb.from("assignments").delete().eq("id", t.id)); }); }));
      ul.appendChild(li);
    });
  }

  function renderPlan() {
    var box = $("plan-list"); box.innerHTML = "";
    if (!blocks.length) { box.appendChild(el("p", "muted", "No study blocks yet. Add a time you can really keep.")); return; }
    var ti = todayIdx();
    ORDER.forEach(function (d) {
      var list = blocks.filter(function (b) { return b.weekday === d; });
      if (!list.length) return;
      var card = el("article", "card");
      card.appendChild(el("h3", null, DAYS[d] + (d === ti ? " (today)" : "")));
      list.forEach(function (b) {
        var row = el("div", "block-row");
        row.appendChild(el("span", "t", b.start_time.slice(0, 5) + " - " + b.end_time.slice(0, 5)));
        row.appendChild(el("span", "grow", b.subject));
        row.appendChild(delBtn("Delete block", function () { act(function () { return db(sb.from("study_blocks").delete().eq("id", b.id)); }); }));
        card.appendChild(row);
      });
      box.appendChild(card);
    });
  }

  $("exam-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var s = $("ex-subject").value.trim(), d = $("ex-date").value;
    if (!s) return say("Add the subject or exam name.");
    if (!d) return say("Pick the exam date.");
    act(async function () { await db(sb.from("exams").insert({ user_id: uid, subject: s, exam_date: d })); $("ex-subject").value = ""; $("ex-date").value = ""; });
  });
  $("task-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("as-title").value.trim();
    if (!t) return say("Add the assignment title.");
    act(async function () {
      await db(sb.from("assignments").insert({ user_id: uid, title: t, subject: $("as-subject").value.trim() || null, due_date: $("as-due").value || null }));
      $("as-title").value = ""; $("as-subject").value = ""; $("as-due").value = "";
    });
  });
  $("block-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var s = $("bl-subject").value.trim(), a = $("bl-start").value, b = $("bl-end").value;
    if (!s) return say("Add the subject to study.");
    if (!a || !b) return say("Pick a start and end time.");
    if (b <= a) return say("The end time must be after the start time.");
    act(async function () {
      await db(sb.from("study_blocks").insert({ user_id: uid, subject: s, weekday: parseInt($("bl-day").value, 10), start_time: a, end_time: b }));
      $("bl-subject").value = "";
    });
  });

  var TABS = ["exams", "tasks", "plan", "focus"];
  TABS.forEach(function (k) {
    $("tab-" + k).addEventListener("click", function () {
      TABS.forEach(function (j) {
        $("tab-" + j).setAttribute("aria-selected", j === k ? "true" : "false");
        $("pane-" + j).hidden = j !== k;
      });
    });
  });

  /* focus timer: uses an end time so it stays correct if the screen sleeps */
  var T = { mode: "Focus", mins: 25, left: 25 * 60, end: 0, id: null, count: 0 };
  function show() {
    var m = Math.floor(T.left / 60), s = T.left % 60;
    $("t-time").textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    $("t-label").textContent = T.mode;
    $("t-go").textContent = T.id ? "Pause" : "Start";
  }
  function stop() { if (T.id) clearInterval(T.id); T.id = null; }
  function tick() {
    T.left = Math.max(0, Math.round((T.end - Date.now()) / 1000));
    if (T.left === 0) {
      stop();
      if (T.mode === "Focus") T.count++;
      $("t-note").textContent = (T.mode === "Focus" ? "Session complete. Take a real break. " : "Break over. ") + "Focus sessions finished today: " + T.count;
      T.left = T.mins * 60;
    }
    show();
  }
  $("t-go").addEventListener("click", function () {
    if (T.id) { stop(); show(); return; }
    T.end = Date.now() + T.left * 1000; T.id = setInterval(tick, 250); show();
  });
  $("t-reset").addEventListener("click", function () { stop(); T.left = T.mins * 60; show(); });
  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      stop(); T.mode = b.dataset.mode; T.mins = parseInt(b.dataset.min, 10); T.left = T.mins * 60; show();
    });
  });
  show();

  (async function init() {
    var s = await sb.auth.getSession();
    if (!s.data.session) { location.href = "login.html"; return; }
    uid = s.data.session.user.id;
    var p = await sb.from("profiles").select("timezone").eq("id", uid).maybeSingle();
    tz = (p.data && p.data.timezone) || null;
    document.body.hidden = false;
    load();
  })();
})();
