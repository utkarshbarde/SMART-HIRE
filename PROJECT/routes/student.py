"""Everything a STUDENT can do: profile, jobs, applying, skill match, AI analysis, resume."""

import os
import json
from flask import Blueprint, jsonify, request, g, send_from_directory

import ai
import database as db
import resume_pdf
from .helpers import (body, fail, login_required, clean_str, clean_str_list, to_int, to_float,
                      job_for_student, student_app_statuses, profile_completeness, eligibility_issues)

bp = Blueprint("student", __name__, url_prefix="/api")

UPLOAD_DIR = os.path.join(db.BASE_DIR, "uploads")
HACK_RESULTS = ["Participant", "Shortlisted", "Finalist", "Runner-up", "Winner"]
STATUS_LABEL = {"Applied": "Applied", "UnderReview": "Under Review", "Shortlisted": "Shortlisted",
                "Selected": "Selected", "Rejected": "Rejected"}


def _me():
    return db.student_dict(g.user)


# =========================================================
# PROFILE
# =========================================================
def _clean_objects(items, spec, max_items=15):
    """spec = {key: 'str' | ('int', lo, hi) | ('float', lo, hi) | ('choice', [..])}; first key is required."""
    out = []
    required = next(iter(spec))
    for it in (items or [])[:max_items]:
        if not isinstance(it, dict):
            continue
        row = {}
        for key, kind in spec.items():
            v = it.get(key)
            if kind == "str":
                row[key] = clean_str(v, 100)
            elif kind[0] == "int":
                row[key] = to_int(v, kind[1], kind[2], 0)
            elif kind[0] == "float":
                row[key] = to_float(v, kind[1], kind[2], None)
            elif kind[0] == "choice":
                row[key] = v if v in kind[1] else kind[1][0]
        if row.get(required) in ("", None):
            continue
        out.append(row)
    return out


@bp.put("/profile")
@login_required("student")
def update_profile():
    d = body()
    conn = db.get_db()
    sets, vals = [], []

    def put(col, val):
        sets.append(f"{col}=?")
        vals.append(val)

    if "name" in d:
        name = clean_str(d["name"], 80)
        if len(name) < 2:
            return fail("Please enter your full name.")
        put("name", name)

    text_map = {"phone": "phone", "college": "college", "branch": "branch", "currentYear": "current_year",
                "gradYear": "grad_year", "semester": "semester", "section": "section",
                "rollNumber": "roll_number"}
    for key, col in text_map.items():
        if key in d:
            put(col, clean_str(d[key], 100))
    if "feeStatus" in d:
        put("fee_status", "Cleared" if d["feeStatus"] == "Cleared" else "Pending")
    if "backlogs" in d:
        bl = to_int(d["backlogs"], 0, 50)
        if bl is None:
            return fail("Backlogs must be a number between 0 and 50.")
        put("backlogs", bl)
    if "attendance" in d:
        if d["attendance"] in ("", None):
            put("attendance", None)
        else:
            att = to_float(d["attendance"], 0, 100)
            if att is None:
                return fail("Attendance must be between 0 and 100.")
            put("attendance", att)

    for key, col in {"skills": "skills", "projects": "projects", "certifications": "certifications",
                     "retestPapers": "retest_papers"}.items():
        if key in d:
            put(col, json.dumps(clean_str_list(d[key])))

    if "semesters" in d:
        sems = _clean_objects(d["semesters"], {"sem": ("int", 1, 12), "sgpa": ("float", 0, 10)}, 12)
        sems = [s for s in sems if s["sgpa"] is not None]
        put("semesters", json.dumps(sems))
    if "hackathons" in d:
        put("hackathons", json.dumps(_clean_objects(d["hackathons"],
                                                    {"name": "str", "result": ("choice", HACK_RESULTS)})))
    if "awards" in d:
        put("awards", json.dumps(_clean_objects(d["awards"], {"name": "str", "category": "str"})))
    if "leadership" in d:
        put("leadership", json.dumps(_clean_objects(d["leadership"],
                                                    {"role": "str", "org": "str", "teamSize": ("int", 0, 10000)})))
    if "internships" in d:
        put("internships", json.dumps(_clean_objects(d["internships"],
                                                     {"company": "str", "role": "str", "months": ("int", 0, 36)})))
    if d.get("finish"):
        put("onboarded", 1)

    if sets:
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", vals + [g.user["id"]])
        conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id=?", (g.user["id"],)).fetchone()
    return jsonify({"user": db.student_dict(row)})


# =========================================================
# RESUME (PDF only, max 2 MB)
# =========================================================
@bp.post("/resume")
@login_required("student")
def upload_resume():
    f = request.files.get("resume")
    if f is None or not f.filename:
        return fail("Choose a PDF file first.")
    if not f.filename.lower().endswith(".pdf"):
        return fail("Only PDF resumes are allowed.")
    data = f.read()
    if len(data) > 2 * 1024 * 1024:
        return fail("Resume is too large. Maximum size is 2 MB.")
    if not data.startswith(b"%PDF"):
        return fail("This file does not look like a real PDF.")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    conn = db.get_db()
    old = g.user["resume_file"]
    filename = f"resume_{g.user['id']}_{int(__import__('time').time())}.pdf"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as out:
        out.write(data)
    conn.execute("UPDATE users SET resume_file=?, resume_name=? WHERE id=?",
                 (filename, clean_str(f.filename, 100), g.user["id"]))
    conn.commit()
    if old and os.path.exists(os.path.join(UPLOAD_DIR, old)):
        os.remove(os.path.join(UPLOAD_DIR, old))
    row = conn.execute("SELECT * FROM users WHERE id=?", (g.user["id"],)).fetchone()
    return jsonify({"user": db.student_dict(row)})


@bp.delete("/resume")
@login_required("student")
def delete_resume():
    conn = db.get_db()
    if g.user["resume_file"]:
        path = os.path.join(UPLOAD_DIR, g.user["resume_file"])
        if os.path.exists(path):
            os.remove(path)
    conn.execute("UPDATE users SET resume_file=NULL, resume_name=NULL WHERE id=?", (g.user["id"],))
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id=?", (g.user["id"],)).fetchone()
    return jsonify({"user": db.student_dict(row)})


@bp.get("/resume/<int:student_id>")
@login_required()
def get_resume(student_id):
    """A student can open their own resume; recruiters can open any student's."""
    if g.user["role"] == "student" and g.user["id"] != student_id:
        return fail("You do not have access to this file.", 403)
    row = db.get_db().execute("SELECT resume_file FROM users WHERE id=? AND role='student'",
                              (student_id,)).fetchone()
    if row is None or not row["resume_file"]:
        return fail("No resume uploaded.", 404)
    return send_from_directory(UPLOAD_DIR, row["resume_file"], mimetype="application/pdf")


@bp.get("/resume/<int:student_id>/generate")
@login_required()
def generate_resume(student_id):
    """
    Builds a one-page PDF resume straight from the profile - no upload
    needed. A student can generate their own; a recruiter can generate
    any student's (handy when the student never uploaded a file).
    """
    if g.user["role"] == "student" and g.user["id"] != student_id:
        return fail("You do not have access to this.", 403)
    row = db.get_db().execute("SELECT * FROM users WHERE id=? AND role='student'", (student_id,)).fetchone()
    if row is None:
        return fail("Student not found.", 404)
    s = db.student_dict(row)
    pdf_bytes = resume_pdf.build_resume_pdf(s)
    from flask import Response
    fname = (s["name"] or "resume").replace(" ", "_") + "_SmartHire_Resume.pdf"
    return Response(pdf_bytes, mimetype="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{fname}"'})


# =========================================================
# JOBS (browse, save, apply)
# =========================================================
@bp.get("/jobs")
@login_required("student")
def list_jobs():
    conn = db.get_db()
    s = _me()
    statuses = student_app_statuses(conn, s["id"])
    rows = conn.execute("SELECT * FROM jobs ORDER BY id DESC").fetchall()
    jobs = [job_for_student(r, s, statuses.get(r["id"])) for r in rows]

    q = clean_str(request.args.get("q"), 60).lower()
    mode = request.args.get("mode")
    jtype = request.args.get("type")
    if q:
        jobs = [j for j in jobs if q in (j["title"] + " " + j["company"] + " " + j["location"] + " "
                                         + " ".join(j["skills"])).lower()]
    if mode:
        jobs = [j for j in jobs if j["mode"] == mode]
    if jtype:
        jobs = [j for j in jobs if j["jobType"] == jtype]
    if request.args.get("saved") == "1":
        jobs = [j for j in jobs if j["saved"]]
    if request.args.get("hideClosed") == "1":
        jobs = [j for j in jobs if not j["closed"]]

    sort = request.args.get("sort", "match")
    if sort == "match":
        jobs.sort(key=lambda j: (j["closed"], -j["match"]["pct"]))
    elif sort == "deadline":
        jobs.sort(key=lambda j: (j["closed"], j["deadline"] or "9999"))
    return jsonify({"jobs": jobs})


@bp.get("/jobs/<int:job_id>")
@login_required("student")
def get_job(job_id):
    conn = db.get_db()
    row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if row is None:
        return fail("Job not found.", 404)
    s = _me()
    return jsonify({"job": job_for_student(row, s, student_app_statuses(conn, s["id"]).get(job_id))})


@bp.post("/jobs/<int:job_id>/save")
@login_required("student")
def toggle_save(job_id):
    conn = db.get_db()
    if conn.execute("SELECT 1 FROM jobs WHERE id=?", (job_id,)).fetchone() is None:
        return fail("Job not found.", 404)
    saved = _me()["savedJobs"]
    if job_id in saved:
        saved.remove(job_id)
    else:
        saved.append(job_id)
    conn.execute("UPDATE users SET saved_jobs=? WHERE id=?", (json.dumps(saved), g.user["id"]))
    conn.commit()
    return jsonify({"saved": job_id in saved})


@bp.post("/jobs/<int:job_id>/apply")
@login_required("student")
def apply(job_id):
    conn = db.get_db()
    s = _me()
    row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if row is None:
        return fail("Job not found.", 404)
    job = db.job_dict(row)
    if not s["onboarded"]:
        return fail("Complete your profile before applying.", 403)
    if job["closed"]:
        return fail("Applications for this job are closed.", 400)
    issues = eligibility_issues(job, s)
    if issues:
        return fail("You are not eligible: " + "; ".join(issues) + ".", 403)
    if conn.execute("SELECT 1 FROM applications WHERE student_id=? AND job_id=?", (s["id"], job_id)).fetchone():
        return fail("You have already applied to this job.", 409)
    now = db.now_iso()
    conn.execute("INSERT INTO applications (student_id, job_id, status, source, applied_at, updated_at) "
                 "VALUES (?,?, 'Applied', 'applied', ?, ?)", (s["id"], job_id, now, now))
    conn.commit()
    return jsonify({"ok": True, "status": "Applied"}), 201


# =========================================================
# MY APPLICATIONS
# =========================================================
@bp.get("/applications")
@login_required("student")
def my_applications():
    rows = db.get_db().execute("""
        SELECT a.*, j.title, j.company, j.location, j.mode, j.status AS job_status
        FROM applications a JOIN jobs j ON j.id = a.job_id
        WHERE a.student_id=? ORDER BY a.applied_at DESC""", (g.user["id"],)).fetchall()
    return jsonify({"applications": [{
        "id": r["id"], "jobId": r["job_id"], "status": r["status"], "statusLabel": STATUS_LABEL[r["status"]],
        "source": r["source"], "appliedAt": r["applied_at"], "updatedAt": r["updated_at"],
        "title": r["title"], "company": r["company"], "location": r["location"], "mode": r["mode"],
    } for r in rows]})


@bp.delete("/applications/<int:app_id>")
@login_required("student")
def withdraw(app_id):
    conn = db.get_db()
    row = conn.execute("SELECT * FROM applications WHERE id=? AND student_id=?",
                       (app_id, g.user["id"])).fetchone()
    if row is None:
        return fail("Application not found.", 404)
    if row["status"] in ("Selected", "Rejected"):
        return fail("This application is already finished and cannot be withdrawn.", 400)
    conn.execute("DELETE FROM applications WHERE id=?", (app_id,))
    conn.commit()
    return jsonify({"ok": True})


# =========================================================
# DASHBOARD / SKILL MATCH / AI ANALYSIS
# =========================================================
def _open_jobs_ranked(conn, s):
    statuses = student_app_statuses(conn, s["id"])
    rows = conn.execute("SELECT * FROM jobs ORDER BY id DESC").fetchall()
    jobs = [job_for_student(r, s, statuses.get(r["id"])) for r in rows]
    jobs = [j for j in jobs if not j["closed"]]
    jobs.sort(key=lambda j: -j["match"]["pct"])
    return jobs


@bp.get("/student/dashboard")
@login_required("student")
def dashboard():
    conn = db.get_db()
    s = _me()
    jobs = _open_jobs_ranked(conn, s)
    apps = conn.execute("SELECT COUNT(*) FROM applications WHERE student_id=?", (s["id"],)).fetchone()[0]
    recommended = jobs[:3]
    return jsonify({
        "user": s,
        "profileComplete": profile_completeness(s),
        "recommendedCount": len(recommended),
        "applicationCount": apps,
        "journey": {"cgpa": ai.cgpa_of(s), "skills": len(s["skills"]), "hackathons": len(s["hackathons"]),
                    "awards": len(s["awards"]), "leadership": len(s["leadership"]),
                    "internships": len(s["internships"]), "experienceMonths": ai.intern_months(s)},
        "recommended": recommended,
    })


@bp.get("/skill-match")
@login_required("student")
def skill_match():
    conn = db.get_db()
    s = _me()
    jobs = _open_jobs_ranked(conn, s)
    if not jobs:
        return jsonify({"jobs": [], "selected": None})
    wanted = to_int(request.args.get("jobId"))
    chosen = next((j for j in jobs if j["id"] == wanted), jobs[0])
    m = chosen["match"]
    return jsonify({
        "jobs": [{"id": j["id"], "title": j["title"], "company": j["company"], "location": j["location"],
                  "pct": j["match"]["pct"], "label": ai.match_label(j["match"]["pct"]),
                  "applied": j["applied"]} for j in jobs],
        "selected": {"id": chosen["id"], "title": chosen["title"], "company": chosen["company"],
                     "pct": m["pct"], "label": ai.match_label(m["pct"]),
                     "matched": m["matched"], "missing": m["missing"],
                     "applied": chosen["applied"]},
    })


@bp.get("/career-analysis")
@login_required("student")
def career_analysis():
    conn = db.get_db()
    s = _me()
    jobs = _open_jobs_ranked(conn, s)
    best = jobs[0]["title"] if jobs else None
    analysis = ai.career_analysis(s, best)
    (score, label), = ai.predict_readiness([s])
    analysis.update({"readiness": {"score": score, "label": label}, "features": ai.features_of(s)})
    return jsonify(analysis)


@bp.get("/career-analysis/explain")
@login_required("student")
def explain_readiness():
    """'Why this score?' - which profile numbers pushed the AI score up or down."""
    return jsonify(ai.explain_readiness(_me()))


# =========================================================
# NOTIFICATIONS (student + recruiter)
# =========================================================
@bp.get("/notifications")
@login_required()
def notifications():
    conn = db.get_db()
    items = []
    if g.user["role"] == "student":
        rows = conn.execute("""SELECT a.status, a.source, a.updated_at, j.title, j.company
                               FROM applications a JOIN jobs j ON j.id=a.job_id
                               WHERE a.student_id=? AND a.status != 'Applied'
                               ORDER BY a.updated_at DESC LIMIT 8""", (g.user["id"],)).fetchall()
        for r in rows:
            head = {"Shortlisted": "You were shortlisted", "Selected": "You were selected",
                    "Rejected": "Application not selected", "UnderReview": "Application under review"}[r["status"]]
            items.append({"title": head, "sub": f"{r['title']} at {r['company']}", "time": r["updated_at"]})
    else:
        rows = conn.execute("""SELECT a.applied_at, u.name, j.title
                               FROM applications a JOIN jobs j ON j.id=a.job_id JOIN users u ON u.id=a.student_id
                               WHERE j.recruiter_id=? AND a.status='Applied' AND a.source='applied'
                               ORDER BY a.applied_at DESC LIMIT 8""", (g.user["id"],)).fetchall()
        for r in rows:
            items.append({"title": "New application", "sub": f"{r['name']} applied for {r['title']}",
                          "time": r["applied_at"]})
    return jsonify({"notifications": items})