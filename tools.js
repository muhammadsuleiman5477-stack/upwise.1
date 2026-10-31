(function () {
  function $(id) { return document.getElementById(id); }
  function fmt(n) {
    if (!isFinite(n)) return "?";
    return Number(n.toPrecision(10)).toLocaleString("en", { maximumFractionDigits: 6 });
  }

  /* tool picker */
  var panels = ["percent", "units", "time", "list", "cv"];
  document.querySelectorAll("#picker button").forEach(function (b) {
    b.addEventListener("click", function () {
      panels.forEach(function (k) { $("panel-" + k).hidden = k !== b.dataset.tool; });
      document.querySelectorAll("#picker button").forEach(function (x) {
        x.setAttribute("aria-selected", x === b ? "true" : "false");
      });
    });
  });

  /* percentage */
  var PL = { of: ["Percentage (X)", "Number (Y)"], what: ["Amount (X)", "Total (Y)"], change: ["Old value (X)", "New value (Y)"] };
  function pc() {
    var m = $("pc-mode").value, out = $("pc-out");
    $("pc-la").textContent = PL[m][0]; $("pc-lb").textContent = PL[m][1];
    var a = parseFloat($("pc-a").value), b = parseFloat($("pc-b").value);
    if (isNaN(a) || isNaN(b)) { out.textContent = "Enter two numbers."; return; }
    if (m === "of") out.textContent = fmt(a) + "% of " + fmt(b) + " is " + fmt(a / 100 * b);
    else if (m === "what") {
      if (b === 0) { out.textContent = "The total cannot be zero."; return; }
      out.textContent = fmt(a) + " is " + fmt(a / b * 100) + "% of " + fmt(b);
    } else {
      if (a === 0) { out.textContent = "The old value cannot be zero."; return; }
      var c = (b - a) / Math.abs(a) * 100;
      out.textContent = (c >= 0 ? "Increase of " : "Decrease of ") + fmt(Math.abs(c)) + "%";
    }
  }
  ["pc-mode", "pc-a", "pc-b"].forEach(function (id) { $(id).addEventListener("input", pc); });

  /* units */
  var U = {
    Length: { mm: .001, cm: .01, m: 1, km: 1000, inch: .0254, foot: .3048, yard: .9144, mile: 1609.344 },
    Weight: { g: .001, kg: 1, tonne: 1000, pound: .45359237, ounce: .028349523125 },
    Volume: { ml: .001, litre: 1, "US gallon": 3.785411784, "US cup": .2365882365, "US fl oz": .0295735295625 },
    Temperature: { "\u00B0C": 1, "\u00B0F": 1, "K": 1 }
  };
  function fillUnits() {
    var keys = Object.keys(U[$("u-cat").value]);
    [$("u-from"), $("u-to")].forEach(function (s, i) {
      s.innerHTML = "";
      keys.forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = k; s.appendChild(o); });
      s.selectedIndex = Math.min(i, keys.length - 1);
    });
    conv();
  }
  function conv() {
    var catName = $("u-cat").value, v = parseFloat($("u-val").value), f = $("u-from").value, t = $("u-to").value, out = $("u-out");
    if (isNaN(v)) { out.textContent = "Enter a number."; return; }
    var r;
    if (catName === "Temperature") {
      var c = f === "\u00B0C" ? v : f === "\u00B0F" ? (v - 32) * 5 / 9 : v - 273.15;
      if (c < -273.15) { out.textContent = "That is below absolute zero."; return; }
      r = t === "\u00B0C" ? c : t === "\u00B0F" ? c * 9 / 5 + 32 : c + 273.15;
    } else r = v * U[catName][f] / U[catName][t];
    out.textContent = fmt(v) + " " + f + " = " + fmt(r) + " " + t;
  }
  Object.keys(U).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = k; $("u-cat").appendChild(o); });
  $("u-cat").addEventListener("change", fillUnits);
  ["u-val", "u-from", "u-to"].forEach(function (id) { $(id).addEventListener("input", conv); });
  fillUnits();

  /* dates and time */
  function utc(s) { var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function dd() {
    var a = $("dd-1").value, b = $("dd-2").value, out = $("dd-out");
    if (!a || !b) { out.textContent = "Pick two dates."; return; }
    var days = Math.round((utc(b) - utc(a)) / 864e5), n = Math.abs(days), w = Math.floor(n / 7), r = n % 7;
    out.textContent = n + (n === 1 ? " day" : " days") + (w ? " (" + w + (w === 1 ? " week" : " weeks") + (r ? " and " + r + (r === 1 ? " day" : " days") : "") + ")" : "") + (days < 0 ? ". The second date is earlier." : ".");
  }
  function ad() {
    var d = $("ad-d").value, n = parseInt($("ad-n").value, 10), out = $("ad-out");
    if (!d || isNaN(n)) { out.textContent = "Pick a date and a number of days."; return; }
    out.textContent = new Date(utc(d) + n * 864e5).toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  }
  function tt() {
    var a = $("tt-1").value, b = $("tt-2").value, out = $("tt-out");
    if (!a || !b) { out.textContent = "Pick two times. If the end is earlier, it counts past midnight."; return; }
    function mins(s) { var p = s.split(":"); return +p[0] * 60 + +p[1]; }
    var m = (mins(b) - mins(a) + 1440) % 1440;
    out.textContent = Math.floor(m / 60) + " h " + (m % 60) + " min";
  }
  ["dd-1", "dd-2"].forEach(function (id) { $(id).addEventListener("input", dd); });
  ["ad-d", "ad-n"].forEach(function (id) { $(id).addEventListener("input", ad); });
  ["tt-1", "tt-2"].forEach(function (id) { $(id).addEventListener("input", tt); });

  /* checklist */
  var KEY = "upwise-checklist", items = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { items = []; }
  function saveList() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} }
  function renderList() {
    var ul = $("cl-list"); ul.innerHTML = "";
    var done = items.filter(function (i) { return i.d; }).length;
    $("cl-prog").textContent = items.length ? done + " of " + items.length + " done" : "";
    items.forEach(function (it) {
      var li = document.createElement("li"); if (it.d) li.className = "done";
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = it.d; cb.setAttribute("aria-label", it.t);
      cb.addEventListener("change", function () { it.d = cb.checked; saveList(); renderList(); });
      var sp = document.createElement("span"); sp.textContent = it.t;
      li.appendChild(cb); li.appendChild(sp); ul.appendChild(li);
    });
  }
  $("cl-make").addEventListener("click", function () {
    items = $("cl-in").value.split("\n").map(function (s) { return s.replace(/^\s*[-*\u2022]\s*/, "").trim(); })
      .filter(Boolean).slice(0, 100).map(function (t) { return { t: t.slice(0, 200), d: false }; });
    saveList(); renderList();
  });
  $("cl-clear").addEventListener("click", function () { items = []; $("cl-in").value = ""; saveList(); renderList(); });
  $("cl-copy").addEventListener("click", function () {
    var text = items.map(function (i) { return (i.d ? "[x] " : "[ ] ") + i.t; }).join("\n");
    if (!text) { $("cl-prog").textContent = "Nothing to copy yet."; return; }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { $("cl-prog").textContent = "Copied."; }, function () { $("cl-prog").textContent = "Could not copy. Select the text and copy it manually."; });
    else $("cl-prog").textContent = "Copy is not supported in this browser.";
  });
  renderList();

  /* CV builder */
  $("cv-go").addEventListener("click", function () {
    var name = $("cv-name").value.trim(), msg = $("cv-msg"), out = $("cv-out");
    msg.textContent = ""; msg.className = "form-msg";
    if (!name) { msg.textContent = "Add your full name first."; msg.className = "form-msg err"; return; }
    out.innerHTML = "";
    var h = document.createElement("h2"); h.textContent = name; out.appendChild(h);
    var c = $("cv-contact").value.trim();
    if (c) { var p = document.createElement("p"); p.className = "cv-contact"; p.textContent = c; out.appendChild(p); }
    [["Summary", "cv-sum"], ["Experience", "cv-exp"], ["Education", "cv-edu"], ["Skills", "cv-skills"]].forEach(function (s) {
      var v = $(s[1]).value.trim(); if (!v) return;
      var h3 = document.createElement("h3"); h3.textContent = s[0];
      var p2 = document.createElement("p"); p2.textContent = v;
      out.appendChild(h3); out.appendChild(p2);
    });
    out.hidden = false; $("cv-print").disabled = false;
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("cv-print").addEventListener("click", function () { window.print(); });
})();
