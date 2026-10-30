(function () {
  var SUPABASE_URL = "https://psbwkkkchfxuordslfps.supabase.co";
  var SUPABASE_KEY = "sb_publishable_slPZL-oR2jL6aXOBYNPIfA_2DpZIbNl";
  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  function $(id) { return document.getElementById(id); }
  function valid(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function say(t, ok) {
    var m = $("msg");
    if (m) { m.textContent = t; m.className = "form-msg " + (ok ? "ok" : "err"); }
  }
  function lock(b) { var s = $("submit"); if (s) s.disabled = b; }
  function friendly(e) {
    var t = ((e && e.message) || "").toLowerCase();
    if (t.indexOf("invalid login") > -1) return "Email or password is incorrect.";
    if (t.indexOf("not confirmed") > -1) return "Confirm your email first. Check your inbox for the link.";
    if (t.indexOf("rate limit") > -1 || t.indexOf("security purposes") > -1) return "Too many attempts. Wait a few minutes and try again.";
    if (t.indexOf("different from the old") > -1) return "Choose a different password from your old one.";
    return "Something went wrong. Try again.";
  }
  function on(id, fn) {
    var f = $(id);
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      say("");
      lock(true);
      Promise.resolve(fn())
        .catch(function () { say("Network problem. Check your connection and try again."); })
        .then(function () { lock(false); });
    });
  }

  on("signup-form", async function () {
    var email = $("email").value.trim(), pw = $("password").value, pw2 = $("confirm").value;
    if (!valid(email)) return say("Enter a valid email address.");
    if (pw.length < 8) return say("Use at least 8 characters for your password.");
    if (pw !== pw2) return say("The passwords do not match.");
    var r = await sb.auth.signUp({
      email: email, password: pw,
      options: { emailRedirectTo: location.origin + "/login.html", data: { full_name: $("fullname").value.trim() } }
    });
    if (r.error) return say(friendly(r.error));
    if (r.data.session) { location.href = "app.html"; return; }
    if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0)
      return say("An account with this email already exists. Try logging in.");
    $("signup-form").reset();
    say("Check your email for a confirmation link, then log in.", true);
  });

  on("login-form", async function () {
    var email = $("email").value.trim(), pw = $("password").value;
    if (!valid(email) || !pw) return say("Enter your email and password.");
    var r = await sb.auth.signInWithPassword({ email: email, password: pw });
    if (r.error) return say(friendly(r.error));
    location.href = "app.html";
  });

  on("forgot-form", async function () {
    var email = $("email").value.trim();
    if (!valid(email)) return say("Enter a valid email address.");
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/reset.html" });
    if (r.error && /rate limit|security purposes/i.test(r.error.message)) return say(friendly(r.error));
    say("If an account exists for that email, a reset link is on its way.", true);
  });

  on("reset-form", async function () {
    var pw = $("password").value, pw2 = $("confirm").value;
    if (pw.length < 8) return say("Use at least 8 characters for your password.");
    if (pw !== pw2) return say("The passwords do not match.");
    var s = await sb.auth.getSession();
    if (!s.data.session) return say("This reset link has expired. Request a new one.");
    var r = await sb.auth.updateUser({ password: pw });
    if (r.error) return say(friendly(r.error));
    await sb.auth.signOut();
    say("Password updated. Taking you to log in...", true);
    setTimeout(function () { location.href = "login.html"; }, 1500);
  });

  var who = $("who");
  if (who) {
    sb.auth.getSession().then(function (r) {
      var s = r.data.session;
      if (!s) { location.href = "login.html"; return; }
      who.textContent = s.user.email;
      document.body.hidden = false;
    });
    $("logout").addEventListener("click", async function () {
      await sb.auth.signOut();
      location.href = "index.html";
    });
  }
})();
