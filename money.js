(function () {
  var sb = window.upwise.sb, uid = null, tz = null, ym = "", cur = "NGN";
  var txs = [], budgets = [];
  var EXP = ["Food", "Transport", "Data and airtime", "Rent and bills", "School", "Health", "Savings", "Entertainment", "Other"];
  var INC = ["Allowance", "Salary", "Business", "Gift", "Other"];
  var CUR = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"];
  var MAX = 999999999999.99;
  try { cur = localStorage.getItem("upwise-currency") || "NGN"; } catch (e) {}
  if (CUR.indexOf(cur) < 0) cur = "NGN";

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function say(t) { $("msg").textContent = t || ""; }
  function money(n) {
    try { return new Intl.NumberFormat("en-NG", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n); }
    catch (e) { return cur + " " + n.toFixed(2); }
  }
  function today() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function shift(s, n) {
    var p = s.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1 + n, 1));
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2);
  }
  function monthLabel(s) {
    var p = s.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, 1)).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  function parseAmt(v) {
    var a = parseFloat(v);
    if (!isFinite(a) || a <= 0) return null;
    a = Math.round(a * 100) / 100;
    return a > MAX ? null : a;
  }
  function fillSelect(sel, list) {
    sel.innerHTML = "";
    list.forEach(function (c) { var o = el("option", null, c); o.value = c; sel.appendChild(o); });
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
    var a = await sb.from("transactions").select("id,kind,amount,category,note,tx_date")
      .gte("tx_date", ym + "-01").lt("tx_date", shift(ym, 1) + "-01")
      .order("tx_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
    var b = await sb.from("budgets").select("id,category,monthly_limit").order("category");
    if (a.error || b.error) { say("Could not load your data. Check your connection and try again."); return; }
    txs = a.data; budgets = b.data;
    render();
  }

  function spentBy() {
    var m = {};
    txs.forEach(function (t) { if (t.kind === "expense") m[t.category] = (m[t.category] || 0) + Number(t.amount); });
    return m;
  }

  function render() {
    $("m-label").textContent = monthLabel(ym);
    var inc = 0, out = 0;
    txs.forEach(function (t) { if (t.kind === "income") inc += Number(t.amount); else out += Number(t.amount); });
    $("s-in").textContent = money(inc); $("s-out").textContent = money(out); $("s-bal").textContent = money(inc - out);
    $("s-bal").className = inc - out < 0 ? "warn" : "";

    var spent = spentBy(), bars = $("cat-bars"); bars.innerHTML = "";
    var cats = Object.keys(spent).sort(function (a, b) { return spent[b] - spent[a]; });
    if (!cats.length) bars.appendChild(el("p", "muted", "No spending recorded this month."));
    cats.forEach(function (c) {
      var pct = out ? Math.round(spent[c] / out * 100) : 0;
      var row = el("div", "bar-row");
      row.appendChild(el("div", "meta", c + " \u00B7 " + money(spent[c]) + " (" + pct + "%)"));
      var bar = el("div", "bar"), i = el("i"); i.style.width = pct + "%"; bar.appendChild(i); row.appendChild(bar);
      bars.appendChild(row);
    });

    var list = $("tx-list"); list.innerHTML = "";
    if (!txs.length) list.appendChild(el("p", "muted", "Nothing here yet. Add your first entry above."));
    txs.forEach(function (t) {
      var row = el("div", "tx-row"), mid = el("div", "grow");
      mid.appendChild(el("div", null, t.category + (t.note ? " \u00B7 " + t.note : "")));
      mid.appendChild(el("div", "meta", t.tx_date));
      row.appendChild(mid);
      row.appendChild(el("span", "amt " + (t.kind === "income" ? "inc" : "exp"), (t.kind === "income" ? "+" : "-") + money(Number(t.amount))));
      row.appendChild(delBtn("Delete entry", function () { if (confirm("Delete this entry?")) act(function () { return db(sb.from("transactions").delete().eq("id", t.id)); }); }));
      list.appendChild(row);
    });

    var bl = $("bud-list"); bl.innerHTML = "";
    if (!budgets.length) bl.appendChild(el("p", "muted", "No budgets yet. Set a limit for a category you want to watch."));
    budgets.forEach(function (b) {
      var s = spent[b.category] || 0, lim = Number(b.monthly_limit), over = s > lim;
      var card = el("article", "card"), top = el("div", "card-top");
      var info = el("div", "card-info");
      info.appendChild(el("h3", null, b.category));
      info.appendChild(el("p", "meta" + (over ? " warn" : ""), money(s) + " of " + money(lim) + (over ? ". Over by " + money(s - lim) : ". " + money(lim - s) + " left")));
      top.appendChild(info);
      top.appendChild(delBtn("Delete budget", function () { act(function () { return db(sb.from("budgets").delete().eq("id", b.id)); }); }));
      card.appendChild(top);
      var bar = el("div", "bar" + (over ? " over" : "")), i = el("i"); i.style.width = Math.min(100, Math.round(s / lim * 100)) + "%"; bar.appendChild(i);
      bar.style.marginTop = "10px"; card.appendChild(bar); bl.appendChild(card);
    });
  }

  $("tx-kind").addEventListener("change", function () { fillSelect($("tx-cat"), $("tx-kind").value === "income" ? INC : EXP); });
  $("tx-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var a = parseAmt($("tx-amt").value), d = $("tx-date").value;
    if (a === null) return say("Enter an amount greater than zero.");
    if (!d) return say("Pick a date.");
    act(async function () {
      await db(sb.from("transactions").insert({ user_id: uid, kind: $("tx-kind").value, amount: a, category: $("tx-cat").value, note: $("tx-note").value.trim() || null, tx_date: d }));
      $("tx-amt").value = ""; $("tx-note").value = "";
      if (d.slice(0, 7) !== ym) { ym = d.slice(0, 7); }
    });
  });
  $("bud-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var a = parseAmt($("bd-lim").value);
    if (a === null) return say("Enter a limit greater than zero.");
    act(async function () {
      await db(sb.from("budgets").upsert({ user_id: uid, category: $("bd-cat").value, monthly_limit: a }, { onConflict: "user_id,category" }));
      $("bd-lim").value = "";
    });
  });
  $("m-prev").addEventListener("click", function () { ym = shift(ym, -1); load(); });
  $("m-next").addEventListener("click", function () { ym = shift(ym, 1); load(); });

  /* savings calculator */
  function sv() {
    var goal = parseFloat($("sv-goal").value), have = parseFloat($("sv-have").value) || 0;
    var mon = parseFloat($("sv-mon").value), months = parseInt($("sv-months").value, 10), out = $("sv-out");
    if (!isFinite(goal) || goal <= 0) { out.textContent = "Enter your goal and one of the two options."; return; }
    var need = goal - have;
    if (need <= 0) { out.textContent = "You have already reached this goal."; return; }
    var lines = [];
    if (isFinite(mon) && mon > 0) {
      var n = Math.ceil(need / mon);
      var end = new Date(); end.setMonth(end.getMonth() + n);
      lines.push("At " + money(mon) + " a month: about " + n + (n === 1 ? " month" : " months") + ", around " + end.toLocaleDateString("en", { month: "long", year: "numeric" }) + ".");
    }
    if (isFinite(months) && months > 0) lines.push("To finish in " + months + (months === 1 ? " month" : " months") + ": save about " + money(Math.ceil(need / months * 100) / 100) + " a month.");
    out.textContent = lines.length ? lines.join(" ") : "Add what you can save per month, or how many months you have.";
  }
  ["sv-goal", "sv-have", "sv-mon", "sv-months"].forEach(function (id) { $(id).addEventListener("input", sv); });

  /* tabs and currency */
  var TABS = ["over", "budget", "save", "learn"];
  TABS.forEach(function (k) {
    $("tab-" + k).addEventListener("click", function () {
      TABS.forEach(function (j) {
        $("tab-" + j).setAttribute("aria-selected", j === k ? "true" : "false");
        $("pane-" + j).hidden = j !== k;
      });
    });
  });
  fillSelect($("cur"), CUR); $("cur").value = cur;
  $("cur").addEventListener("change", function () {
    cur = $("cur").value;
    try { localStorage.setItem("upwise-currency", cur); } catch (e) {}
    render(); sv();
  });
  fillSelect($("tx-cat"), EXP); fillSelect($("bd-cat"), EXP);

  (async function init() {
    var s = await sb.auth.getSession();
    if (!s.data.session) { location.href = "login.html"; return; }
    uid = s.data.session.user.id;
    var p = await sb.from("profiles").select("timezone").eq("id", uid).maybeSingle();
    tz = (p.data && p.data.timezone) || null;
    ym = today().slice(0, 7);
    $("tx-date").value = today();
    document.body.hidden = false;
    load();
  })();
})();
