/* student.js - Home, Jobs, Applications, Skill Match, AI Analysis, Profile. */
"use strict";

/* ---------- shared: job card + job details popup ---------- */
function jobCard(j, { actions = false } = {}) {
  let right = "";
  if (j.applied) right = badge(j.applicationStatus);
  else if (j.closed) right = badge("Closed", "Closed");
  else if (actions) right = `<button class="btn secondary sm" data-action="job-save" data-id="${j.id}">${j.saved ? "★ Saved" : "☆ Save"}</button>
        <button class="btn sm" data-action="job-apply" data-id="${j.id}">Apply</button>`;
  if (j.applied && actions) right = `<button class="btn secondary sm" data-action="job-save" data-id="${j.id}">${j.saved ? "★ Saved" : "☆ Save"}</button>` + right;
  return `<div class="job-card ${j.closed ? "closed" : ""}" data-action="job-open" data-id="${j.id}" role="button" tabindex="0">
    <div class="jc-top"><div><div class="jc-title">${esc(j.title)}</div>
      <div class="jc-meta">${esc(j.company)} • ${esc(j.location)} — <span class="${matchClass(j.match.pct)}">${j.match.pct}% match</span></div></div>
      <div class="jc-actions">${right}</div></div>
    ${chips(j.skills)}</div>`;
}

function jobModal(j) {
  const m = j.match;
  const skillChips = j.skills.map(s => {
    const ok = m.matched.includes(s);
    return `<span class="chip ${ok ? "ok" : "warn"}">${ok ? "✓" : "!"} ${esc(s)}</span>`;
  }).join("");
  const elig = [...j.eligibility];
  if (j.minCgpa) elig.push(`Minimum CGPA ${j.minCgpa}`);
  if (j.maxBacklogs != null) elig.push(`Up to ${j.maxBacklogs} backlog${j.maxBacklogs === 1 ? "" : "s"} allowed`);
  let action;
  if (j.applied) action = `${badge(j.applicationStatus)}`;
  else if (j.closed) action = badge("Closed", "Applications closed");
  else if (!j.eligible) action = `<button class="btn" disabled>Not eligible</button>`;
  else action = `<button class="btn" data-action="job-apply" data-id="${j.id}">Apply now</button>`;
  openModal(`
    <h3>${esc(j.title)} ${j.verified ? `<span class="verified">✓ Verified</span>` : ""}</h3>
    <div class="muted">${esc(j.company)} • ${esc(j.location)}</div>
    <div class="quick"><span>📍 ${esc(j.mode)}</span><span>🎓 ${esc(j.jobType)}</span>${j.duration ? `<span>⏱ ${esc(j.duration)}</span>` : ""}
      ${j.stipend ? `<span>💰 ${esc(j.stipend)}</span>` : ""}<span>📅 Apply by ${fmtDate(j.deadline)}${j.daysLeft != null && j.daysLeft >= 0 ? ` (${j.daysLeft} days left)` : ""}</span>
      <span>👥 ${j.openings} opening${j.openings === 1 ? "" : "s"}</span></div>
    <p>Your skill match: <b class="${matchClass(m.pct)}">${m.pct}%</b> <span class="muted small">(${m.matched.length} of ${j.skills.length} required skills)</span></p>
    <h3 class="sec" style="font-size:14px;margin:16px 0 4px">About the role</h3><p>${esc(j.description)}</p>
    <h3 class="sec" style="font-size:14px;margin:16px 0 0">Skills required</h3><div class="chips">${skillChips}</div>
    ${elig.length ? `<h3 class="sec" style="font-size:14px;margin:16px 0 4px">Eligibility</h3><ul style="margin-left:18px">${elig.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
    ${!j.eligible ? `<div class="alert warn" style="margin-top:14px">${j.eligibilityIssues.map(esc).join("<br>")}</div>` : ""}
    <div class="modal-actions">${action}
      <button class="btn secondary" data-action="job-save" data-id="${j.id}" id="modalSave">${j.saved ? "★ Saved" : "☆ Save job"}</button></div>`);
}

SH.actions["job-open"] = async el => {
  try { const { job } = await api(`/jobs/${el.dataset.id}`); jobModal(job); }
  catch (e) { toast(e.message, "error"); }
};
SH.actions["job-apply"] = async el => {
  try {
    await busy(el, () => api(`/jobs/${el.dataset.id}/apply`, { method: "POST" }));
    toast("Application sent. Good luck!", "ok");
    handleRoute();
  } catch (e) { toast(e.message, "error"); }
};
SH.actions["job-save"] = async el => {
  try {
    const { saved } = await api(`/jobs/${el.dataset.id}/save`, { method: "POST" });
    toast(saved ? "Job saved." : "Removed from saved jobs.");
    const cached = JOBS.all.find(x => x.id === +el.dataset.id);
    if (cached) cached.saved = saved;
    if ($("#overlay")) { const b = $("#modalSave"); if (b) b.textContent = saved ? "★ Saved" : "☆ Save job"; if ($("#jobList")) renderJobList(); }
    else if ($("#jobList")) renderJobList();
    else handleRoute();
  } catch (e) { toast(e.message, "error"); }
};

/* ---------- HOME ---------- */
route("/student/home", "student", async ctx => {
  page(ctx, "/student/home");
  const d = await api("/student/dashboard");
  if (ctx.stale()) return;
  SH.user = d.user;
  const u = d.user, j = d.journey;
  const mini = [[j.cgpa || "-", "CGPA"], [j.skills, "Skills"], [j.hackathons, "Hackathons"], [j.awards, "Awards"],
    [j.leadership, "Leadership Roles"], [j.internships, "Internships"], [j.experienceMonths + "mo", "Experience"]];
  setView(`
    <div class="view-head"><h2>Welcome, ${esc(u.name.split(" ")[0])}! 👋</h2>
      <p>${esc(u.branch)} • ${esc(u.currentYear)} • Graduating ${esc(u.gradYear)}</p></div>
    ${!u.hasResume ? `<div class="alert info">Recruiters can view your resume. <a data-action="go" data-to="/student/profile" role="button" tabindex="0">Upload it on your profile.</a></div>` : ""}
    <div class="stats">
      <div class="stat"><b>${d.profileComplete}%</b><span>Profile Complete</span></div>
      <div class="stat"><b>${d.recommendedCount}</b><span>Recommended Jobs</span></div>
      <div class="stat"><b>${d.applicationCount}</b><span>Applications</span></div></div>
    <h3 class="sec">Your 4-Year Career Journey</h3>
    <div class="journey">${mini.map(([n, l]) => `<div class="mini"><b>${n}</b><span>${l}</span></div>`).join("")}</div>
    <div class="section-head"><h3>Recommended Jobs / Internships</h3><a data-action="go" data-to="/student/jobs" role="button" tabindex="0" class="small" style="font-weight:600">View all</a></div>
    ${d.recommended.length ? d.recommended.map(x => jobCard(x)).join("") : empty("💼", "No open jobs right now", "New openings will show up here.")}`);
});

/* ---------- JOBS ---------- */
const JOBS = { all: [], f: { q: "", mode: "", type: "", sort: "match", saved: false, hideClosed: false } };

function jobsFiltered() {
  const f = JOBS.f;
  let list = JOBS.all.filter(j =>
    (!f.q || (j.title + " " + j.company + " " + j.location + " " + j.skills.join(" ")).toLowerCase().includes(f.q.toLowerCase())) &&
    (!f.mode || j.mode === f.mode) && (!f.type || j.jobType === f.type) && (!f.saved || j.saved) && (!f.hideClosed || !j.closed));
  if (f.sort === "deadline") list.sort((a, b) => (a.closed - b.closed) || (a.deadline || "9").localeCompare(b.deadline || "9"));
  else list.sort((a, b) => (a.closed - b.closed) || (b.match.pct - a.match.pct));
  return list;
}
function renderJobList() {
  const list = jobsFiltered();
  $("#jobList").innerHTML = list.length ? list.map(j => jobCard(j, { actions: true })).join("")
    : empty("🔍", "No jobs match your filters", "Try clearing the search or filters.");
  $("#jobCount").textContent = `${list.length} job${list.length === 1 ? "" : "s"}`;
}
SH.inputs["jobs-q"] = debounce(el => { JOBS.f.q = el.value; renderJobList(); }, 150);
SH.changes["jobs-filter"] = el => { JOBS.f[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value; renderJobList(); };

route("/student/jobs", "student", async ctx => {
  page(ctx, "/student/jobs");
  const { jobs } = await api("/jobs");
  if (ctx.stale()) return;
  JOBS.all = jobs;
  const f = JOBS.f;
  setView(`
    <div class="view-head"><div class="row"><div><h2>Jobs & Internships</h2><p>Sorted by how well your skills match. <span id="jobCount"></span></p></div></div></div>
    <div class="filters">
      <input type="search" placeholder="Search by title, company, skill or city" value="${esc(f.q)}" data-input="jobs-q" aria-label="Search jobs">
      <select data-change="jobs-filter" data-k="mode" aria-label="Work mode">${opt(["On-site", "Remote", "Hybrid"], f.mode, "All modes")}</select>
      <select data-change="jobs-filter" data-k="type" aria-label="Job type">${opt(["Internship", "Full-time"], f.type, "All types")}</select>
      <select data-change="jobs-filter" data-k="sort" aria-label="Sort">
        <option value="match" ${f.sort === "match" ? "selected" : ""}>Best match first</option><option value="deadline" ${f.sort === "deadline" ? "selected" : ""}>Deadline soonest</option></select>
      <label class="check"><input type="checkbox" data-change="jobs-filter" data-k="saved" ${f.saved ? "checked" : ""}> Saved only</label>
      <label class="check"><input type="checkbox" data-change="jobs-filter" data-k="hideClosed" ${f.hideClosed ? "checked" : ""}> Hide closed</label>
    </div><div id="jobList"></div>`);
  renderJobList();
});

/* ---------- APPLICATIONS ---------- */
route("/student/applications", "student", async ctx => {
  page(ctx, "/student/applications");
  const { applications } = await api("/applications");
  if (ctx.stale()) return;
  setView(`<div class="view-head"><h2>Your Applications</h2><p>${applications.length} in total</p></div>
    <div class="card flat">${applications.length ? applications.map(a => `
      <div class="app-row"><div class="app-left"><div class="avatar-sm">${esc(initials(a.title))}</div>
        <div><div class="app-title">${esc(a.title)}</div><div class="muted small">${esc(a.company)} • ${esc(a.location)}
          ${a.source === "recruiter" ? ` • <b style="color:var(--green-dark)">Shortlisted by the recruiter</b>` : ""}</div></div></div>
        <div class="app-right">${badge(a.status, a.statusLabel)}<span>${timeAgo(a.appliedAt)}</span>
          ${a.status === "Selected" || a.status === "Rejected" ? "" : `<button class="btn ghost sm" data-action="withdraw" data-id="${a.id}">Withdraw</button>`}</div></div>`).join("")
      : empty("📄", "You have not applied anywhere yet", "Find a job that fits your skills and apply in one click.",
          `<button class="btn" data-action="go" data-to="/student/jobs">Browse jobs</button>`)}</div>`);
});
SH.actions.withdraw = async el => {
  if (!confirm("Withdraw this application?")) return;
  try { await api(`/applications/${el.dataset.id}`, { method: "DELETE" }); toast("Application withdrawn."); handleRoute(); }
  catch (e) { toast(e.message, "error"); }
};

/* ---------- SKILL MATCH ---------- */
route("/student/skill-match", "student", async ctx => {
  page(ctx, "/student/skill-match");
  const d = await api("/skill-match" + (ctx.query.job ? `?jobId=${encodeURIComponent(ctx.query.job)}` : ""));
  if (ctx.stale()) return;
  if (!d.selected) return setView(`<div class="view-head"><h2>Skill Matching</h2></div><div class="card">${empty("🎯", "No open jobs to compare with yet")}</div>`);
  const s = d.selected;
  const color = s.pct >= 70 ? "#10B981" : s.pct >= 40 ? "#D97706" : "#DC2626";
  setView(`
    <div class="view-head"><div class="row"><div><h2>Skill Matching</h2><p>See how your skills compare with a job.</p></div>
      <div style="min-width:240px"><label for="smJob">Compare with</label>
        <select id="smJob" data-change="sm-job">${d.jobs.map(j => `<option value="${j.id}" ${j.id === s.id ? "selected" : ""}>${esc(j.title)} - ${esc(j.company)}</option>`).join("")}</select></div></div></div>
    <div class="card"><div class="cols-3">
      <div><h3>Matched Skills</h3>${s.matched.length ? `<div class="chips" style="margin-top:0">${s.matched.map(x => `<span class="chip ok">✓ ${esc(x)}</span>`).join("")}</div>` : `<p class="muted">None of the required skills yet.</p>`}</div>
      <div class="donut-wrap"><h3>Best Match Score</h3>${donut(s.pct, { color, small: s.title })}
        <div class="donut-label ${matchClass(s.pct)}">${esc(s.label)}</div></div>
      <div><h3>Skill Gap (${esc(s.title)})</h3>${s.missing.length ? `<div class="chips" style="margin-top:0">${s.missing.map(x => `<span class="chip warn">⚠ ${esc(x)}</span>`).join("")}</div>
          <p class="muted small" style="margin-top:10px">Recommended: short courses on Coursera / freeCodeCamp for ${esc(s.missing.join(", "))}.</p>`
        : `<p class="match-hi">You have every skill this job asks for.</p>`}</div></div></div>
    <div class="section-head"><h3>Recommended Jobs</h3></div>
    ${d.jobs.map(j => `<div class="job-card" data-action="sm-pick" data-id="${j.id}" role="button" tabindex="0">
      <div class="jc-title">${esc(j.title)}</div><div class="jc-meta">${esc(j.company)} • ${esc(j.location)} — <span class="${matchClass(j.pct)}">${j.pct}% Match</span></div></div>`).join("")}`);
});
SH.changes["sm-job"] = el => go(`/student/skill-match?job=${el.value}`);
SH.actions["sm-pick"] = el => go(`/student/skill-match?job=${el.dataset.id}`);

/* ---------- AI ANALYSIS ---------- */
route("/student/ai-analysis", "student", async ctx => {
  page(ctx, "/student/ai-analysis");
  const a = await api("/career-analysis");
  if (ctx.stale()) return;
  const r = a.readiness;
  setView(`
    <div class="view-head"><h2>AI Career Analysis</h2>
      <p>Computed from your academics, skills, projects, hackathons, internships, leadership and achievements.</p></div>
    <div class="card"><div class="analysis">
      <div class="donut-wrap">${donut(r.score, { color: "#4F46E5", small: "Career Ready" })}<div class="donut-label" style="color:var(--primary)">${esc(r.label)}</div>
        <button class="btn ghost sm" style="margin-top:10px" data-action="explain-score" data-url="/career-analysis/explain">Why this score? 🔍</button></div>
      <div>${a.categories.map(c => bar(c.label, c.score)).join("")}</div></div>
      <p class="muted small" style="margin-top:16px">The circle is the AI model's estimate from 11 profile numbers. The bars show how each area of your profile scores (their average is ${a.profileScore}%).</p></div>
    <div class="cols-2">
      <div class="card"><h3 class="good-title">💪 Strengths</h3>${a.strengths.length ? `<ul class="list-check">${a.strengths.map(s => `<li>✓ ${esc(s)}</li>`).join("")}</ul>` : `<p class="muted">Keep adding to your profile. Strengths appear when an area scores 75% or more.</p>`}</div>
      <div class="card"><h3 class="bad-title">⚠️ Skill Gaps</h3>${a.gaps.length ? `<ul class="list-dot">${a.gaps.map(s => `<li>• ${esc(s)}</li>`).join("")}</ul>` : `<p class="muted">No big gaps found.</p>`}</div></div>
    <div class="card" style="margin-top:18px"><h3>🧭 Recommendation</h3><p>${esc(a.recommendation)}</p></div>
    ${a.concerns.length ? `<div class="card"><h3>Things to fix</h3><ul class="list-dot">${a.concerns.map(c => `<li>• ${esc(c)}</li>`).join("")}</ul></div>` : ""}`);
});

/* ---------- PROFILE ---------- */
route("/student/profile", "student", async ctx => {
  page(ctx, "/student/profile");
  const { user } = await api("/me");
  if (ctx.stale()) return;
  SH.user = user;
  const resume = user.hasResume
    ? `<div class="resume-box"><span>📄 ${esc(user.resumeName)}</span><span style="display:flex;gap:8px">
         <a class="btn secondary sm" href="/api/resume/${user.id}" target="_blank" rel="noopener">View</a>
         <button class="btn ghost sm" data-action="resume-pick">Replace</button>
         <button class="btn danger sm" data-action="resume-remove">Remove</button></span></div>`
    : `<div class="resume-box"><span class="muted">No resume uploaded yet</span><span style="display:flex;gap:8px">
         <button class="btn secondary sm" data-action="resume-pick">Upload PDF</button></span></div>`;
  const generated = `<div class="resume-box" style="margin-top:10px"><span>🪄 Don't have a resume yet? Generate one from your profile.</span>
      <a class="btn secondary sm" href="/api/resume/${user.id}/generate" target="_blank" rel="noopener">Generate PDF resume</a></div>`;
  setView(`${profileLayout(user, `<button class="btn secondary sm" data-action="go" data-to="/student/edit">✎ Edit Profile</button>
      <div style="margin-top:10px"><a class="small" data-action="open-pw" role="button" tabindex="0">Change password</a></div>`, resume + generated)}
    <input type="file" id="resumePick" accept="application/pdf,.pdf" class="hidden" data-change="resume-upload">`);
});
SH.actions["resume-pick"] = () => $("#resumePick").click();
SH.changes["resume-upload"] = async el => {
  const f = el.files[0];
  if (!f) return;
  const form = new FormData(); form.append("resume", f);
  try { await api("/resume", { method: "POST", form }); toast("Resume uploaded.", "ok"); handleRoute(); }
  catch (e) { toast(e.message, "error"); el.value = ""; }
};
SH.actions["resume-remove"] = async () => {
  if (!confirm("Remove your resume?")) return;
  try { await api("/resume", { method: "DELETE" }); toast("Resume removed."); handleRoute(); }
  catch (e) { toast(e.message, "error"); }
};

/* change password popup (both roles) */
SH.actions["open-pw"] = () => openModal(`<h3>Change password</h3><div style="height:12px"></div>
  <div id="pwError" class="alert error hidden"></div>
  <form data-form="pw" novalidate>${pwdField("pwCur", "Current password")}${pwdField("pwNew", "New password", "At least 6 characters, letters and numbers")}
  <button class="btn" type="submit">Update password</button></form>`);
SH.forms.pw = async form => {
  try {
    await api("/change-password", { method: "POST", json: { current: $("#pwCur").value, new: $("#pwNew").value } });
    closeModal(); toast("Password updated.", "ok");
  } catch (e) { const b = $("#pwError"); b.textContent = e.message; b.classList.remove("hidden"); }
};


/* ---------- "Why this score?" explainable-AI modal (student + recruiter use this) ---------- */
function explainModal(d) {
  const rows = d.factors.map(f => {
    const pct = Math.min(100, Math.abs(f.impact) * 4);
    const positive = f.impact >= 0;
    return `<div class="bar-row"><div class="bar-top"><b>${esc(f.label)}</b>
        <span class="${positive ? "match-hi" : "match-lo"}">${positive ? "+" : ""}${f.impact} pts</span></div>
      <div class="bar-track"><div class="bar-fill ${positive ? "hi" : "lo"}" style="width:${pct}%"></div></div>
      <div class="muted small" style="margin-top:2px">You: ${f.yourValue} &nbsp;•&nbsp; Typical student: ${f.typicalValue}</div></div>`;
  }).join("");
  openModal(`<h3>Why this score? 🔍</h3>
    <p class="muted small" style="margin:6px 0 16px">We swap each number in your profile for a typical student's number, one at a time, and see how much the AI score moves. Bigger movement = bigger influence.</p>
    <div style="text-align:center;margin-bottom:16px">${donut(d.score, { color: "#4F46E5", small: d.label })}</div>
    ${rows}`);
}
SH.actions["explain-score"] = async el => {
  try { explainModal(await api(el.dataset.url)); }
  catch (e) { toast(e.message, "error"); }
};