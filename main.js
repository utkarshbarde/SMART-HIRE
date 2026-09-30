/* main.js - starts the app: check if someone is already logged in, then show the right page. */
"use strict";

window.addEventListener("hashchange", handleRoute);

(async function start() {
  try {
    const { user } = await api("/me");
    SH.user = user;
  } catch (e) {
    SH.user = null;          // not logged in (401) or server not reachable
    if (e.status === undefined) {
      $("#app").innerHTML = `<div class="page"><div class="card">${empty("🔌", "Cannot reach the SmartHire server", e.message,
        `<button class="btn" onclick="location.reload()">Try again</button>`)}</div></div>`;
      return;
    }
  }
  handleRoute();
})();