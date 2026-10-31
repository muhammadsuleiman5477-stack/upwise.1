(function () {
  var sb = window.upwise.sb, uid = null;
  var current = null; // { situation, text, saved }
  var EXAMPLES = [
    "I don't know which career to choose.",
    "I need help organising my life.",
    "I want to learn a new skill.",
    "I have an important decision to make.",
    "I don't know how to start a business.",
    "I'm struggling to organise my studies."
  ];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function say(t) { $("msg").textContent = t || ""; }

  // tidy leftover markdown and show **bold** safely
  function setText(node, text) {
    node.textContent = "";
    text = String(text).replace(/^#{1,6}\s+/gm, "").replace(/^\s*[*-]\s+/gm, "\u2022 ").replace(/`/g, "");
    text.split(/(\*\*[^*\n]+\*\*)/g).forEach(function (part) {
      if (/^\*\*[^*\n]+\*\*$/.test(part)) { var b = el("strong", null, part.slice(2, -2)); node.appendChild(b); }
      else node.appendChild(document.createTextNode(part.replace(/\*/g, "")));
    });
  }

  function parse(text) {
    var out = [], cur = null;
    String(text).split("\n").forEach(function (line) {
      var m = line.match(/^\s*={2,}\s*(.+?)\s*={2,}\s*$/);
      if (m) { cur = { title: m[1], body: [] }; out.push(cur); }
      else if (cur) cur.body.push(line);
    });
    out = out.map(function (s) { return { title: s.title, body: s.body.join("\n").trim() }; }).filter(function (s) { return s.body; });
    return out.length ? out : [{ title: "Your plan", body: String(text).trim() }];
  }

  function showPlan(text) {
    var box = $("sections"); box.innerHTML = "";
    parse(text).forEach(function (s) {
      var card = el("article", "card");
      card.appendChild(el("h3", null, s.title));
      var body = el("div", "plan-body"); setText(body, s.body);
      card.appendChild(body); box.appendChild(card);
    });
    $("result").hidden = false;
  }

  function setSaved(saved) {
    current.saved = saved;
    $("save").disabled = saved;
    $("save").textContent = saved ? "Saved" : "Save this plan";
  }

  async function token() {
    var r = await sb.auth.getSession();
    if (!r.data.session) { location.href = "login.html"; return null; }
    return r.data.session.access_token;
  }

  $("stuck-form").addEventListener("submit", async function (e) {
    e.preventDefault(); say("");
    var text = $("situation").value.trim();
    if (text.length < 10) return say("Tell me a little more so I can help. A sentence or two is enough.");
    var btn = $("go"); btn.disabled = true; btn.textContent = "Thinking\u2026";
    $("result").hidden = true;
    try {
      var t = await token(); if (!t) return;
      var r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ mode: "stuck", message: text })
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(data.error || "Something went wrong.");
      current = { situation: text, text: data.reply, saved: false };
      showPlan(data.reply); setSaved(false);
      $("result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      say((err.message || "Something went wrong.") + " Try again.");
    } finally {
      btn.disabled = false; btn.textContent = "Help me get unstuck";
    }
  });

  $("save").addEventListener("click", async function () {
    if (!current || current.saved) return;
    $("save").disabled = true;
    var title = current.situation.replace(/\s+/g, " ").slice(0, 80);
    var r = await sb.from("stuck_plans").insert({ user_id: uid, title: title, situation: current.situation, content: current.text });
    if (r.error) { say("Could not save: " + r.error.message); $("save").disabled = false; return; }
    setSaved(true); loadPlans();
  });
  $("again").addEventListener("click", function () {
    current = null; $("result").hidden = true; $("situation").value = ""; $("count").textContent = "0 / 2000"; say("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("situation").addEventListener("input", function () { $("count").textContent = $("situation").value.length + " / 2000"; });
  EXAMPLES.forEach(function (t) {
    var b = el("button", null, t); b.type = "button";
    b.addEventListener("click", function () { $("situation").value = t; $("count").textContent = t.length + " / 2000"; $("situation").focus(); });
    $("examples").appendChild(b);
  });

  async function loadPlans() {
    var box = $("plans");
    var r = await sb.from("stuck_plans").select("id,title,situation,content,created_at").order("created_at", { ascending: false }).limit(30);
    if (r.error) { box.textContent = "Could not load saved plans."; return; }
    box.innerHTML = "";
    if (!r.data.length) { box.appendChild(el("p", "muted", "No saved plans yet.")); return; }
    r.data.forEach(function (p) {
      var row = el("div", "card card-top");
      var info = el("div", "card-info");
      info.appendChild(el("h3", null, p.title));
      info.appendChild(el("p", "meta", new Date(p.created_at).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })));
      row.appendChild(info);
      var open = el("button", "btn ghost small", "Open"); open.type = "button";
      open.addEventListener("click", function () {
        current = { situation: p.situation, text: p.content, saved: true };
        $("situation").value = p.situation; $("count").textContent = p.situation.length + " / 2000";
        showPlan(p.content); setSaved(true);
        $("result").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      var del = el("button", "x", "\u00D7"); del.type = "button"; del.setAttribute("aria-label", "Delete plan");
      del.addEventListener("click", async function () {
        if (!confirm("Delete this saved plan?")) return;
        var d = await sb.from("stuck_plans").delete().eq("id", p.id);
        if (d.error) { say("Could not delete: " + d.error.message); return; }
        loadPlans();
      });
      row.appendChild(open); row.appendChild(del); box.appendChild(row);
    });
  }

  (async function init() {
    var s = await sb.auth.getSession();
    if (!s.data.session) { location.href = "login.html"; return; }
    uid = s.data.session.user.id;
    document.body.hidden = false;
    loadPlans();
  })();
})();
