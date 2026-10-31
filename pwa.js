(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  var bar = null;
  function offline(on) {
    if (on && !bar) {
      bar = document.createElement("div");
      bar.className = "offline-bar";
      bar.setAttribute("role", "status");
      bar.textContent = "You are offline. Saving and the AI tools need a connection.";
      document.body.appendChild(bar);
    } else if (!on && bar) { bar.remove(); bar = null; }
  }
  window.addEventListener("offline", function () { offline(true); });
  window.addEventListener("online", function () { offline(false); });
  if (!navigator.onLine) offline(true);

  function standalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }
  function flagInstalled() { try { localStorage.setItem("upwise-installed", "1"); } catch (e) {} }
  function wasInstalled() { try { return localStorage.getItem("upwise-installed") === "1"; } catch (e) { return false; } }
  // opened as an installed app: remember it so the Install button stays hidden in the browser too
  if (standalone()) flagInstalled();

  var deferred = null, btn = document.getElementById("install-btn");
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferred = e;
    if (btn && !standalone() && !wasInstalled()) btn.hidden = false;
  });
  if (btn) btn.addEventListener("click", async function () {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) {}
    deferred = null; btn.hidden = true;
  });
  window.addEventListener("appinstalled", function () { flagInstalled(); if (btn) btn.hidden = true; });
})();
