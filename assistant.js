(function () {
  var sb = window.upwise.sb;
  function $(id) { return document.getElementById(id); }
  var log = $("log"), input = $("input"), send = $("send"), drawer = $("drawer");
  var convId = null, busy = false;
  var STARTERS = ["Help me plan my study week", "Explain compound interest simply", "I don't know which career to choose"];

  function setText(node, text) {
    node.textContent = "";
    text = String(text).replace(/^#{1,6}\s+/gm, "").replace(/^\s*[*-]\s+/gm, "\u2022 ").replace(/`/g, "");
    text.split(/(\*\*[^*\n]+\*\*)/g).forEach(function (part) {
      if (/^\*\*[^*\n]+\*\*$/.test(part)) {
        var b = document.createElement("strong"); b.textContent = part.slice(2, -2); node.appendChild(b);
      } else node.appendChild(document.createTextNode(part.replace(/\*/g, "")));
    });
  }
  function add(cls, text) {
    var d = document.createElement("div");
    d.className = "bubble " + cls;
    if (cls === "ai") setText(d, text); else d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function empty() {
    log.innerHTML = "";
    var box = document.createElement("div"); box.className = "chat-empty"; box.id = "empty";
    var h = document.createElement("h2"); h.textContent = "What\u2019s on your mind?"; box.appendChild(h);
    var s = document.createElement("div"); s.className = "starters";
    STARTERS.forEach(function (t) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = t;
      b.addEventListener("click", function () { ask(t); });
      s.appendChild(b);
    });
    box.appendChild(s); log.appendChild(box);
  }
  function reset() { convId = null; empty(); closeDrawer(); }
  async function token() {
    var r = await sb.auth.getSession();
    if (!r.data.session) { location.href = "login.html"; return null; }
    return r.data.session.access_token;
  }

  async function ask(text) {
    if (busy) return;
    busy = true; send.disabled = true;
    var e = $("empty"); if (e) e.remove();
    add("you", text);
    var wait = add("ai", "Thinking\u2026");
    try {
      var t = await token(); if (!t) return;
      var r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ message: text, conversation_id: convId })
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(data.error || "Something went wrong.");
      convId = data.conversation_id;
      setText(wait, data.reply);
    } catch (err) {
      wait.className = "bubble err";
      wait.textContent = (err.message || "Something went wrong.") + " Try again.";
    } finally {
      busy = false; send.disabled = false;
      log.scrollTop = log.scrollHeight; input.focus();
    }
  }

  function openDrawer() { drawer.classList.add("open"); loadList(); }
  function closeDrawer() { drawer.classList.remove("open"); }

  async function loadList() {
    var box = $("convs"); box.textContent = "Loading\u2026";
    var r = await sb.from("conversations").select("id,title").order("updated_at", { ascending: false }).limit(30);
    if (r.error) { box.textContent = "Could not load history."; return; }
    box.innerHTML = "";
    if (!r.data.length) { box.textContent = "No saved chats yet."; return; }
    r.data.forEach(function (c) {
      var row = document.createElement("div"); row.className = "conv";
      var o = document.createElement("button"); o.className = "open"; o.type = "button"; o.textContent = c.title;
      o.addEventListener("click", function () { openConv(c.id); });
      var d = document.createElement("button"); d.className = "del"; d.type = "button";
      d.setAttribute("aria-label", "Delete chat"); d.textContent = "\u00D7";
      d.addEventListener("click", function () { remove(c.id); });
      row.appendChild(o); row.appendChild(d); box.appendChild(row);
    });
  }
  async function openConv(id) {
    var r = await sb.from("messages").select("role,content").eq("conversation_id", id).order("created_at", { ascending: true });
    if (r.error) { alert("Could not open that chat. Try again."); return; }
    log.innerHTML = ""; convId = id;
    r.data.forEach(function (m) { add(m.role === "user" ? "you" : "ai", m.content); });
    closeDrawer();
  }
  async function remove(id) {
    if (!confirm("Delete this chat?")) return;
    var r = await sb.from("conversations").delete().eq("id", id);
    if (r.error) { alert("Could not delete. Try again."); return; }
    if (id === convId) reset();
    loadList();
  }

  $("chat-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = input.value.trim();
    if (!t) return;
    input.value = ""; input.style.height = "auto";
    ask(t);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("chat-form").requestSubmit(); }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  });
  $("new").addEventListener("click", reset);
  $("hist").addEventListener("click", openDrawer);
  $("close").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

  token().then(function (t) { if (t) { document.body.hidden = false; reset(); } });
})();
