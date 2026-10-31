(function () {
  var sb = window.upwise.sb, uid = null, tz = null, editing = null;
  var goals = [], habits = [], logs = {};

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
  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function daysLeft(iso) {
    return Math.round((new Date(iso + "T00:00:00Z") - new Date(today() + "T00:00:00Z")) / 864e5);
  }
  function byCreated(a, b) { return a.created_at < b.created_at ? -1 : 1; }

  async function db(p) {
    var r = await p;
    if (r.error) { say("Could not save: " + r.error.message); throw r.error; }
    return r;
  }
  async function act(fn) {
    say("");
    try { await fn(); await load(); } catch (e) { /* message already shown */ }
  }

  async function load() {
    var g = await sb.from("goals").select("id,title,target_date,goal_steps(id,title,done,created_at)").order("created_at", { ascending: true });
    var h = await sb.from("habits").select("id,title").order("created_at", { ascending: true });
    var l = await sb.from("habit_logs").select("habit_id,day").gte("day", addDays(today(), -60));
    if (g.error || h.error || l.error) { say("Could not load your data. Check your connection and try again."); return; }
    goals = g.data; habits = h.data; logs = {};
    l.data.forEach(function (x) { (logs[x.habit_id] = logs[x.habit_id] || {})[x.day] = true; });
    renderGoals(); renderHabits();
  }

  function ring(pct) {
    var r = el("div", "ring"); r.style.setProperty("--p", pct);
    r.appendChild(el("span", null, pct + "%")); return r;
  }
  function btn(label, cls, fn) {
    var b = el("button", "btn ghost small " + (cls || ""), label); b.type = "button";
    b.addEventListener("click", fn); return b;
  }

  function renderGoals() {
    var box = $("goal-list"); box.innerHTML = "";
    if (!goals.length) { box.appendChild(el("p", "muted", "No goals yet. Start with one small, clear goal.")); return; }
    goals.forEach(function (g) {
      var steps = (g.goal_steps || []).slice().sort(byCreated);
      var done = steps.filter(function (s) { return s.done; }).length;
      var pct = steps.length ? Math.round(done / steps.length * 100) : 0;
      var card = el("article", "card"), top = el("div", "card-top"), info = el("div", "card-info");
      top.appendChild(ring(pct));

      if (editing === g.id) {
        var f = el("form", "inline-form");
        var ti = el("input", "field"); ti.type = "text"; ti.maxLength = 100; ti.value = g.title; ti.setAttribute("aria-label", "Goal title");
        var di = el("input", "field"); di.type = "date"; di.value = g.target_date || ""; di.setAttribute("aria-label", "Target date");
        var sv = el("button", "btn primary small", "Save"); sv.type = "submit";
        f.appendChild(ti); f.appendChild(di); f.appendChild(sv);
        f.appendChild(btn("Cancel", "", function () { editing = null; renderGoals(); }));
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var t = ti.value.trim();
          if (!t) return say("Give your goal a title.");
          act(function () { editing = null; return db(sb.from("goals").update({ title: t, target_date: di.value || null }).eq("id", g.id)); });
        });
        info.appendChild(f);
      } else {
        info.appendChild(el("h3", null, g.title));
        var meta = [];
        if (g.target_date) {
          var n = daysLeft(g.target_date);
          meta.push(n > 0 ? n + " days left" : n === 0 ? "Due today" : "Target date passed");
        }
        meta.push(steps.length ? done + " of " + steps.length + " steps" : "Add steps to track progress");
        info.appendChild(el("p", "meta", meta.join(" \u00B7 ")));
      }
      top.appendChild(info);
      if (editing !== g.id) {
        var acts = el("div", "card-actions");
        acts.appendChild(btn("Edit", "", function () { editing = g.id; renderGoals(); }));
        acts.appendChild(btn("Delete", "", function () {
          if (confirm("Delete this goal and its steps?")) act(function () { return db(sb.from("goals").delete().eq("id", g.id)); });
        }));
        top.appendChild(acts);
      }
      card.appendChild(top);

      var ul = el("ul", "steps");
      steps.forEach(function (s) {
        var li = el("li", s.done ? "done" : "");
        var cb = el("input"); cb.type = "checkbox"; cb.checked = s.done; cb.setAttribute("aria-label", s.title);
        cb.addEventListener("change", function () { act(function () { return db(sb.from("goal_steps").update({ done: cb.checked }).eq("id", s.id)); }); });
        var x = el("button", "x", "\u00D7"); x.type = "button"; x.setAttribute("aria-label", "Remove step");
        x.addEventListener("click", function () { act(function () { return db(sb.from("goal_steps").delete().eq("id", s.id)); }); });
        li.appendChild(cb); li.appendChild(el("span", null, s.title)); li.appendChild(x); ul.appendChild(li);
      });
      card.appendChild(ul);

      var sf = el("form", "inline-form"); sf.style.marginTop = "10px";
      var si = el("input", "field"); si.type = "text"; si.maxLength = 120; si.placeholder = "Add a small step"; si.setAttribute("aria-label", "New step");
      var sa = el("button", "btn ghost small", "Add"); sa.type = "submit";
      sf.appendChild(si); sf.appendChild(sa);
      sf.addEventListener("submit", function (e) {
        e.preventDefault();
        var t = si.value.trim(); if (!t) return;
        act(function () { return db(sb.from("goal_steps").insert({ goal_id: g.id, user_id: uid, title: t })); });
      });
      card.appendChild(sf);
      box.appendChild(card);
    });
  }

  function renderHabits() {
    var box = $("habit-list"); box.innerHTML = "";
    if (!habits.length) { box.appendChild(el("p", "muted", "No habits yet. Pick one small thing you can do most days.")); return; }
    var t = today();
    habits.forEach(function (h) {
      var set = logs[h.id] || {}, doneToday = !!set[t];
      var streak = 0, d = doneToday ? t : addDays(t, -1);
      while (set[d]) { streak++; d = addDays(d, -1); }
      var card = el("article", "card");
      var top = el("div", "card-top"), info = el("div", "card-info");
      info.appendChild(el("h3", null, h.title));
      info.appendChild(el("p", "meta", streak ? streak + (streak === 1 ? " day" : " days") + " in a row" : "Missed a day? Just start again today."));
      top.appendChild(info); card.appendChild(top);
      var dots = el("div", "dots"); dots.setAttribute("aria-label", "Last 7 days");
      for (var i = 6; i >= 0; i--) {
        var day = addDays(t, -i), dot = el("span", "dot" + (set[day] ? " on" : ""));
        dot.title = day; dots.appendChild(dot);
      }
      card.appendChild(dots);
      var row = el("div", "card-actions");
      var tg = el("button", "btn small " + (doneToday ? "ghost" : "primary"), doneToday ? "Undo today" : "Done today"); tg.type = "button";
      tg.addEventListener("click", function () {
        act(function () {
          return doneToday
            ? db(sb.from("habit_logs").delete().eq("habit_id", h.id).eq("day", t))
            : db(sb.from("habit_logs").insert({ habit_id: h.id, user_id: uid, day: t }));
        });
      });
      row.appendChild(tg);
      row.appendChild(btn("Delete", "", function () {
        if (confirm("Delete this habit and its history?")) act(function () { return db(sb.from("habits").delete().eq("id", h.id)); });
      }));
      card.appendChild(row); box.appendChild(card);
    });
  }

  $("goal-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("goal-title").value.trim();
    if (!t) return say("Give your goal a title.");
    act(async function () {
      await db(sb.from("goals").insert({ user_id: uid, title: t, target_date: $("goal-date").value || null }));
      $("goal-title").value = ""; $("goal-date").value = "";
    });
  });
  $("habit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("habit-title").value.trim();
    if (!t) return say("Give your habit a name.");
    act(async function () {
      await db(sb.from("habits").insert({ user_id: uid, title: t }));
      $("habit-title").value = "";
    });
  });

  function tab(which) {
    ["goals", "habits"].forEach(function (k) {
      $("tab-" + k).setAttribute("aria-selected", k === which ? "true" : "false");
      $("pane-" + k).hidden = k !== which;
    });
  }
  $("tab-goals").addEventListener("click", function () { tab("goals"); });
  $("tab-habits").addEventListener("click", function () { tab("habits"); });

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
