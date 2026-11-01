(function () {
  var sb = window.upwise.sb, uid = null, tz = null, T = "", weekStart = "";
  var cur = "NGN";
  try { cur = localStorage.getItem("upwise-currency") || "NGN"; } catch (e) {}
  var EXP = ["Food", "Transport", "Data and airtime", "Rent and bills", "School", "Health", "Savings", "Entertainment", "Other"];
  var facts = { exams: [], tasks: [], blocks: [], habits: [], steps: [] };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function say(t) { var m = $("msg"); if (m) m.textContent = t || ""; }
  function money(n) {
    try { return new Intl.NumberFormat("en-NG", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n); }
    catch (e) { return cur + " " + Math.round(n); }
  }
  function today() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function utc(s) { var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(iso, n) { return new Date(utc(iso) + n * 864e5).toISOString().slice(0, 10); }
  function between(a, b) { return Math.round((utc(b) - utc(a)) / 864e5); }
  function dayIdx() {
    try {
      var w = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: tz }).format(new Date());
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(w);
    } catch (e) { return new Date().getDay(); }
  }
  function when(n) { return n < 0 ? "Overdue by " + Math.abs(n) + (n === -1 ? " day" : " days") : n === 0 ? "Today" : n === 1 ? "Tomorrow" : "In " + n + " days"; }
  function sum(list, key) { return list.reduce(function (a, x) { return a + Number(x[key]); }, 0); }

  function row(title, meta, lead, trail) {
    var r = el("div", "tx-row");
    if (lead) r.appendChild(lead);
    var mid = el("div", "grow");
    mid.appendChild(el("div", null, title));
    if (meta) mid.appendChild(el("div", "meta" + (/^Overdue|^Over budget/.test(meta) ? " warn" : ""), meta));
    r.appendChild(mid);
    if (trail) r.appendChild(trail);
    return r;
  }
  function checkbox(label, fn) {
    var c = el("input"); c.type = "checkbox"; c.setAttribute("aria-label", label);
    c.addEventListener("change", fn); return c;
  }
  function link(text, href) { var a = el("a", null, text); a.href = href; a.style.color = "var(--accent)"; return a; }
  function empty(box, text, href, label) {
    var p = el("p", "muted", text + " ");
    if (href) p.appendChild(link(label, href));
    box.appendChild(p);
  }
  async function act(fn) {
    say("");
    try { var r = await fn(); if (r && r.error) throw r.error; await load(); }
    catch (e) { say("Could not save: " + (e.message || "try again.")); }
  }

  async function load() {
    T = today();
    var off = (dayIdx() + 6) % 7; weekStart = addDays(T, -off);
    var nextMonth = new Date(Date.UTC(+T.slice(0, 4), +T.slice(5, 7), 1)).toISOString().slice(0, 10);
    var q = await Promise.all([
      sb.from("exams").select("id,subject,exam_date").gte("exam_date", T).lte("exam_date", addDays(T, 30)).order("exam_date"),
      sb.from("assignments").select("id,title,due_date").eq("done", false).order("due_date", { ascending: true, nullsFirst: false }),
      sb.from("study_blocks").select("id,subject,start_time,end_time").eq("weekday", dayIdx()).order("start_time"),
      sb.from("habits").select("id,title").order("created_at"),
      sb.from("habit_logs").select("habit_id,day").gte("day", addDays(T, -6)),
      sb.from("goals").select("id,title,created_at,goal_steps(id,title,done,created_at)").order("created_at"),
      sb.from("budgets").select("category,monthly_limit"),
      sb.from("transactions").select("category,amount").eq("kind", "expense").gte("tx_date", T.slice(0, 7) + "-01").lt("tx_date", nextMonth).limit(1000),
      sb.from("transactions").select("amount,tx_date").eq("kind", "expense").gte("tx_date", addDays(T, -13)).limit(1000)
    ]);
    if (q.some(function (x) { return x.error; })) { say("Could not load today\u2019s overview. Check your connection and try again."); return; }
    var soon = q[1].data.filter(function (t) { return t.due_date && between(T, t.due_date) <= 7; });
    renderGlance(q[0].data, q[1].data, soon, q[3].data, q[4].data);
    renderUp(q[0].data, soon);
    renderPlan(q[2].data, q[3].data, q[4].data, q[5].data);
    renderMoney(q[6].data, q[7].data);
    renderWeek(q[3].data, q[4].data, q[5].data, q[1].data, q[8].data);
  }

  function tile(label, value, sub) {
    var t = el("div", "sum");
    t.appendChild(el("small", null, label)); t.appendChild(el("b", null, value)); t.appendChild(el("small", null, sub));
    return t;
  }
  function renderGlance(exams, open, soon, habits, logs) {
    var box = $("glance"); box.innerHTML = "";
    var ex = exams[0], n = ex ? between(T, ex.exam_date) : null;
    box.appendChild(tile("Next exam", ex ? (n === 0 ? "Today" : n + (n === 1 ? " day" : " days")) : "\u2014", ex ? ex.subject : "None in 30 days"));
    var late = open.filter(function (t) { return t.due_date && t.due_date < T; }).length;
    box.appendChild(tile("Due this week", String(soon.length), late ? late + " overdue" : "None overdue"));
    var done = logs.filter(function (l) { return l.day === T; }).length;
    box.appendChild(tile("Habits today", habits.length ? done + " of " + habits.length : "\u2014", habits.length ? "checked in" : "None yet"));
  }

  function renderUp(exams, soon) {
    var box = $("up-list"); box.innerHTML = "";
    facts.exams = []; facts.tasks = [];
    exams.forEach(function (x) {
      var n = between(T, x.exam_date);
      facts.exams.push(x.subject + " exam " + when(n).toLowerCase());
      box.appendChild(row(x.subject + " exam", when(n)));
    });
    soon.forEach(function (t) {
      var n = between(T, t.due_date);
      facts.tasks.push(t.title + " (" + when(n).toLowerCase() + ")");
      var c = checkbox("Mark " + t.title + " done", function () { act(function () { return sb.from("assignments").update({ done: true }).eq("id", t.id); }); });
      box.appendChild(row(t.title, when(n), c));
    });
    if (!box.children.length) empty(box, "Nothing urgent in the next week.", "student.html", "Add an exam or assignment");
  }

  function renderPlan(blocks, habits, logs, goals) {
    var box = $("plan-list"); box.innerHTML = "";
    facts.blocks = []; facts.habits = []; facts.steps = [];
    blocks.forEach(function (b) {
      var t = b.start_time.slice(0, 5) + " to " + b.end_time.slice(0, 5);
      facts.blocks.push(t + " " + b.subject);
      box.appendChild(row("Study " + b.subject, t));
    });
    var done = {}; logs.forEach(function (l) { if (l.day === T) done[l.habit_id] = true; });
    habits.forEach(function (h) {
      if (done[h.id]) { box.appendChild(row("\u2713 " + h.title, "Done today")); return; }
      facts.habits.push(h.title);
      var b = el("button", "btn ghost small", "Done"); b.type = "button";
      b.addEventListener("click", function () { act(function () { return sb.from("habit_logs").insert({ habit_id: h.id, user_id: uid, day: T }); }); });
      box.appendChild(row(h.title, "Habit", null, b));
    });
    var shown = 0;
    goals.forEach(function (g) {
      if (shown >= 3) return;
      var next = (g.goal_steps || []).filter(function (s) { return !s.done; }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; })[0];
      if (!next) return;
      shown++;
      facts.steps.push(next.title + " (goal: " + g.title + ")");
      var c = checkbox("Mark " + next.title + " done", function () { act(function () { return sb.from("goal_steps").update({ done: true }).eq("id", next.id); }); });
      box.appendChild(row(next.title, "Next step for " + g.title, c));
    });
    if (!box.children.length) empty(box, "Nothing planned for today.", "personal.html", "Add a goal or habit");
  }

  function renderMoney(budgets, txs) {
    var card = $("card-money"), box = $("money-list");
    box.innerHTML = "";
    if (!budgets.length && !txs.length) { card.hidden = true; return; }
    card.hidden = false;
    var spent = {}, total = 0;
    txs.forEach(function (t) { var a = Number(t.amount); spent[t.category] = (spent[t.category] || 0) + a; total += a; });
    box.appendChild(row("Spent this month", money(total)));
    var flagged = 0;
    budgets.forEach(function (b) {
      var s = spent[b.category] || 0, lim = Number(b.monthly_limit);
      if (s / lim < 0.8) return;
      flagged++;
      box.appendChild(row(b.category, s > lim ? "Over budget: " + money(s) + " of " + money(lim) : money(s) + " of " + money(lim) + " used"));
    });
    if (budgets.length && !flagged) box.appendChild(el("p", "meta", "All your budgets are on track."));
    box.appendChild(link("Open money tools", "money.html"));
  }

  /* weekly review */
  function renderWeek(habits, logs, goals, open, wkTx) {
    var box = $("wk-stats"); box.innerHTML = "";
    habits.forEach(function (h) {
      var days = {}; logs.forEach(function (l) { if (l.habit_id === h.id) days[l.day] = true; });
      box.appendChild(row(h.title, Object.keys(days).length + " of 7 days this week"));
    });
    var from = addDays(T, -6), prevFrom = addDays(T, -13);
    var thisWk = wkTx.filter(function (t) { return t.tx_date >= from; }), lastWk = wkTx.filter(function (t) { return t.tx_date < from && t.tx_date >= prevFrom; });
    if (thisWk.length || lastWk.length) box.appendChild(row("Spending", money(sum(thisWk, "amount")) + " this week, " + money(sum(lastWk, "amount")) + " the week before"));
    var late = open.filter(function (t) { return t.due_date && t.due_date < T; }).length;
    box.appendChild(row("Assignments", open.length + " open" + (late ? ", " + late + " overdue" : "")));
    goals.forEach(function (g) {
      var st = g.goal_steps || [], d = st.filter(function (s) { return s.done; }).length;
      box.appendChild(row(g.title, st.length ? Math.round(d / st.length * 100) + "% of steps done" : "No steps yet"));
    });
  }
  function wkMsg(t, ok) { var m = $("wk-msg"); m.textContent = t || ""; m.className = "form-msg" + (t ? (ok ? " ok" : " err") : ""); }
  var wkBroken = false;
  function wkSaved(on) { var b = $("wk-save"); b.disabled = on; b.textContent = on ? "Saved \u2713" : "Save review"; }
  $("wk-note").addEventListener("input", function () { if (!wkBroken) { wkMsg(""); wkSaved(false); } });
  async function loadWeekNote() {
    var r = await sb.from("weekly_reviews").select("note").eq("week_start", weekStart).maybeSingle();
    if (r.error) { wkBroken = true; wkMsg("Weekly notes need a one-time setup in the database."); $("wk-save").disabled = true; return; }
    if (r.data) { $("wk-note").value = r.data.note; wkSaved(true); }
  }
  $("wk-save").addEventListener("click", async function () {
    var note = $("wk-note").value.trim();
    if (!note) return wkMsg("Write a line or two first.");
    var r = await sb.from("weekly_reviews").upsert({ user_id: uid, week_start: weekStart, note: note, updated_at: new Date().toISOString() }, { onConflict: "user_id,week_start" });
    if (r.error) wkMsg("Could not save: " + r.error.message); else { wkMsg(""); wkSaved(true); }
  });

  /* quick add */
  var QA = {
    task: { l1: "Assignment", t1: "text", l2: "Due date (optional)", t2: "date", cat: false, two: true },
    exam: { l1: "Subject or exam", t1: "text", l2: "Exam date", t2: "date", cat: false, two: true },
    expense: { l1: "Amount", t1: "number", l2: "Note (optional)", t2: "text", cat: true, two: true },
    habit: { l1: "Habit", t1: "text", l2: "", t2: "text", cat: false, two: false }
  };
  function qaMode() {
    var m = QA[$("qa-type").value] || QA.task;
    $("qa-l1").textContent = m.l1; $("qa-1").type = m.t1; $("qa-1").value = "";
    $("qa-1").step = m.t1 === "number" ? "0.01" : ""; $("qa-1").maxLength = m.t1 === "text" ? 120 : 20;
    $("qa-l2").textContent = m.l2; $("qa-2").type = m.t2; $("qa-2").value = "";
    $("qa-w2").hidden = !m.two; $("qa-w3").hidden = !m.cat;
    $("qa-msg").textContent = "";
  }
  function qaSay(t, ok) { var m = $("qa-msg"); m.textContent = t || ""; m.className = "form-msg" + (t ? (ok ? " ok" : " err") : ""); }
  EXP.forEach(function (c) { var o = el("option", null, c); o.value = c; $("qa-3").appendChild(o); });
  $("qa-type").addEventListener("change", qaMode);
  $("qa-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var type = $("qa-type").value, v1 = $("qa-1").value.trim(), v2 = $("qa-2").value, req;
    if (!v1) return qaSay(type === "expense" ? "Enter an amount." : "Add a name first.");
    if (type === "task") req = sb.from("assignments").insert({ user_id: uid, title: v1, due_date: v2 || null });
    else if (type === "exam") { if (!v2) return qaSay("Pick the exam date."); req = sb.from("exams").insert({ user_id: uid, subject: v1, exam_date: v2 }); }
    else if (type === "habit") req = sb.from("habits").insert({ user_id: uid, title: v1 });
    else {
      var a = Math.round(parseFloat(v1) * 100) / 100;
      if (!isFinite(a) || a <= 0 || a > 999999999999.99) return qaSay("Enter an amount greater than zero.");
      req = sb.from("transactions").insert({ user_id: uid, kind: "expense", amount: a, category: $("qa-3").value, note: v2 || null, tx_date: T });
    }
    var r = await req;
    if (r.error) return qaSay("Could not save: " + r.error.message);
    qaMode(); qaSay("Added.", true); load();
  });

  /* AI day plan: sends item titles only */
  $("ai-plan").addEventListener("click", async function () {
    var btn = $("ai-plan"), out = $("ai-out");
    var parts = ["Today is " + T + "."];
    function add(label, list) { parts.push(label + ": " + (list.length ? list.join("; ") : "none") + "."); }
    add("Exams in the next 30 days", facts.exams); add("Assignments due within 7 days", facts.tasks);
    add("Study blocks today", facts.blocks); add("Habits not yet done today", facts.habits); add("Next goal steps", facts.steps);
    btn.disabled = true; btn.textContent = "Planning\u2026"; out.textContent = ""; say("");
    try {
      var s = await sb.auth.getSession();
      if (!s.data.session) { location.href = "login.html"; return; }
      var r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.data.session.access_token },
        body: JSON.stringify({ mode: "today", message: parts.join("\n") })
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(data.error || "Something went wrong.");
      out.textContent = String(data.reply).replace(/^#{1,6}\s+/gm, "").replace(/^\s*[*-]\s+/gm, "\u2022 ").replace(/\*/g, "").replace(/`/g, "");
    } catch (err) {
      say((err.message || "Something went wrong.") + " Try again.");
    } finally {
      btn.disabled = false; btn.textContent = "Plan my day";
    }
  });

  (async function init() {
    var s = await sb.auth.getSession();
    if (!s.data.session) { location.href = "login.html"; return; }
    uid = s.data.session.user.id;
    var p = await sb.from("profiles").select("timezone").eq("id", uid).maybeSingle();
    tz = (p.data && p.data.timezone) || null;
    qaMode();
    await load();
    loadWeekNote();
  })();
})();
