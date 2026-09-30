/* auth.js - login and sign up screen. */
"use strict";

const AUTH = { tab: "login", role: "student" };

const AUTH_COPY = {
  student: { title: "Find the job that fits your skills", text: "Build your profile once. SmartHire shows how well you match every opening and what to learn next.",
             points: ["See your skill match for each job", "Get an AI career-readiness score", "Track every application in one place"] },
  recruiter: { title: "Shortlist the best students, faster", text: "Post a job and let SmartHire rank every student in the college by skill match and AI readiness.",
               points: ["Rank thousands of students in seconds", "Shortlist many candidates in one click", "Review profiles, resumes and applicants"] },
};

function renderAuth() {
  const a = AUTH, copy = AUTH_COPY[a.role], isLogin = a.tab === "login";
  const demo = a.role === "student" ? ["student1@gmail.com", "pass123"] : ["hr@technova.com", "pass123"];
  plainPage(`
    <div class="auth">
      <div class="auth-left">
        <div class="logo">SmartHire</div>
        <p class="tag">Campus placements, matched by skills and AI.</p>
        <div class="tabs">
          <div data-action="auth-tab" data-tab="login" class="${isLogin ? "active" : ""}" role="button" tabindex="0">Login</div>
          <div data-action="auth-tab" data-tab="signup" class="${!isLogin ? "active" : ""}" role="button" tabindex="0">Sign up</div>
        </div>
        <div class="role-toggle">
          <div data-action="auth-role" data-role="student" class="${a.role === "student" ? "active" : ""}" role="button" tabindex="0">🎓 Student</div>
          <div data-action="auth-role" data-role="recruiter" class="${a.role === "recruiter" ? "active" : ""}" role="button" tabindex="0">🏢 Recruiter</div>
        </div>
        ${isLogin ? `<div class="demo-box">Demo ${a.role}: <b>${demo[0]}</b> / <b>${demo[1]}</b>
            &nbsp;<a data-action="fill-demo" data-email="${demo[0]}" data-pass="${demo[1]}" role="button" tabindex="0">Fill it in</a></div>` : ""}
        <div id="authError" class="alert error hidden" role="alert"></div>
        ${isLogin ? `
        <form data-form="login" novalidate>
          <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" placeholder="you@example.com"></div>
          ${pwdField("password", "Password")}
          <button class="btn full" type="submit">Log in</button>
        </form>` : `
        <form data-form="signup" novalidate>
          <div class="field"><label for="name">${a.role === "recruiter" ? "Company name" : "Full name"}</label>
            <input id="name" type="text" autocomplete="${a.role === "recruiter" ? "organization" : "name"}" placeholder="${a.role === "recruiter" ? "e.g. TechNova Solutions" : "e.g. Utkarsh Barde"}"></div>
          <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" placeholder="you@example.com"></div>
          ${pwdField("password", "Password", "At least 6 characters, letters and numbers")}
          ${pwdField("password2", "Confirm password")}
          <button class="btn full" type="submit">Create ${a.role} account</button>
        </form>`}
      </div>
      <div class="auth-right"><h2>${copy.title}</h2><p>${copy.text}</p>
        <ul>${copy.points.map(p => `<li>${p}</li>`).join("")}</ul></div>
    </div>`);
}

function authError(msg) {
  const box = $("#authError");
  if (!box) return;
  box.textContent = msg;
  box.classList.toggle("hidden", !msg);
}

SH.actions["auth-tab"] = el => { AUTH.tab = el.dataset.tab; renderAuth(); };
SH.actions["auth-role"] = el => { AUTH.role = el.dataset.role; renderAuth(); };
SH.actions["fill-demo"] = el => { $("#email").value = el.dataset.email; $("#password").value = el.dataset.pass; };

SH.forms.login = async form => {
  const email = $("#email").value.trim(), password = $("#password").value;
  if (!email || !password) return authError("Enter your email and password.");
  const btn = $("button[type=submit]", form);
  try {
    const { user } = await busy(btn, () => api("/login", { method: "POST", json: { email, password, role: AUTH.role } }));
    SH.user = user;
    go(homeFor(user));
  } catch (e) { authError(e.message); }
};

SH.forms.signup = async form => {
  const name = $("#name").value.trim(), email = $("#email").value.trim();
  const password = $("#password").value, password2 = $("#password2").value;
  if (!name || !email || !password) return authError("Fill in all the fields.");
  if (password !== password2) return authError("The two passwords do not match.");
  const btn = $("button[type=submit]", form);
  try {
    const { user } = await busy(btn, () => api("/signup", { method: "POST", json: { role: AUTH.role, name, email, password } }));
    SH.user = user;
    toast("Account created. Welcome to SmartHire!", "ok");
    go(homeFor(user));
  } catch (e) { authError(e.message); }
};

route("/login", "public", async () => { renderAuth(); });