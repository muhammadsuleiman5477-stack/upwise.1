(function () {
  var sb = window.upwise.sb;
  function $(id) { return document.getElementById(id); }
  function say(t, ok) { var m = $("msg"); if (m) { m.textContent = t; m.className = "form-msg " + (ok ? "ok" : "err"); } }

  var INTERESTS = [
    ["education", "Education"], ["technology", "Technology"], ["career", "Career development"],
    ["entrepreneurship", "Entrepreneurship"], ["finance", "Personal finance"], ["productivity", "Productivity"],
    ["personal-development", "Personal development"], ["scholarships", "Scholarships and opportunities"], ["study", "Study assistance"]
  ];
  var CODES = ("NG GH KE ZA EG ET TZ UG RW SN CM CI MA DZ TN ZM ZW BW NA AO MZ SL LR GM US CA GB IE AU NZ IN PK BD LK NP " +
    "CN JP KR SG MY ID PH TH VN AE SA QA KW TR IL DE FR ES IT NL BE SE NO DK FI PL PT CH AT GR RU UA BR AR MX CO CL PE JM TT").split(" ");

  async function guard() {
    var r = await sb.auth.getSession();
    if (!r.data.session) { location.href = "login.html"; return null; }
    return r.data.session.user;
  }
  async function loadProfile(uid) {
    var r = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }
  function label(key) {
    for (var i = 0; i < INTERESTS.length; i++) if (INTERESTS[i][0] === key) return INTERESTS[i][1];
    return key;
  }

  var logout = $("logout");
  if (logout) logout.addEventListener("click", async function () {
    await sb.auth.signOut();
    location.href = "index.html";
  });

  async function onboarding() {
    var user = await guard(); if (!user) return;
    var p = await loadProfile(user.id);

    var box = $("interests");
    INTERESTS.forEach(function (i) {
      var l = document.createElement("label"), c = document.createElement("input"), s = document.createElement("span");
      c.type = "checkbox"; c.value = i[0];
      c.checked = !!(p && p.interests && p.interests.indexOf(i[0]) > -1);
      s.textContent = i[1];
      l.appendChild(c); l.appendChild(s); box.appendChild(l);
    });

    var names = new Intl.DisplayNames(["en"], { type: "region" });
    var list = CODES.map(function (c) { return [c, names.of(c)]; }).sort(function (a, b) {
      if (a[0] === "NG") return -1; if (b[0] === "NG") return 1; return a[1].localeCompare(b[1]);
    });
    var cs = $("country");
    cs.innerHTML = '<option value="">Select your country</option>';
    list.forEach(function (x) { var o = document.createElement("option"); o.value = x[0]; o.textContent = x[1]; cs.appendChild(o); });
    cs.value = (p && p.country) || "";

    var zones = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone").slice() : ["UTC"];
    var guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zones.indexOf("Africa/Lagos") < 0) zones.unshift("Africa/Lagos");
    if (guess && zones.indexOf(guess) < 0) zones.push(guess);
    var tz = $("timezone");
    zones.forEach(function (z) { var o = document.createElement("option"); o.value = z; o.textContent = z.replace(/_/g, " "); tz.appendChild(o); });
    tz.value = (p && p.timezone) || guess || "Africa/Lagos";

    $("fullname").value = (p && p.display_name) || (user.user_metadata && user.user_metadata.full_name) || "";

    $("onboard-form").addEventListener("submit", async function (e) {
      e.preventDefault(); say("");
      var btn = $("submit"), name = $("fullname").value.trim();
      var picks = [].slice.call(document.querySelectorAll("#interests input:checked")).map(function (i) { return i.value; });
      if (name.length > 60) return say("Keep your name under 60 characters.");
      if (!cs.value) return say("Choose your country.");
      if (!tz.value) return say("Choose your time zone.");
      btn.disabled = true;
      try {
        var r = await sb.from("profiles").upsert({
          id: user.id, display_name: name || null, country: cs.value, timezone: tz.value,
          interests: picks, onboarded: true, updated_at: new Date().toISOString()
        });
        if (r.error) throw r.error;
        location.href = "app.html";
      } catch (err) {
        say("Could not save your profile: " + (err.message || "try again."));
        btn.disabled = false;
      }
    });
    document.body.hidden = false;
  }

  async function dashboard() {
    var user = await guard(); if (!user) return;
    var p = await loadProfile(user.id);
    if (!p || !p.onboarded) { location.href = "onboarding.html"; return; }
    var first = (p.display_name || "").split(" ")[0];
    $("greet").textContent = first ? "Welcome, " + first + "." : "Welcome.";
    var d;
    try { d = new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: p.timezone }).format(new Date()); }
    catch (e) { d = new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(new Date()); }
    $("today").textContent = d;
    var chips = $("chips");
    (p.interests || []).forEach(function (k) { var s = document.createElement("span"); s.className = "chip"; s.textContent = label(k); chips.appendChild(s); });
    document.body.hidden = false;
  }

  var job = $("onboard-form") ? onboarding : $("greet") ? dashboard : null;
  if (job) job().catch(function (err) {
    document.body.hidden = false;
    say("Could not load your profile: " + (err.message || "try again."));
  });
})();
