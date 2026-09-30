/* profile.js - read-only profile view, the multi-step onboarding/edit wizard, and the success page. */
"use strict";

const BRANCHES = ["CSE", "CSE (AIML)", "CSE (Data Science)", "IT", "ECE", "Electrical", "Mechanical", "Civil"];
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const SEM_NAMES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"].map(x => x + " Semester");
const GRAD_YEARS = ["2026", "2027", "2028", "2029", "2030", "2031"];
const HACK_RESULTS = ["Participant", "Shortlisted", "Finalist", "Runner-up", "Winner"];
const AWARD_CATS = ["Hackathon", "Academic", "Coding", "Technical", "Sports", "Cultural", "Other"];
const SKILL_SUGGEST = ["Python", "Java", "C++", "C", "JavaScript", "SQL", "HTML", "CSS", "React", "Node.js", "Flask",
  "Machine Learning", "Data Science", "TensorFlow", "Data Structures", "Git", "Excel", "Data Visualization", "Docker", "AWS"];

const cgpaOf = s => {
  const v = (s.semesters || []).map(x => Number(x.sgpa)).filter(x => !isNaN(x));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100 : 0;
};

/* =========================================================
   READ-ONLY PROFILE  (used by student profile, recruiter view, success page)
   ========================================================= */
function profileBody(s, { resumeHTML = "" } = {}) {
  const sems = (s.semesters || []).map(x => `Sem ${x.sem}: ${x.sgpa}`).join(" · ");
  const att = s.attendance;
  const line = (ico, html) => `<div class="ico-line"><span>${ico}</span><span>${html}</span></div>`;
  const list = (items, fn) => items.length ? `<ul class="plist">${items.map(fn).join("")}</ul>` : `<p class="muted">Nothing added yet.</p>`;
  return `
    <h4>Contact & Education</h4>
    ${line("📧", esc(s.email))}
    ${s.phone ? line("📞", esc(s.phone)) : ""}
    ${s.branch ? line("🎓", `B.Tech in ${esc(s.branch)}`) : ""}
    ${s.college ? line("🏫", `${esc(s.college)} • ${esc(s.currentYear)} • Grad ${esc(s.gradYear)}`) : ""}

    <h4>Class Details</h4>
    ${line("🆔", `Roll No: <b>${esc(s.rollNumber || "-")}</b> • Section ${esc(s.section || "-")}`)}
    ${line("📘", esc(s.semester || "-"))}

    <h4>Academics</h4>
    <p><b>CGPA:</b> ${cgpaOf(s) || "-"}</p>
    ${sems ? `<p class="sems">${esc(sems)}</p>` : ""}
    <p><b>Backlogs:</b> <span class="${s.backlogs ? "match-lo" : "match-hi"}">${s.backlogs || 0}</span>
       ${s.retestPapers && s.retestPapers.length ? `<span class="muted small">(${esc(s.retestPapers.join(", "))})</span>` : ""}</p>
    <p><b>Attendance:</b> ${att == null ? "-" : `<span class="${att >= 75 ? "match-hi" : "match-lo"}">${att}%</span>`}</p>
    <p><b>Fee Status:</b> <span class="chip ${s.feeStatus === "Cleared" ? "ok" : "warn"}">${esc(s.feeStatus)}</span></p>

    <h4>Skills</h4>${chips(s.skills) || `<p class="muted">Nothing added yet.</p>`}

    <h4>Projects</h4>${list(s.projects, p => `<li>${esc(p)}</li>`)}

    <h4>Hackathons</h4>${list(s.hackathons, h => `<li><span>🏆 ${esc(h.name)}</span><b>${esc(h.result)}</b></li>`)}

    <h4>Awards & Achievements</h4>${list(s.awards, a => `<li><span>🏅 ${esc(a.name)}</span><span class="muted small">${esc(a.category)}</span></li>`)}

    <h4>Leadership</h4>${list(s.leadership, l => `<li><span>👑 ${esc(l.role)} — ${esc(l.org)}</span><span class="muted small">Team of ${l.teamSize}</span></li>`)}

    <h4>Internships</h4>${list(s.internships, i => `<li><span>💼 ${esc(i.role)} — ${esc(i.company)}</span><span class="muted small">${i.months} month${i.months === 1 ? "" : "s"}</span></li>`)}

    <h4>Certifications</h4>${s.certifications.length ? `<ul class="plist">${s.certifications.map(c => `<li>• ${esc(c)}</li>`).join("")}</ul>` : `<p class="muted">Nothing added yet.</p>`}

    ${resumeHTML ? `<h4>Resume</h4>${resumeHTML}` : ""}`;
}

function profileLayout(s, sideExtra, resumeHTML) {
  return `<div class="card"><div class="profile-grid">
    <div class="profile-side"><div class="avatar-lg">${esc(initials(s.name))}</div>
      <div class="name">${esc(s.name)}</div><div class="muted small" style="margin-bottom:12px">${esc(s.email)}</div>${sideExtra || ""}</div>
    <div class="profile-body">${profileBody(s, { resumeHTML })}</div></div></div>`;
}

/* =========================================================
   WIZARD  (onboarding after sign up  +  edit profile)
   ========================================================= */
const WZ = { mode: "onboarding", step: 0, draft: {}, file: null };
const WZ_STEPS = ["Personal & college", "Academics", "Skills & projects", "Achievements", "Resume"];

function wzDraftFrom(u) {
  const d = JSON.parse(JSON.stringify(u));
  if (!d.semesters.length) d.semesters = [{ sem: 1, sgpa: "" }];
  return d;
}

const opt = (list, cur, blank) => `${blank ? `<option value="">${blank}</option>` : ""}${list.map(x => `<option ${x === cur ? "selected" : ""}>${esc(x)}</option>`).join("")}`;
const inp = (label, key, val, extra = "") => `<div class="field"><label>${label}</label><input data-f="${key}" value="${esc(val ?? "")}" ${extra}></div>`;

function wzStepHTML() {
  const d = WZ.draft;
  switch (WZ.step) {
    case 0: return `
      <div class="grid-2">${inp("Full name *", "name", d.name)}${inp("Phone", "phone", d.phone, 'placeholder="+91 98765 43210" inputmode="tel"')}</div>
      <div class="grid-2">${inp("College *", "college", d.college, 'placeholder="e.g. G.H. Raisoni College of Engineering"')}
        <div class="field"><label>Branch *</label><input data-f="branch" list="branchList" value="${esc(d.branch)}" placeholder="e.g. CSE (AIML)">
          <datalist id="branchList">${BRANCHES.map(b => `<option value="${b}">`).join("")}</datalist></div></div>
      <div class="grid-3">
        <div class="field"><label>Current year *</label><select data-f="currentYear">${opt(YEARS, d.currentYear, "Select")}</select></div>
        <div class="field"><label>Graduation year *</label><select data-f="gradYear">${opt(GRAD_YEARS, d.gradYear, "Select")}</select></div>
        <div class="field"><label>Current semester</label><select data-f="semester">${opt(SEM_NAMES, d.semester, "Select")}</select></div></div>
      <div class="grid-2">${inp("Roll number", "rollNumber", d.rollNumber)}${inp("Section", "section", d.section, 'maxlength="3"')}</div>`;
    case 1: return `
      <div class="field"><label>Semester-wise SGPA</label>
        <div class="rows r-sem" data-list="semesters">${d.semesters.map((s, i) => `
          <div class="row"><div class="field"><label>Sem</label><input data-k="sem" type="number" min="1" max="12" value="${esc(s.sem)}"></div>
            <div class="field"><label>SGPA (0 - 10)</label><input data-k="sgpa" type="number" step="0.01" min="0" max="10" value="${esc(s.sgpa)}"></div>
            <button type="button" class="icon-btn" data-action="wz-del-row" data-list="semesters" data-idx="${i}" aria-label="Remove semester">✕</button></div>`).join("")}</div>
        <button type="button" class="btn secondary sm" data-action="wz-add-row" data-list="semesters">+ Add semester</button>
        <div class="hint" id="cgpaHint">Your CGPA is calculated from these automatically.</div></div>
      <div class="grid-3">${inp("Backlogs", "backlogs", d.backlogs ?? 0, 'type="number" min="0" max="50"')}
        ${inp("Attendance (%)", "attendance", d.attendance ?? "", 'type="number" min="0" max="100" step="0.1"')}
        <div class="field"><label>Fee status</label><select data-f="feeStatus">${opt(["Cleared", "Pending"], d.feeStatus)}</select></div></div>
      <div class="field"><label>Backlog subjects (one per line, only if you have backlogs)</label>
        <textarea data-f="retestPapers" data-type="lines" rows="2">${esc((d.retestPapers || []).join("\n"))}</textarea></div>`;
    case 2: return `
      <div class="field"><label>Your skills *</label><div id="skillBox"></div>
        <div style="display:flex;gap:8px;margin-top:10px"><input id="skillInput" data-enter="wz-add-skill" placeholder="Type a skill and press Enter">
          <button type="button" class="btn secondary" data-action="wz-add-skill">Add</button></div>
        <div class="hint" style="margin-top:10px">Popular skills - click to add:</div><div class="suggest" id="skillSuggest"></div></div>
      <div class="field"><label>Projects (one per line)</label>
        <textarea data-f="projects" data-type="lines" rows="3" placeholder="AI Chatbot using Python">${esc((d.projects || []).join("\n"))}</textarea></div>
      <div class="field"><label>Certifications (one per line)</label>
        <textarea data-f="certifications" data-type="lines" rows="3" placeholder="Python for Data Science">${esc((d.certifications || []).join("\n"))}</textarea></div>`;
    case 3: return `
      ${wzRows("Hackathons", "hackathons", "r-hack", d.hackathons, [["name", "Hackathon name", "text"], ["result", "Result", HACK_RESULTS]], { name: "", result: "Participant" })}
      ${wzRows("Awards & achievements", "awards", "r-award", d.awards, [["name", "Award", "text"], ["category", "Category", AWARD_CATS]], { name: "", category: "Other" })}
      ${wzRows("Leadership roles", "leadership", "r-lead", d.leadership, [["role", "Role", "text"], ["org", "Club / team", "text"], ["teamSize", "Team size", "number"]], { role: "", org: "", teamSize: 5 })}
      ${wzRows("Internships", "internships", "r-intern", d.internships, [["company", "Company", "text"], ["role", "Role", "text"], ["months", "Months", "number"]], { company: "", role: "", months: 1 })}`;
    case 4: return `
      <div class="field"><label>Resume (PDF, up to 2 MB) - optional</label>
        <input type="file" id="resumeFile" accept="application/pdf,.pdf" data-change="wz-file">
        <div class="hint" id="resumeHint">${d.hasResume ? `Current file: <b>${esc(d.resumeName)}</b>. Choose a new PDF to replace it.` : "Recruiters can open your resume from your profile."}</div></div>
      <div class="alert info">You can also upload or change your resume later from your Profile page.</div>`;
  }
}

function wzRows(title, list, cls, items, cols, blank) {
  const rows = (items || []).map((it, i) => `<div class="row">${cols.map(([k, label, type]) => `
      <div class="field"><label>${label}</label>${Array.isArray(type)
        ? `<select data-k="${k}">${opt(type, it[k])}</select>`
        : `<input data-k="${k}" type="${type}" ${type === "number" ? 'min="0"' : ""} value="${esc(it[k] ?? "")}">`}</div>`).join("")}
      <button type="button" class="icon-btn" data-action="wz-del-row" data-list="${list}" data-idx="${i}" aria-label="Remove">✕</button></div>`).join("");
  return `<div class="field" style="margin-bottom:22px"><label style="font-size:13px;color:var(--ink)">${title}</label>
    <div class="rows ${cls}" data-list="${list}">${rows}</div>
    <button type="button" class="btn secondary sm" data-action="wz-add-row" data-list="${list}" data-blank='${esc(JSON.stringify(blank))}'>+ Add</button></div>`;
}

function wzRender() {
  const root = $("#wzRoot");
  const onboarding = WZ.mode === "onboarding";
  const last = WZ.step === WZ_STEPS.length - 1;
  root.innerHTML = `
    <div class="view-head"><h2>${onboarding ? `Welcome, ${esc((WZ.draft.name || "").split(" ")[0])}! Let's set up your profile` : "Edit profile"}</h2>
      <p>${onboarding ? "It takes about 3 minutes. Recruiters use this to match you with jobs." : "Change anything and press Save changes."}</p></div>
    <div class="card">
      <div class="stepper">${WZ_STEPS.map((t, i) => `<div class="step ${i < WZ.step ? "done" : ""} ${i === WZ.step ? "current" : ""}"
          ${!onboarding ? `data-action="wz-goto" data-step="${i}" role="button" tabindex="0"` : ""}>${i + 1}. ${t}</div>`).join("")}</div>
      <div id="wzError" class="alert error hidden" role="alert"></div>
      <div id="wzBody">${wzStepHTML()}</div>
      <div class="wizard-actions">
        <div>${WZ.step > 0 ? `<button class="btn ghost" data-action="wz-back">Back</button>` : ""}</div>
        <div style="display:flex;gap:10px">
          ${!onboarding ? `<button class="btn green" data-action="wz-finish">Save changes</button>` : ""}
          ${last ? (onboarding ? `<button class="btn" data-action="wz-finish">Finish registration</button>` : "")
                 : `<button class="btn" data-action="wz-next">Next</button>`}
        </div></div></div>`;
  if (WZ.step === 2) wzRefreshSkills();
  if (WZ.step === 1) wzUpdateCgpa();
}

function wzCollect() {
  const d = WZ.draft;
  $$("#wzBody [data-f]").forEach(el => {
    d[el.dataset.f] = el.dataset.type === "lines" ? el.value.split("\n").map(x => x.trim()).filter(Boolean) : el.value;
  });
  $$("#wzBody .rows").forEach(box => {
    d[box.dataset.list] = $$(".row", box).map(row => Object.fromEntries($$("[data-k]", row).map(i => [i.dataset.k, i.value])));
  });
}

function wzValidate(step) {
  const d = WZ.draft;
  if (step === 0) {
    if (!(d.name || "").trim()) return "Enter your full name.";
    if (!(d.college || "").trim()) return "Enter your college name.";
    if (!(d.branch || "").trim()) return "Enter your branch.";
    if (!d.currentYear) return "Select your current year.";
    if (!d.gradYear) return "Select your graduation year.";
    if (d.phone && !/^[+\d][\d\s-]{8,}$/.test(d.phone.trim())) return "Enter a valid phone number.";
  }
  if (step === 1) {
    for (const s of d.semesters) {
      if (s.sgpa !== "" && (isNaN(s.sgpa) || s.sgpa < 0 || s.sgpa > 10)) return "SGPA must be between 0 and 10.";
    }
    if (d.attendance !== "" && d.attendance != null && (isNaN(d.attendance) || d.attendance < 0 || d.attendance > 100)) return "Attendance must be between 0 and 100.";
    if (d.backlogs === "" || isNaN(d.backlogs) || d.backlogs < 0) return "Backlogs must be 0 or more.";
  }
  if (step === 2 && !(d.skills || []).length) return "Add at least one skill. It is used to match you with jobs.";
  return "";
}
function wzShowError(msg) { const e = $("#wzError"); if (e) { e.textContent = msg; e.classList.toggle("hidden", !msg); if (msg) e.scrollIntoView({ block: "center", behavior: "smooth" }); } }

SH.actions["wz-next"] = () => {
  wzCollect();
  const err = wzValidate(WZ.step);
  if (err) return wzShowError(err);
  WZ.step++; wzRender(); window.scrollTo(0, 0);
};
SH.actions["wz-back"] = () => { wzCollect(); WZ.step--; wzRender(); window.scrollTo(0, 0); };
SH.actions["wz-goto"] = el => { wzCollect(); WZ.step = +el.dataset.step; wzRender(); };
SH.actions["wz-add-row"] = el => {
  wzCollect();
  const list = el.dataset.list;
  const blank = list === "semesters" ? { sem: (WZ.draft.semesters.length + 1), sgpa: "" } : JSON.parse(el.dataset.blank);
  WZ.draft[list].push(blank);
  wzRender();
};
SH.actions["wz-del-row"] = el => {
  wzCollect();
  WZ.draft[el.dataset.list].splice(+el.dataset.idx, 1);
  wzRender();
};

/* skills chip editor */
function wzRefreshSkills() {
  const sk = WZ.draft.skills || [];
  $("#skillBox").innerHTML = sk.length
    ? `<div class="chips" style="margin-top:0">${sk.map((s, i) => `<span class="chip">${esc(s)}<button type="button" data-action="wz-del-skill" data-idx="${i}" aria-label="Remove ${esc(s)}">×</button></span>`).join("")}</div>`
    : `<div class="hint">No skills added yet.</div>`;
  const have = new Set(sk.map(s => s.toLowerCase()));
  $("#skillSuggest").innerHTML = SKILL_SUGGEST.filter(s => !have.has(s.toLowerCase()))
    .map(s => `<button type="button" data-action="wz-toggle-skill" data-skill="${esc(s)}">+ ${esc(s)}</button>`).join("");
}
function wzAddSkill(name) {
  name = (name || "").trim();
  if (!name) return;
  WZ.draft.skills = WZ.draft.skills || [];
  if (!WZ.draft.skills.some(s => s.toLowerCase() === name.toLowerCase())) WZ.draft.skills.push(name);
  wzRefreshSkills();
  wzShowError("");
}
SH.actions["wz-add-skill"] = () => { const i = $("#skillInput"); wzAddSkill(i.value); i.value = ""; i.focus(); };
SH.keys["wz-add-skill"] = SH.actions["wz-add-skill"];
SH.actions["wz-toggle-skill"] = el => wzAddSkill(el.dataset.skill);
SH.actions["wz-del-skill"] = el => { WZ.draft.skills.splice(+el.dataset.idx, 1); wzRefreshSkills(); };

/* live CGPA hint */
function wzUpdateCgpa() {
  const vals = $$('[data-k="sgpa"]').map(i => parseFloat(i.value)).filter(v => !isNaN(v));
  const h = $("#cgpaHint");
  if (h) h.textContent = vals.length ? `Your CGPA so far: ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)}` : "Your CGPA is calculated from these automatically.";
}
document.addEventListener("input", e => { if (e.target.matches && e.target.matches('[data-k="sgpa"]')) wzUpdateCgpa(); });

SH.changes["wz-file"] = el => {
  const f = el.files[0], hint = $("#resumeHint");
  WZ.file = null;
  if (!f) return;
  if (!f.name.toLowerCase().endsWith(".pdf")) { el.value = ""; hint.textContent = "Only PDF files are allowed."; return; }
  if (f.size > 2 * 1024 * 1024) { el.value = ""; hint.textContent = "That file is larger than 2 MB."; return; }
  WZ.file = f;
  hint.innerHTML = `Selected: <b>${esc(f.name)}</b> (${Math.round(f.size / 1024)} KB)`;
};

SH.actions["wz-finish"] = async el => {
  wzCollect();
  for (let s = 0; s <= 2; s++) {
    const err = wzValidate(s);
    if (err) { WZ.step = s; wzRender(); return wzShowError(err); }
  }
  try {
    await busy(el, async () => {
      const d = WZ.draft;
      const payload = { name: d.name, phone: d.phone, college: d.college, branch: d.branch, currentYear: d.currentYear,
        gradYear: d.gradYear, semester: d.semester, section: d.section, rollNumber: d.rollNumber, semesters: d.semesters,
        backlogs: d.backlogs, retestPapers: d.retestPapers, attendance: d.attendance, feeStatus: d.feeStatus,
        skills: d.skills, projects: d.projects, certifications: d.certifications, hackathons: d.hackathons,
        awards: d.awards, leadership: d.leadership, internships: d.internships, finish: true };
      let { user } = await api("/profile", { method: "PUT", json: payload });
      if (WZ.file) {
        const form = new FormData(); form.append("resume", WZ.file);
        ({ user } = await api("/resume", { method: "POST", form }));
      }
      SH.user = user;
    });
    if (WZ.mode === "onboarding") go("/student/success");
    else { toast("Profile saved.", "ok"); go("/student/profile"); }
  } catch (e) { wzShowError(e.message); }
};

/* =========================================================
   ROUTES
   ========================================================= */
function headerOnly(html) {
  $("#app").innerHTML = `<div class="header"><h1>SmartHire</h1>
    <div class="who">${esc(SH.user.name)} · Student &nbsp;·&nbsp; <a data-action="logout" role="button" tabindex="0" style="color:#C7D2FE">Log out</a></div></div>
    <div class="page">${html}</div>`;
}

route("/student/onboarding", "student", async ctx => {
  if (SH.user.onboarded) return go("/student/home");
  WZ.mode = "onboarding"; WZ.step = 0; WZ.file = null; WZ.draft = wzDraftFrom(SH.user);
  headerOnly(`<div id="wzRoot" style="max-width:860px;margin:0 auto"></div>`);
  wzRender();
});

route("/student/edit", "student", async ctx => {
  const { user } = await api("/me");
  SH.user = user;
  WZ.mode = "edit"; WZ.step = 0; WZ.file = null; WZ.draft = wzDraftFrom(user);
  page(ctx, "/student/profile");
  setView(`<div id="wzRoot"></div>`);
  wzRender();
});

route("/student/success", "student", async ctx => {
  const { user } = await api("/me");
  SH.user = user;
  headerOnly(`<div style="max-width:860px;margin:0 auto"><div class="card success">
      <div class="check-circle">✓</div>
      <h2>Registration successful</h2>
      <p class="muted" style="margin:6px 0 18px">Your profile is ready. Here is a summary of what you entered.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn ghost" data-action="go" data-to="/student/edit">Edit details</button>
        <button class="btn" data-action="go" data-to="/student/home">Continue to dashboard</button></div></div>
      ${profileLayout(user, "", "")}</div>`);
});