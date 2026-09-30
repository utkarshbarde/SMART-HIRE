/* core.js - helpers shared by every screen: API calls, router, layout, small UI pieces. */
"use strict";

const SH = { user: null, actions: {}, forms: {}, inputs: {}, changes: {}, keys: {}, token: 0, ctx: null };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- text helpers ---------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function initials(name) {
  return (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
}
function fmtDate(iso) {
  if (!iso) return "Not specified";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  const wk = Math.floor(days / 7);
  return `${wk} week${wk > 1 ? "s" : ""} ago`;
}
const matchClass = p => (p >= 70 ? "match-hi" : p >= 40 ? "match-mid" : "match-lo");
const pillClass = p => (p >= 70 ? "hi" : p >= 40 ? "mid" : "lo");
const barClass = p => (p >= 80 ? "hi" : p >= 50 ? "mid" : "lo");
const statusLabel = s => ({ UnderReview: "Under Review" }[s] || s);

/* ---------- API ---------- */
async function api(path, { method = "GET", json, form } = {}) {
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (json !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(json); }
  if (form) opts.body = form;
  let res;
  try { res = await fetch("/api" + path, opts); }
  catch (e) { throw new Error("Cannot reach the server. Make sure `python app.py` is still running."); }
  let data = null;
  try { data = await res.json(); } catch (e) { /* not json */ }
  if (!res.ok) {
    if (res.status === 401 && SH.user && !path.startsWith("/login")) {
      SH.user = null; location.hash = "#/login";
    }
    const err = new Error((data && data.error) || `Something went wrong (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- toast + modal ---------- */
function toast(msg, kind = "") {
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function openModal(html) {
  closeModal();
  const o = document.createElement("div");
  o.className = "overlay"; o.id = "overlay";
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button class="x" data-action="close-modal" aria-label="Close">×</button>${html}</div>`;
  o.addEventListener("mousedown", e => { if (e.target === o) closeModal(); });
  document.body.appendChild(o);
  document.body.style.overflow = "hidden";
}
function closeModal() {
  const o = $("#overlay");
  if (o) o.remove();
  document.body.style.overflow = "";
}
SH.actions["close-modal"] = closeModal;
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ---------- small UI pieces ---------- */
const chips = (list, cls = "") => list && list.length
  ? `<div class="chips">${list.map(x => `<span class="chip ${cls}">${esc(x)}</span>`).join("")}</div>` : "";

function donut(pct, { color = "#4F46E5", big = null, small = "" } = {}) {
  const r = 60, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<div class="donut"><svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="#E5E9F2" stroke-width="14"/>
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
              stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>
      <div class="center-text"><b>${big ?? Math.round(pct) + "%"}</b><span>${esc(small)}</span></div></div>`;
}
function bar(label, score) {
  return `<div class="bar-row"><div class="bar-top"><b>${esc(label)}</b><span>${score}%</span></div>
    <div class="bar-track"><div class="bar-fill ${barClass(score)}" style="width:${score}%"></div></div></div>`;
}
const badge = (status, label) => `<span class="badge badge-${esc(status)}">${esc(label || statusLabel(status))}</span>`;
function empty(icon, title, text = "", action = "") {
  return `<div class="empty-state"><div class="big">${icon}</div><b>${esc(title)}</b><div>${esc(text)}</div>${action ? `<div style="margin-top:14px">${action}</div>` : ""}</div>`;
}
const loading = () => `<div class="loading"><div class="spinner"></div>Loading...</div>`;
function pagination(meta, action) {
  if (meta.pages <= 1 && meta.total <= meta.perPage) return `<div class="pagination"><span class="muted small">${meta.total} result${meta.total === 1 ? "" : "s"}</span></div>`;
  const from = (meta.page - 1) * meta.perPage + 1, to = Math.min(meta.total, meta.page * meta.perPage);
  return `<div class="pagination"><span class="muted small">Showing ${from}-${to} of ${meta.total}</span>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn ghost sm" data-action="${action}" data-page="${meta.page - 1}" ${meta.page <= 1 ? "disabled" : ""}>Previous</button>
      <span class="small muted">Page ${meta.page} of ${meta.pages}</span>
      <button class="btn ghost sm" data-action="${action}" data-page="${meta.page + 1}" ${meta.page >= meta.pages ? "disabled" : ""}>Next</button>
    </div></div>`;
}
function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function pwdField(id, label = "Password", ph = "") {
  return `<div class="field"><label for="${id}">${label}</label><div class="pwd-wrap">
    <input id="${id}" type="password" placeholder="${ph}" autocomplete="current-password"><button type="button" data-action="toggle-pwd" data-target="${id}">Show</button></div></div>`;
}
SH.actions["toggle-pwd"] = el => {
  const input = document.getElementById(el.dataset.target);
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  el.textContent = show ? "Hide" : "Show";
};

/* ---------- router ---------- */
const routes = [];
function route(pattern, role, handler) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ re, keys, role, handler });
}
function go(path) { if (location.hash === "#" + path) handleRoute(); else location.hash = "#" + path; }
const homeFor = u => (u ? (u.role === "recruiter" ? "/recruiter/home" : (u.onboarded ? "/student/home" : "/student/onboarding")) : "/login");
SH.actions.go = el => go(el.dataset.to);

async function handleRoute() {
  closeModal();
  const full = location.hash.slice(1) || "/";
  const [path, qs] = full.split("?");
  const query = Object.fromEntries(new URLSearchParams(qs || ""));
  const token = ++SH.token;

  if (path === "/" || path === "") return go(homeFor(SH.user));
  const r = routes.find(x => x.re.test(path));
  if (!r) return go(homeFor(SH.user));

  // access rules
  if (r.role === "public") { if (SH.user) return go(homeFor(SH.user)); }
  else {
    if (!SH.user) return go("/login");
    if (r.role && r.role !== SH.user.role) return go(homeFor(SH.user));
    if (SH.user.role === "student" && !SH.user.onboarded && path !== "/student/onboarding") return go("/student/onboarding");
  }
  const m = path.match(r.re);
  const params = {};
  r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
  const ctx = { params, query, path, token, stale: () => token !== SH.token };
  SH.ctx = ctx;
  window.scrollTo(0, 0);
  try { await r.handler(ctx); }
  catch (e) {
    if (ctx.stale()) return;
    setView(`<div class="card">${empty("⚠️", "Could not load this page", e.message,
      `<button class="btn" data-action="reload">Try again</button>`)}</div>`);
  }
}
SH.actions.reload = () => handleRoute();

/* ---------- layout ---------- */
const NAV = {
  student: [
    ["/student/home", "🏠", "Home"], ["/student/jobs", "💼", "Jobs"], ["/student/applications", "📄", "Applications"],
    ["/student/skill-match", "🎯", "Skill Match"], ["/student/ai-analysis", "🤖", "AI Analysis"], ["/student/profile", "👤", "Profile"],
  ],
  recruiter: [
    ["/recruiter/home", "🏠", "Dashboard"], ["/recruiter/post", "➕", "Post a Job"], ["/recruiter/jobs", "💼", "My Jobs"],
    ["/recruiter/shortlist", "🎯", "Smart Shortlist"], ["/recruiter/students", "🏆", "Student Rankings"],
    ["/recruiter/analytics", "📊", "Analytics"], ["/recruiter/company", "🏢", "Company Profile"],
  ],
};

function frame(activePath) {
  const u = SH.user;
  const items = NAV[u.role].map(([p, ico, label]) =>
    `<a class="nav-item ${p === activePath ? "active" : ""}" href="#${p}"><span class="ico">${ico}</span>${label}</a>`).join("");
  $("#app").innerHTML = `
    <div class="header"><h1>SmartHire</h1><div class="who">${esc(u.name)} · ${u.role === "recruiter" ? "Recruiter" : "Student"}</div></div>
    <div class="page"><div class="shell">
      <nav class="sidebar"><div class="brand">SmartHire</div>${items}<div class="nav-spacer"></div>
        <div class="nav-item" data-action="logout" role="button" tabindex="0"><span class="ico">🚪</span>Logout</div></nav>
      <div class="main"><div class="topbar" id="topbar">
          <div class="bell" id="bell" data-action="toggle-notifs" title="Notifications" role="button" tabindex="0" aria-label="Notifications">🔔<span class="dot hidden" id="bellDot"></span></div>
          <div class="avatar-sm" title="${esc(u.name)}">${esc(initials(u.name))}</div></div>
        <div id="view">${loading()}</div></div>
    </div></div>`;
  loadNotifications();
}
function setView(html) { const v = $("#view"); if (v) v.innerHTML = html; }
function plainPage(html) { $("#app").innerHTML = `<div class="page">${html}</div>`; }

/* Views call this: `await page(ctx, path)` then `if (ctx.stale()) return; setView(...)` */
function page(ctx, activePath) { frame(activePath); }

/* ---------- notifications ---------- */
async function loadNotifications() {
  try {
    const { notifications } = await api("/notifications");
    SH.notifs = notifications;
    const seen = localStorage.getItem("sh_seen_" + SH.user.id) || "";
    const unread = notifications.some(n => n.time > seen);
    const dot = $("#bellDot");
    if (dot) dot.classList.toggle("hidden", !unread);
  } catch (e) { /* ignore */ }
}
SH.actions["toggle-notifs"] = () => {
  const old = $("#notifDrop");
  if (old) return old.remove();
  const list = SH.notifs || [];
  const drop = document.createElement("div");
  drop.className = "notif-drop"; drop.id = "notifDrop";
  drop.innerHTML = list.length
    ? list.map(n => `<div class="ni"><b>${esc(n.title)}</b>${esc(n.sub)}<div class="muted small">${timeAgo(n.time)}</div></div>`).join("")
    : `<div class="empty">No new notifications</div>`;
  $("#topbar").appendChild(drop);
  if (list.length) localStorage.setItem("sh_seen_" + SH.user.id, list[0].time);
  const dot = $("#bellDot"); if (dot) dot.classList.add("hidden");
  setTimeout(() => document.addEventListener("click", function once(e) {
    if (!e.target.closest("#notifDrop") && !e.target.closest("#bell")) { const d = $("#notifDrop"); if (d) d.remove(); }
    document.removeEventListener("click", once);
  }), 0);
};

/* ---------- global event delegation ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const fn = SH.actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});
/* keyboard: Enter / Space on button-like elements works like a click */
document.addEventListener("keydown", e => {
  const el = e.target.closest("[role=button][data-action]");
  if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
});
document.addEventListener("submit", e => {
  const f = e.target.closest("[data-form]");
  if (!f) return;
  e.preventDefault();
  const fn = SH.forms[f.dataset.form];
  if (fn) fn(f, e);
});
document.addEventListener("input", e => {
  const el = e.target.closest("[data-input]");
  if (el && SH.inputs[el.dataset.input]) SH.inputs[el.dataset.input](el, e);
});
document.addEventListener("change", e => {
  const el = e.target.closest("[data-change]");
  if (el && SH.changes[el.dataset.change]) SH.changes[el.dataset.change](el, e);
});
document.addEventListener("keydown", e => {
  const el = e.target.closest("[data-enter]");
  if (el && e.key === "Enter" && SH.keys[el.dataset.enter]) { e.preventDefault(); SH.keys[el.dataset.enter](el, e); }
});

SH.actions.logout = async () => {
  try { await api("/logout", { method: "POST" }); } catch (e) { /* ignore */ }
  SH.user = null;
  if (typeof AUTH !== "undefined") AUTH.tab = "login";     // always land on the Login tab
  go("/login");
};

/* run a button action with a busy state */
async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true; btn.textContent = "Please wait...";
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}