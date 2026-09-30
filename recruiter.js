/* recruiter.js - Dashboard, Post a Job, My Jobs, Applicants, Smart Shortlist, Student Rankings, Company, Analytics. */
"use strict";

const STATUS_OPTIONS = [["Applied", "Applied"], ["UnderReview", "Under Review"], ["Shortlisted", "Shortlisted"], ["Selected", "Selected"], ["Rejected", "Rejected"]];
const scorePill = v => `<span class="score-pill ${pillClass(v)}">${Math.round(v)}%</span>`;
const jobStateBadge = j => j.status === "Closed" ? badge("Closed", "Closed") : j.closed ? badge("Closed", "Deadline passed") : badge("Shortlisted", "Open");

/* ---------- DASHBOARD ---------- */
route("/recruiter/home", "recruiter", async ctx => {
  page(ctx, "/recruiter/home");
  const d = await api("/recruiter/dashboard");
  if (ctx.stale()) return;
  const s = d.stats;
  setView(`
    <div class="view-head"><h2>Welcome, ${esc(SH.user.name)} 👋</h2><p>Here is what is happening with your hiring.</p></div>
    ${d.profileIncomplete ? `<div class="alert info">Add your industry, location and about text so students know who you are. <a data-action="go" data-to="/recruiter/company" role="button" tabindex="0">Complete company profile</a></div>` : ""}
    <div class="stats four">
      <div class="stat"><b>${s.activeJobs}</b><span>Open jobs</span></div>
      <div class="stat"><b>${s.applicants}</b><span>Applicants</span></div>
      <div class="stat"><b>${s.shortlisted}</b><span>Shortlisted</span></div>
      <div class="stat"><b>${s.students}</b><span>Students on SmartHire</span></div></div>
    <div style="display:flex;gap:10px;margin:18px 0 0;flex-wrap:wrap">
      <button class="btn" data-action="go" data-to="/recruiter/post">➕ Post a job</button>
      <button class="btn secondary" data-action="go" data-to="/recruiter/shortlist">🎯 Smart Shortlist</button>
      <button class="btn secondary" data-action="go" data-to="/recruiter/students">🏆 Student rankings</button>
      <button class="btn secondary" data-action="go" data-to="/recruiter/analytics">📊 Analytics</button></div>
    <div class="section-head"><h3>Recent applicants</h3></div>
    <div class="card flat">${d.recent.length ? d.recent.map(r => `
      <div class="app-row"><div class="app-left"><div class="avatar-sm">${esc(initials(r.name))}</div>
        <div><div class="app-title"><a data-action="go" data-to="/recruiter/student/${r.studentId}?job=${r.jobId}" role="button" tabindex="0">${esc(r.name)}</a></div>
          <div class="muted small">${esc(r.branch)} • ${r.source === "recruiter" ? "Shortlisted by you for" : "applied for"} ${esc(r.jobTitle)}</div></div></div>
        <div class="app-right">${badge(r.status, r.statusLabel)}<span>${timeAgo(r.appliedAt)}</span></div></div>`).join("")
      : empty("📭", "No applicants yet", "Post a job or use Smart Shortlist to find candidates.")}</div>`);
});

/* ---------- POST / EDIT JOB ---------- */
function jobForm(j) {
  j = j || { title: "", location: "", mode: "On-site", jobType: "Internship", duration: "", stipend: "", deadline: "", openings: 1,
    minCgpa: 0, maxBacklogs: "", description: "", skills: [], eligibility: [] };
  const today = new Date().toISOString().slice(0, 10);
  return `<div id="jobError" class="alert error hidden" role="alert"></div>
  <form data-form="job" novalidate><input type="hidden" id="jobId" value="${j.id || ""}">
    <div class="card"><h3>Job details</h3>
      <div class="grid-2"><div class="field"><label for="jTitle">Job title *</label><input id="jTitle" value="${esc(j.title)}" placeholder="e.g. Software Developer Intern"></div>
        <div class="field"><label for="jLoc">Location</label><input id="jLoc" value="${esc(j.location)}" placeholder="e.g. Bangalore"></div></div>
      <div class="grid-3"><div class="field"><label for="jType">Type</label><select id="jType">${opt(["Internship", "Full-time"], j.jobType)}</select></div>
        <div class="field"><label for="jMode">Work mode</label><select id="jMode">${opt(["On-site", "Remote", "Hybrid"], j.mode)}</select></div>
        <div class="field"><label for="jOpen">Openings</label><input id="jOpen" type="number" min="1" value="${j.openings}"></div></div>
      <div class="grid-3"><div class="field"><label for="jDur">Duration</label><input id="jDur" value="${esc(j.duration)}" placeholder="3-6 Months"></div>
        <div class="field"><label for="jStip">Stipend / salary</label><input id="jStip" value="${esc(j.stipend)}" placeholder="Rs 15,000 / Month"></div>
        <div class="field"><label for="jDead">Last date to apply *</label><input id="jDead" type="date" ${j.id ? "" : `min="${today}"`} value="${esc(j.deadline)}"></div></div>
      <div class="field"><label for="jDesc">Description *</label><textarea id="jDesc" rows="4" placeholder="What will the student work on?">${esc(j.description)}</textarea></div></div>
    <div class="card"><h3>Who can apply</h3>
      <div class="field"><label for="jSkills">Required skills * (comma separated)</label><input id="jSkills" value="${esc(j.skills.join(", "))}" placeholder="Python, SQL, Data Structures">
        <div class="hint">Students are matched against these skills.</div></div>
      <div class="grid-2"><div class="field"><label for="jCgpa">Minimum CGPA</label><input id="jCgpa" type="number" step="0.1" min="0" max="10" value="${j.minCgpa || 0}"></div>
        <div class="field"><label for="jBack">Maximum backlogs allowed</label><input id="jBack" type="number" min="0" placeholder="Leave empty for no limit" value="${j.maxBacklogs ?? ""}"></div></div>
      <div class="field"><label for="jElig">Other eligibility notes (one per line)</label><textarea id="jElig" rows="3">${esc(j.eligibility.join("\n"))}</textarea></div></div>
    <div style="display:flex;gap:10px"><button class="btn" type="submit">${j.id ? "Save changes" : "Post job"}</button>
      <button class="btn ghost" type="button" data-action="go" data-to="/recruiter/jobs">Cancel</button></div></form>`;
}
SH.forms.job = async form => {
  const id = $("#jobId").value;
  const payload = { title: $("#jTitle").value, location: $("#jLoc").value, jobType: $("#jType").value, mode: $("#jMode").value,
    openings: $("#jOpen").value, duration: $("#jDur").value, stipend: $("#jStip").value, deadline: $("#jDead").value,
    description: $("#jDesc").value, skills: $("#jSkills").value, minCgpa: $("#jCgpa").value, maxBacklogs: $("#jBack").value,
    eligibility: $("#jElig").value };
  const btn = $("button[type=submit]", form), box = $("#jobError");
  try {
    await busy(btn, () => api(id ? `/jobs/${id}` : "/jobs", { method: id ? "PUT" : "POST", json: payload }));
    toast(id ? "Job updated." : "Job posted.", "ok");
    go("/recruiter/jobs");
  } catch (e) { box.textContent = e.message; box.classList.remove("hidden"); box.scrollIntoView({ block: "center", behavior: "smooth" }); }
};
route("/recruiter/post", "recruiter", async ctx => {
  page(ctx, "/recruiter/post");
  setView(`<div class="view-head"><h2>Post a Job</h2><p>Students see this straight away and get a skill-match score.</p></div>${jobForm()}`);
});
route("/recruiter/edit/:id", "recruiter", async ctx => {
  page(ctx, "/recruiter/jobs");
  const { job } = await api(`/recruiter/jobs/${ctx.params.id}`);
  if (ctx.stale()) return;
  setView(`<div class="view-head"><h2>Edit Job</h2><p>${esc(job.title)}</p></div>${jobForm(job)}`);
});

/* ---------- MY JOBS ---------- */
route("/recruiter/jobs", "recruiter", async ctx => {
  page(ctx, "/recruiter/jobs");
  const { jobs } = await api("/recruiter/jobs");
  if (ctx.stale()) return;
  setView(`<div class="view-head"><div class="row"><div><h2>My Jobs</h2><p>${jobs.length} posted</p></div>
      <button class="btn" data-action="go" data-to="/recruiter/post">➕ Post a job</button></div></div>
    ${jobs.length ? jobs.map(j => `<div class="card flat" style="margin-bottom:12px">
      <div class="jc-top"><div><div class="jc-title">${esc(j.title)} ${jobStateBadge(j)}</div>
        <div class="jc-meta">${esc(j.location)} • ${esc(j.mode)} • ${esc(j.jobType)} • Apply by ${fmtDate(j.deadline)}</div>
        ${chips(j.skills)}</div>
        <div style="text-align:right;flex-shrink:0"><div><b style="font:700 20px Sora">${j.applicants}</b> <span class="muted small">applicants</span></div>
          <div class="muted small">${j.shortlisted} shortlisted • ${j.selected} selected</div></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="btn sm" data-action="go" data-to="/recruiter/applicants/${j.id}">View applicants</button>
        <button class="btn secondary sm" data-action="go" data-to="/recruiter/shortlist/${j.id}">🎯 Smart Shortlist</button>
        <button class="btn ghost sm" data-action="go" data-to="/recruiter/edit/${j.id}">Edit</button>
        <button class="btn ghost sm" data-action="toggle-job" data-id="${j.id}">${j.status === "Open" ? "Close applications" : "Reopen"}</button>
        <button class="btn danger sm" data-action="delete-job" data-id="${j.id}" data-title="${esc(j.title)}">Delete</button></div></div>`).join("")
      : `<div class="card">${empty("💼", "You have not posted a job yet", "Post your first job to start receiving applications.", `<button class="btn" data-action="go" data-to="/recruiter/post">Post a job</button>`)}</div>`}`);
});
SH.actions["toggle-job"] = async el => {
  try { const { status } = await api(`/jobs/${el.dataset.id}/toggle`, { method: "POST" }); toast(status === "Open" ? "Job reopened." : "Applications closed."); handleRoute(); }
  catch (e) { toast(e.message, "error"); }
};
SH.actions["delete-job"] = async el => {
  if (!confirm(`Delete "${el.dataset.title}" and all its applications? This cannot be undone.`)) return;
  try { await api(`/jobs/${el.dataset.id}`, { method: "DELETE" }); toast("Job deleted."); handleRoute(); }
  catch (e) { toast(e.message, "error"); }
};

/* ---------- APPLICANTS (one job) ---------- */
const AP = { filter: "All", data: null };
function applicantsTable() {
  const list = AP.data.applicants.filter(a => AP.filter === "All" || a.status === AP.filter);
  if (!list.length) return empty("👥", "No applicants here", AP.filter === "All" ? "Share the job or use Smart Shortlist to invite students." : "Nobody has this status yet.");
  return `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Branch</th><th>CGPA</th><th>Skill match</th><th>AI readiness</th><th>Score</th><th>Applied</th><th>Status</th></tr></thead><tbody>
    ${list.map(a => `<tr><td class="name-cell"><b><a data-action="go" data-to="/recruiter/student/${a.id}?job=${AP.data.job.id}" role="button" tabindex="0">${esc(a.name)}</a></b>
        <span class="muted small">${esc(a.email)}</span></td>
      <td>${esc(a.branch)}<div class="muted small">${esc(a.currentYear)}</div></td><td>${a.cgpa || "-"}</td>
      <td>${scorePill(a.matchPct)}</td><td>${scorePill(a.readiness)}</td><td><b>${a.combined}</b></td><td class="muted small">${timeAgo(a.appliedAt)}</td>
      <td><select data-change="set-status" data-id="${a.applicationId}" aria-label="Status for ${esc(a.name)}" style="min-width:130px">
        ${STATUS_OPTIONS.map(([v, l]) => `<option value="${v}" ${a.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></td></tr>`).join("")}
    </tbody></table></div>`;
}
route("/recruiter/applicants/:id", "recruiter", async ctx => {
  page(ctx, "/recruiter/jobs");
  const d = await api(`/jobs/${ctx.params.id}/applicants`);
  if (ctx.stale()) return;
  AP.data = d; AP.filter = "All";
  const counts = s => d.applicants.filter(a => a.status === s).length;
  setView(`<div class="view-head"><div class="row"><div><a data-action="go" data-to="/recruiter/jobs" class="small" role="button" tabindex="0">← My jobs</a>
      <h2>${esc(d.job.title)}</h2><p>${d.applicants.length} applicant${d.applicants.length === 1 ? "" : "s"}, best combined score first.</p></div>
      <button class="btn secondary" data-action="go" data-to="/recruiter/shortlist/${d.job.id}">🎯 Smart Shortlist</button></div></div>
    <div class="filters">${["All", ...STATUS_OPTIONS.map(x => x[0])].map(s =>
      `<button class="btn ${s === "All" ? "" : "ghost"} sm" data-action="ap-filter" data-s="${s}" id="apf-${s}">${statusLabel(s)}${s === "All" ? ` (${d.applicants.length})` : ` (${counts(s)})`}</button>`).join("")}</div>
    <div class="card flat" id="apTable">${applicantsTable()}</div>`);
});
SH.actions["ap-filter"] = el => {
  AP.filter = el.dataset.s;
  $$("[data-action=ap-filter]").forEach(b => b.classList.toggle("ghost", b !== el));
  $("#apTable").innerHTML = applicantsTable();
};
SH.changes["set-status"] = async el => {
  try {
    const r = await api(`/applications/${el.dataset.id}/status`, { method: "PATCH", json: { status: el.value } });
    toast(`Status changed to ${r.statusLabel}.`, "ok");
    const a = AP.data.applicants.find(x => x.applicationId === +el.dataset.id);
    if (a) a.status = el.value;
  } catch (e) { toast(e.message, "error"); handleRoute(); }
};

/* ---------- SMART SHORTLIST ---------- */
const SL = { jobId: null, page: 1, perPage: 25, q: "", branch: "", minMatch: "0", eligibleOnly: true, sort: "combined", sel: new Set(), data: null };

async function slLoad() {
  const qs = new URLSearchParams({ page: SL.page, perPage: SL.perPage, q: SL.q, branch: SL.branch, minMatch: SL.minMatch,
    eligibleOnly: SL.eligibleOnly ? 1 : 0, sort: SL.sort });
  if (!$("#slTable")) return;
  $("#slTable").innerHTML = loading();
  try {
    const data = await api(`/jobs/${SL.jobId}/shortlist?${qs}`);
    if (!$("#slTable")) return;                       // user already moved to another page
    SL.data = data; slRender();
  } catch (e) { if ($("#slTable")) $("#slTable").innerHTML = empty("⚠️", "Could not load students", e.message); }
}
function slRender() {
  const d = SL.data, box = $("#slTable");
  if (!d || !box) return;
  const rows = d.students;
  const allChecked = rows.length && rows.every(s => SL.sel.has(s.id));
  box.innerHTML = (rows.length ? `<div class="table-wrap"><table><thead><tr>
      <th><input type="checkbox" data-change="sl-all" ${allChecked ? "checked" : ""} aria-label="Select all on this page"></th>
      <th>Rank</th><th>Student</th><th>Branch</th><th>CGPA</th><th>Skill match</th><th>AI readiness</th><th>Score</th><th>Eligible</th><th>Status</th></tr></thead><tbody>
      ${rows.map(s => `<tr>
        <td><input type="checkbox" data-change="sl-check" data-id="${s.id}" ${SL.sel.has(s.id) ? "checked" : ""} aria-label="Select ${esc(s.name)}"></td>
        <td class="rank">#${s.rank}</td>
        <td class="name-cell"><b><a data-action="go" data-to="/recruiter/student/${s.id}?job=${SL.jobId}" role="button" tabindex="0">${esc(s.name)}</a></b>
          <span class="muted small">${esc(s.topSkills.join(", "))}</span></td>
        <td>${esc(s.branch)}<div class="muted small">${esc(s.currentYear)}</div></td><td>${s.cgpa || "-"}${s.backlogs ? `<div class="match-lo small">${s.backlogs} backlog${s.backlogs > 1 ? "s" : ""}</div>` : ""}</td>
        <td>${scorePill(s.matchPct)}</td><td>${scorePill(s.readiness)}</td><td><b>${s.combined}</b></td>
        <td>${s.eligible ? `<span class="match-hi">✓ Yes</span>` : `<span class="match-lo" title="${esc(s.eligibilityIssues.join("; "))}">✗ No</span>`}</td>
        <td>${s.applicationStatus ? badge(s.applicationStatus, s.applicationLabel) : `<span class="muted small">-</span>`}</td></tr>`).join("")}
      </tbody></table></div>` : empty("🔍", "No students match these filters", "Lower the minimum match or turn off 'Eligible only'."))
    + pagination(d, "sl-page")
    + `<div class="select-bar ${SL.sel.size ? "" : "hidden"}" id="slBar"><span><b>${SL.sel.size}</b> student${SL.sel.size === 1 ? "" : "s"} selected</span>
        <span style="display:flex;gap:8px"><button class="btn ghost sm" style="color:#fff;border-color:#475569" data-action="sl-clear">Clear</button>
        <button class="btn green sm" data-action="sl-shortlist">Shortlist selected</button></span></div>`;
}
function slUpdateBar() {
  const bar = $("#slBar");
  if (!bar) return slRender();
  bar.classList.toggle("hidden", !SL.sel.size);
  bar.firstElementChild.innerHTML = `<b>${SL.sel.size}</b> student${SL.sel.size === 1 ? "" : "s"} selected`;
}

route("/recruiter/shortlist", "recruiter", async ctx => {
  page(ctx, "/recruiter/shortlist");
  const { jobs } = await api("/recruiter/jobs");
  if (ctx.stale()) return;
  setView(`<div class="view-head"><h2>Smart Shortlist</h2><p>Pick a job. SmartHire ranks every student in the college for it.</p></div>
    ${jobs.length ? jobs.map(j => `<div class="job-card" data-action="go" data-to="/recruiter/shortlist/${j.id}" role="button" tabindex="0">
      <div class="jc-title">${esc(j.title)} ${jobStateBadge(j)}</div><div class="jc-meta">${esc(j.location)} • ${j.applicants} applicants so far</div>${chips(j.skills)}</div>`).join("")
      : `<div class="card">${empty("💼", "Post a job first", "Smart Shortlist ranks students against a job's required skills.", `<button class="btn" data-action="go" data-to="/recruiter/post">Post a job</button>`)}</div>`}`);
});

route("/recruiter/shortlist/:id", "recruiter", async ctx => {
  page(ctx, "/recruiter/shortlist");
  const { jobs } = await api("/recruiter/jobs");
  if (ctx.stale()) return;
  const job = jobs.find(j => j.id === +ctx.params.id);
  if (!job) return go("/recruiter/shortlist");
  if (SL.jobId !== job.id) Object.assign(SL, { jobId: job.id, page: 1, q: "", branch: "", minMatch: "0", eligibleOnly: true, sort: "combined", sel: new Set() });
  setView(`<div class="view-head"><div class="row"><div><h2>Smart Shortlist</h2><p>${esc(job.title)} • needs ${esc(job.skills.join(", "))}</p></div>
      <div style="min-width:240px"><label for="slJob">Job</label><select id="slJob" data-change="sl-job">${jobs.map(j => `<option value="${j.id}" ${j.id === job.id ? "selected" : ""}>${esc(j.title)}</option>`).join("")}</select></div></div></div>
    <div class="card flat"><div class="formula"><b>Score =</b><span class="pill">60% skill match</span>+<span class="pill">40% AI readiness</span>
      <span class="muted small">Students who miss the CGPA or backlog limit are marked not eligible.</span></div></div>
    <div class="filters">
      <input type="search" placeholder="Search name or email" value="${esc(SL.q)}" data-input="sl-q" aria-label="Search students">
      <select data-change="sl-filter" data-k="branch" id="slBranch" aria-label="Branch"><option value="">All branches</option></select>
      <select data-change="sl-filter" data-k="minMatch" aria-label="Minimum skill match">${[0, 25, 50, 75].map(v => `<option value="${v}" ${SL.minMatch == v ? "selected" : ""}>${v ? `Match ${v}%+` : "Any match"}</option>`).join("")}</select>
      <select data-change="sl-filter" data-k="sort" aria-label="Sort by">${[["combined", "Best score"], ["match", "Skill match"], ["readiness", "AI readiness"], ["cgpa", "CGPA"]].map(([v, l]) => `<option value="${v}" ${SL.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <label class="check"><input type="checkbox" data-change="sl-filter" data-k="eligibleOnly" ${SL.eligibleOnly ? "checked" : ""}> Eligible only</label>
      <span style="display:flex;gap:6px;align-items:center"><input type="number" id="slTop" min="1" max="500" value="10" style="width:70px" aria-label="How many top students"><button class="btn secondary sm" data-action="sl-top">Select top</button></span>
    </div>
    <div class="card flat"><div id="slSummary" class="muted small" style="margin-bottom:8px"></div><div id="slTable">${loading()}</div></div>`);
  await slLoad();
  if (ctx.stale()) return;
  const bsel = $("#slBranch");
  if (!bsel || !SL.data) return;
  bsel.innerHTML = `<option value="">All branches</option>` + SL.data.branches.map(b => `<option ${b === SL.branch ? "selected" : ""}>${esc(b)}</option>`).join("");
  $("#slSummary").textContent = `${SL.data.summary.students} students ranked • ${SL.data.summary.eligible} meet this job's eligibility rules`;
});
SH.changes["sl-job"] = el => go(`/recruiter/shortlist/${el.value}`);
SH.inputs["sl-q"] = debounce(el => { SL.q = el.value; SL.page = 1; slLoad(); }, 300);
SH.changes["sl-filter"] = el => {
  SL[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value;
  SL.page = 1; slLoad();
};
SH.actions["sl-page"] = el => { SL.page = +el.dataset.page; slLoad(); };
SH.changes["sl-check"] = el => { const id = +el.dataset.id; el.checked ? SL.sel.add(id) : SL.sel.delete(id); slUpdateBar(); };
SH.changes["sl-all"] = el => { SL.data.students.forEach(s => el.checked ? SL.sel.add(s.id) : SL.sel.delete(s.id)); slRender(); };
SH.actions["sl-clear"] = () => { SL.sel.clear(); slRender(); };
SH.actions["sl-top"] = async el => {
  const n = Math.max(1, Math.min(500, +$("#slTop").value || 10));
  const qs = new URLSearchParams({ page: 1, perPage: Math.min(100, n), q: SL.q, branch: SL.branch, minMatch: SL.minMatch, eligibleOnly: 1, sort: SL.sort });
  try {
    const first = await api(`/jobs/${SL.jobId}/shortlist?${qs}`);
    let ids = first.students.map(s => s.id);
    if (n > 100) { qs.set("perPage", 100); for (let p = 2; ids.length < n && p <= first.pages; p++) { qs.set("page", p); ids = ids.concat((await api(`/jobs/${SL.jobId}/shortlist?${qs}`)).students.map(s => s.id)); } }
    SL.sel = new Set(ids.slice(0, n));
    slRender();
    toast(`Selected the top ${SL.sel.size} eligible students.`);
  } catch (e) { toast(e.message, "error"); }
};
SH.actions["sl-shortlist"] = async el => {
  if (!SL.sel.size) return;
  try {
    const r = await busy(el, () => api(`/jobs/${SL.jobId}/shortlist`, { method: "POST", json: { studentIds: [...SL.sel] } }));
    toast(`Shortlisted ${r.added + r.updated} student${r.added + r.updated === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} already shortlisted)` : ""}.`, "ok");
    SL.sel.clear(); slLoad();
  } catch (e) { toast(e.message, "error"); }
};

/* ---------- STUDENT RANKINGS ---------- */
const RK = { page: 1, q: "", branch: "", minReadiness: "0", sort: "readiness" };
async function rkLoad() {
  const qs = new URLSearchParams({ page: RK.page, perPage: 20, q: RK.q, branch: RK.branch, minReadiness: RK.minReadiness, sort: RK.sort });
  if (!$("#rkTable")) return;
  $("#rkTable").innerHTML = loading();
  try {
    const d = await api(`/students?${qs}`);
    if (!$("#rkTable")) return;                       // user already moved to another page
    const sel = $("#rkBranch");
    if (sel && sel.options.length <= 1) sel.innerHTML = `<option value="">All branches</option>` + d.branches.map(b => `<option ${b === RK.branch ? "selected" : ""}>${esc(b)}</option>`).join("");
    $("#rkTable").innerHTML = (d.students.length ? `<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Student</th><th>Branch</th><th>CGPA</th><th>Backlogs</th><th>Skills</th><th>AI readiness</th></tr></thead><tbody>
      ${d.students.map(s => `<tr class="row-link" data-action="go" data-to="/recruiter/student/${s.id}"><td class="rank">#${s.rank}</td>
        <td class="name-cell"><b>${esc(s.name)}</b><span class="muted small">${esc(s.email)}</span></td>
        <td>${esc(s.branch)}<div class="muted small">${esc(s.currentYear)}</div></td><td>${s.cgpa || "-"}</td>
        <td>${s.backlogs ? `<span class="match-lo">${s.backlogs}</span>` : "0"}</td><td class="muted small">${esc(s.topSkills.join(", "))}</td>
        <td>${scorePill(s.readiness)} <span class="muted small">${esc(s.label)}</span></td></tr>`).join("")}</tbody></table></div>`
      : empty("🔍", "No students found", "Try a different search or filter.")) + pagination(d, "rk-page");
  } catch (e) { if ($("#rkTable")) $("#rkTable").innerHTML = empty("⚠️", "Could not load students", e.message); }
}
route("/recruiter/students", "recruiter", async ctx => {
  page(ctx, "/recruiter/students");
  setView(`<div class="view-head"><h2>Student Rankings</h2><p>Every student, ranked by the AI career-readiness model.</p></div>
    <div class="filters"><input type="search" placeholder="Search name or email" value="${esc(RK.q)}" data-input="rk-q" aria-label="Search students">
      <select id="rkBranch" data-change="rk-filter" data-k="branch" aria-label="Branch"><option value="">All branches</option>${RK.branch ? `<option selected>${esc(RK.branch)}</option>` : ""}</select>
      <select data-change="rk-filter" data-k="minReadiness" aria-label="Minimum readiness">${[0, 40, 55, 70].map(v => `<option value="${v}" ${RK.minReadiness == v ? "selected" : ""}>${v ? `Readiness ${v}%+` : "Any readiness"}</option>`).join("")}</select>
      <select data-change="rk-filter" data-k="sort" aria-label="Sort">${[["readiness", "AI readiness"], ["cgpa", "CGPA"], ["name", "Name"]].map(([v, l]) => `<option value="${v}" ${RK.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="card flat" id="rkTable">${loading()}</div>`);
  await rkLoad();
});
SH.inputs["rk-q"] = debounce(el => { RK.q = el.value; RK.page = 1; rkLoad(); }, 300);
SH.changes["rk-filter"] = el => { RK[el.dataset.k] = el.value; RK.page = 1; rkLoad(); };
SH.actions["rk-page"] = el => { RK.page = +el.dataset.page; rkLoad(); };

/* ---------- ONE STUDENT (recruiter view) ---------- */
route("/recruiter/student/:id", "recruiter", async ctx => {
  page(ctx, "/recruiter/students");
  const [d, jobsRes] = await Promise.all([api(`/students/${ctx.params.id}`), api("/recruiter/jobs")]);
  if (ctx.stale()) return;
  const s = d.student, a = d.analysis, r = a.readiness;
  const openJobs = jobsRes.jobs.filter(j => j.status === "Open");
  const pref = +ctx.query.job || (openJobs[0] && openJobs[0].id);
  const resume = (s.hasResume ? `<div class="resume-box"><span>📄 ${esc(s.resumeName)}</span><a class="btn secondary sm" href="/api/resume/${s.id}" target="_blank" rel="noopener">Open resume</a></div>`
    : `<div class="resume-box"><span class="muted">No resume uploaded</span></div>`)
    + `<div class="resume-box" style="margin-top:8px"><span class="muted small">Or generate a clean PDF from their SmartHire profile</span>
        <a class="btn ghost sm" href="/api/resume/${s.id}/generate" target="_blank" rel="noopener">Generate PDF</a></div>`;
  setView(`<div class="view-head"><a data-action="go" data-to="/recruiter/students" class="small" role="button" tabindex="0">← Student rankings</a><h2>${esc(s.name)}</h2>
      <p>${esc(s.branch)} • ${esc(s.currentYear)} • CGPA ${d.cgpa || "-"}</p></div>
    <div class="card"><div class="analysis"><div class="donut-wrap">${donut(r.score, { small: "Career Ready" })}<div class="donut-label" style="color:var(--primary)">${esc(r.label)}</div>
        <button class="btn ghost sm" style="margin-top:10px" data-action="explain-score" data-url="/students/${s.id}/explain">Why this score? 🔍</button></div>
      <div>${a.categories.map(c => bar(c.label, c.score)).join("")}</div></div></div>
    ${openJobs.length ? `<div class="card flat"><div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
      <div style="flex:1;min-width:220px"><label for="rcJob">Shortlist this student for</label><select id="rcJob">${openJobs.map(j => `<option value="${j.id}" ${j.id === pref ? "selected" : ""}>${esc(j.title)}</option>`).join("")}</select></div>
      <button class="btn green" data-action="rc-shortlist" data-id="${s.id}">Shortlist</button></div>
      ${d.applications.length ? `<div class="muted small" style="margin-top:10px">Your jobs: ${d.applications.map(x => `${esc(x.title)} (${esc(x.statusLabel)})`).join(", ")}</div>` : ""}</div>` : ""}
    ${profileLayout(s, "", resume)}`);
});
SH.actions["rc-shortlist"] = async el => {
  try {
    const r = await busy(el, () => api(`/jobs/${$("#rcJob").value}/shortlist`, { method: "POST", json: { studentIds: [+el.dataset.id] } }));
    toast(r.added + r.updated ? "Student shortlisted." : "Already shortlisted for this job.", "ok");
    handleRoute();
  } catch (e) { toast(e.message, "error"); }
};

/* ---------- COMPANY PROFILE ---------- */
route("/recruiter/company", "recruiter", async ctx => {
  page(ctx, "/recruiter/company");
  const { user } = await api("/me");
  if (ctx.stale()) return;
  SH.user = user;
  setView(`<div class="view-head"><h2>Company Profile</h2><p>Students see your company name on every job you post.</p></div>
    <div id="coError" class="alert error hidden"></div>
    <form data-form="company" class="card" novalidate>
      <div class="grid-2"><div class="field"><label for="cName">Company name *</label><input id="cName" value="${esc(user.name)}"></div>
        <div class="field"><label for="cInd">Industry</label><input id="cInd" value="${esc(user.industry)}" placeholder="e.g. Software"></div></div>
      <div class="grid-2"><div class="field"><label for="cLoc">Head office</label><input id="cLoc" value="${esc(user.location)}" placeholder="e.g. Bangalore"></div>
        <div class="field"><label for="cWeb">Website</label><input id="cWeb" value="${esc(user.website)}" placeholder="https://"></div></div>
      <div class="field"><label for="cAbout">About the company</label><textarea id="cAbout" rows="4">${esc(user.about)}</textarea></div>
      <div style="display:flex;gap:10px;align-items:center"><button class="btn" type="submit">Save changes</button>
        <a class="small" data-action="open-pw" role="button" tabindex="0">Change password</a></div></form>`);
});
SH.forms.company = async form => {
  try {
    const { user } = await busy($("button[type=submit]", form), () => api("/recruiter/profile", { method: "PUT",
      json: { name: $("#cName").value, industry: $("#cInd").value, location: $("#cLoc").value, website: $("#cWeb").value, about: $("#cAbout").value } }));
    SH.user = user; toast("Company profile saved.", "ok"); handleRoute();
  } catch (e) { const b = $("#coError"); b.textContent = e.message; b.classList.remove("hidden"); }
};


/* =========================================================
   ANALYTICS DASHBOARD  (self-contained inline SVG charts - no external libs)
   ========================================================= */
function svgBarChart(data, { width = 560, height = 200, barColor = "#4F46E5", labelKey = "label", valueKey = "value" } = {}) {
  if (!data.length) return `<p class="muted small">Not enough data yet.</p>`;
  const max = Math.max(1, ...data.map(d => d[valueKey]));
  const padL = 34, padB = 46, padT = 10, padR = 10;
  const chartW = width - padL - padR, chartH = height - padT - padB;
  const bw = chartW / data.length;
  const bars = data.map((d, i) => {
    const h = (d[valueKey] / max) * chartH;
    const x = padL + i * bw + bw * 0.15;
    const w = bw * 0.7;
    const y = padT + (chartH - h);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${barColor}"/>
      <text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="10" fill="#0F172A" text-anchor="middle" font-weight="600">${d[valueKey]}</text>
      <text x="${(x + w / 2).toFixed(1)}" y="${(height - padB + 16).toFixed(1)}" font-size="9.5" fill="#64748B" text-anchor="middle">${esc(String(d[labelKey]).slice(0, 10))}</text>`;
  }).join("");
  const gridY = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = padT + chartH * (1 - f);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#E5E9F2" stroke-width="1"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto">${gridY}${bars}</svg>`;
}
function svgLineChart(points, { width = 560, height = 180, color = "#4F46E5" } = {}) {
  if (!points.length) return `<p class="muted small">Not enough data yet.</p>`;
  const max = Math.max(1, ...points.map(p => p.count));
  const padL = 30, padB = 26, padT = 14, padR = 14;
  const chartW = width - padL - padR, chartH = height - padT - padB;
  const stepX = points.length > 1 ? chartW / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = padL + i * stepX;
    const y = padT + chartH * (1 - p.count / max);
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = path + ` L${coords[coords.length - 1][0].toFixed(1)},${(padT + chartH).toFixed(1)} L${padL},${(padT + chartH).toFixed(1)} Z`;
  const dots = coords.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${color}"/>`).join("");
  const everyN = Math.ceil(points.length / 7);
  const labels = points.map((p, i) => i % everyN === 0
    ? `<text x="${coords[i][0].toFixed(1)}" y="${height - 8}" font-size="8.5" fill="#64748B" text-anchor="middle">${esc(p.date.slice(5))}</text>` : "").join("");
  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto">
    <path d="${area}" fill="${color}" opacity="0.08"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
    ${dots}${labels}</svg>`;
}
function svgDonutChart(slices, { size = 170 } = {}) {
  const total = slices.reduce((a, s) => a + s.count, 0);
  if (!total) return `<p class="muted small">No applications yet.</p>`;
  const r = size / 2 - 10, cx = size / 2, cy = size / 2, c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices.filter(s => s.count > 0).map(s => {
    const frac = s.count / total;
    const dash = frac * c;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="20"
        stroke-dasharray="${dash.toFixed(1)} ${(c - dash).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
    return el;
  }).join("");
  const legend = slices.map(s => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px">
      <span style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block"></span>${esc(s.label)}: <b>${s.count}</b></div>`).join("");
  return `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}</svg>
    <div>${legend}</div></div>`;
}

const STATUS_COLORS = { Applied: "#4F46E5", UnderReview: "#D97706", Shortlisted: "#10B981", Selected: "#059669", Rejected: "#DC2626" };

route("/recruiter/analytics", "recruiter", async ctx => {
  page(ctx, "/recruiter/analytics");
  const d = await api("/recruiter/analytics");
  if (ctx.stale()) return;
  setView(`
    <div class="view-head"><h2>Analytics</h2><p>How your hiring is going across all jobs.</p></div>
    <div class="stats">
      <div class="stat"><b>${d.totalApplications}</b><span>Total applications</span></div>
      <div class="stat"><b>${d.shortlistRate}%</b><span>Shortlist rate</span></div>
      <div class="stat"><b>${d.topJobs.length ? d.topJobs[0].title : "-"}</b><span>Most applied-to job</span></div></div>
    <div class="cols-2">
      <div class="card"><h3>Applications over the last 14 days</h3>${svgLineChart(d.trend)}</div>
      <div class="card"><h3>Status breakdown</h3>${svgDonutChart(d.statusBreakdown.map(s => ({ label: s.label, count: s.count, color: STATUS_COLORS[s.status] })))}</div></div>
    <div class="cols-2" style="margin-top:18px">
      <div class="card"><h3>Applicants by branch</h3>${svgBarChart(d.branchDistribution.map(b => ({ label: b.branch, value: b.count })))}</div>
      <div class="card"><h3>Applications per job</h3>${svgBarChart(d.topJobs.map(j => ({ label: j.title, value: j.count })), { barColor: "#10B981" })}</div></div>
    <div class="card" style="margin-top:18px"><h3>Most requested skills across your jobs</h3>${chips(d.topSkills.map(s => `${s.skill} (${s.count})`))}</div>`);
});