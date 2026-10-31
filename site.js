(function () {
  var root = document.documentElement;
  var themeBtn = document.getElementById("theme-btn");
  var menuBtn = document.getElementById("menu-btn");
  var nav = document.getElementById("nav");

  function setTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("upwise-theme", t); } catch (e) {}
    if (themeBtn) themeBtn.textContent = t === "light" ? "\u263E" : "\u2600";
    if (themeBtn) themeBtn.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode");
  }

  if (themeBtn) {
    setTheme(root.getAttribute("data-theme") || "dark");
    themeBtn.addEventListener("click", function () {
      setTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
    });
  }

  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
    });
  }
})();

(function () {
  try {
    if (!localStorage.getItem("sb-psbwkkkchfxuordslfps-auth-token")) return;
    document.querySelectorAll('a[href="login.html"]').forEach(function (a) { a.hidden = true; });
    document.querySelectorAll('a[href="signup.html"]').forEach(function (a) { a.href = "app.html"; a.textContent = "Open app"; });
  } catch (e) {}
})();
