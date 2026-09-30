"""Everything a RECRUITER can do: post jobs, see applicants, rank students, Smart Shortlist."""

import json
import math
from datetime import date
from flask import Blueprint, jsonify, request, g

import ai
import database as db
from .helpers import (body, fail, login_required, clean_str, clean_text, clean_str_list, to_int, to_float,
                      eligibility_issues)

bp = Blueprint("recruiter", __name__, url_prefix="/api")

# Smart Shortlist score = 60% skill match + 40% AI readiness (change here to tune)
SKILL_WEIGHT = 0.6
READINESS_WEIGHT = 0.4
STATUSES = ["Applied", "UnderReview", "Shortlisted", "Selected", "Rejected"]
STATUS_LABEL = {"Applied": "Applied", "UnderReview": "Under Review", "Shortlisted": "Shortlisted",
                "Selected": "Selected", "Rejected": "Rejected"}
MODES = ["On-site", "Remote", "Hybrid"]
JOB_TYPES = ["Internship", "Full-time"]

STUDENT_COLS = ("id, name, email, college, branch, current_year, backlogs, attendance, skills, projects, "
                "semesters, hackathons, awards, leadership, internships, resume_file")


# =========================================================
# JOBS
# =========================================================
def _own_job(conn, job_id):
    return conn.execute("SELECT * FROM jobs WHERE id=? AND recruiter_id=?", (job_id, g.user["id"])).fetchone()


def _read_job_form(d, creating):
    title = clean_str(d.get("title"), 80)
    if len(title) < 3:
        return None, "Job title must be at least 3 characters."
    mode = d.get("mode") if d.get("mode") in MODES else "On-site"
    jtype = d.get("jobType") if d.get("jobType") in JOB_TYPES else "Internship"
    skills = clean_str_list(d.get("skills"), 20, 40)
    if not skills:
        return None, "Add at least one required skill (comma separated)."
    description = clean_text(d.get("description"), 3000)
    if len(description) < 15:
        return None, "Write a short job description (at least 15 characters)."
    deadline = clean_str(d.get("deadline"), 10)
    try:
        dl = date.fromisoformat(deadline)
    except ValueError:
        return None, "Choose a valid last date to apply."
    if creating and dl < date.today():
        return None, "The last date to apply cannot be in the past."
    min_cgpa = to_float(d.get("minCgpa"), 0, 10, 0)
    max_bl = None if d.get("maxBacklogs") in ("", None) else to_int(d.get("maxBacklogs"), 0, 20)
    if d.get("maxBacklogs") not in ("", None) and max_bl is None:
        return None, "Maximum backlogs must be a number from 0 to 20."
    return {
        "title": title, "location": clean_str(d.get("location"), 60), "mode": mode, "job_type": jtype,
        "duration": clean_str(d.get("duration"), 40), "stipend": clean_str(d.get("stipend"), 40),
        "deadline": deadline, "openings": to_int(d.get("openings"), 1, 500, 1), "min_cgpa": min_cgpa,
        "max_backlogs": max_bl, "description": description, "skills": json.dumps(skills),
        "eligibility": json.dumps(clean_str_list(d.get("eligibility"), 10, 120)),
    }, None


@bp.post("/jobs")
@login_required("recruiter")
def create_job():
    f, err = _read_job_form(body(), creating=True)
    if err:
        return fail(err)
    conn = db.get_db()
    cur = conn.execute("""INSERT INTO jobs (recruiter_id, title, company, location, mode, job_type, duration,
        stipend, deadline, posted_on, openings, min_cgpa, max_backlogs, description, skills, eligibility,
        status, verified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'Open', 1)""",
                       (g.user["id"], f["title"], g.user["name"], f["location"], f["mode"], f["job_type"],
                        f["duration"], f["stipend"], f["deadline"], date.today().isoformat(), f["openings"],
                        f["min_cgpa"], f["max_backlogs"], f["description"], f["skills"], f["eligibility"]))
    conn.commit()
    row = conn.execute("SELECT * FROM jobs WHERE id=?", (cur.lastrowid,)).fetchone()
    return jsonify({"job": db.job_dict(row)}), 201


@bp.put("/jobs/<int:job_id>")
@login_required("recruiter")
def update_job(job_id):
    conn = db.get_db()
    if _own_job(conn, job_id) is None:
        return fail("Job not found.", 404)
    f, err = _read_job_form(body(), creating=False)
    if err:
        return fail(err)
    conn.execute("""UPDATE jobs SET title=?, location=?, mode=?, job_type=?, duration=?, stipend=?, deadline=?,
        openings=?, min_cgpa=?, max_backlogs=?, description=?, skills=?, eligibility=? WHERE id=?""",
                 (f["title"], f["location"], f["mode"], f["job_type"], f["duration"], f["stipend"],
                  f["deadline"], f["openings"], f["min_cgpa"], f["max_backlogs"], f["description"],
                  f["skills"], f["eligibility"], job_id))
    conn.commit()
    return jsonify({"job": db.job_dict(conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())})


@bp.post("/jobs/<int:job_id>/toggle")
@login_required("recruiter")
def toggle_job(job_id):
    conn = db.get_db()
    row = _own_job(conn, job_id)
    if row is None:
        return fail("Job not found.", 404)
    new = "Closed" if row["status"] == "Open" else "Open"
    conn.execute("UPDATE jobs SET status=? WHERE id=?", (new, job_id))
    conn.commit()
    return jsonify({"status": new})


@bp.delete("/jobs/<int:job_id>")
@login_required("recruiter")
def delete_job(job_id):
    conn = db.get_db()
    if _own_job(conn, job_id) is None:
        return fail("Job not found.", 404)
    conn.execute("DELETE FROM applications WHERE job_id=?", (job_id,))
    conn.execute("DELETE FROM jobs WHERE id=?", (job_id,))
    conn.commit()
    return jsonify({"ok": True})


@bp.get("/recruiter/jobs")
@login_required("recruiter")
def my_jobs():
    rows = db.get_db().execute("""
        SELECT j.*, COUNT(a.id) AS applicants,
               COALESCE(SUM(a.status='Shortlisted'),0) AS shortlisted,
               COALESCE(SUM(a.status='Selected'),0) AS selected
        FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
        WHERE j.recruiter_id=? GROUP BY j.id ORDER BY j.id DESC""", (g.user["id"],)).fetchall()
    jobs = []
    for r in rows:
        j = db.job_dict(r)
        j.update({"applicants": r["applicants"], "shortlisted": r["shortlisted"], "selected": r["selected"]})
        jobs.append(j)
    return jsonify({"jobs": jobs})


@bp.get("/recruiter/jobs/<int:job_id>")
@login_required("recruiter")
def my_job(job_id):
    row = _own_job(db.get_db(), job_id)
    if row is None:
        return fail("Job not found.", 404)
    return jsonify({"job": db.job_dict(row)})


# =========================================================
# APPLICANTS
# =========================================================
def _load_students(conn, ids=None):
    if ids is not None:
        marks = ",".join("?" for _ in ids)
        rows = conn.execute(f"SELECT {STUDENT_COLS} FROM users WHERE role='student' AND status='Active' "
                            f"AND id IN ({marks})", list(ids)).fetchall()
    else:
        rows = conn.execute(f"SELECT {STUDENT_COLS} FROM users WHERE role='student' AND status='Active' "
                            f"AND onboarded=1").fetchall()
    return [db.light_student(r) for r in rows]


def _summary(s, readiness, job=None):
    score, label = readiness
    item = {"id": s["id"], "name": s["name"], "email": s["email"], "college": s["college"],
            "branch": s["branch"], "currentYear": s["currentYear"], "cgpa": ai.cgpa_of(s),
            "backlogs": s["backlogs"], "attendance": s["attendance"], "readiness": score, "label": label,
            "topSkills": s["skills"][:4], "hasResume": s["hasResume"]}
    if job is not None:
        m = ai.skill_match(s["skills"], job["skills"])
        item.update({"matchPct": m["pct"], "matched": m["matched"], "missing": m["missing"],
                     "combined": round(SKILL_WEIGHT * m["pct"] + READINESS_WEIGHT * score, 1),
                     "eligibilityIssues": eligibility_issues(job, s)})
        item["eligible"] = not item["eligibilityIssues"]
    return item


@bp.get("/jobs/<int:job_id>/applicants")
@login_required("recruiter")
def applicants(job_id):
    conn = db.get_db()
    row = _own_job(conn, job_id)
    if row is None:
        return fail("Job not found.", 404)
    job = db.job_dict(row)
    apps = conn.execute("SELECT * FROM applications WHERE job_id=? ORDER BY applied_at DESC", (job_id,)).fetchall()
    students = {s["id"]: s for s in _load_students(conn, [a["student_id"] for a in apps])} if apps else {}
    ordered = [students[a["student_id"]] for a in apps if a["student_id"] in students]
    ready = dict(zip([s["id"] for s in ordered], ai.predict_readiness(ordered)))
    items = []
    for a in apps:
        s = students.get(a["student_id"])
        if s is None:
            continue
        item = _summary(s, ready[s["id"]], job)
        item.update({"applicationId": a["id"], "status": a["status"], "statusLabel": STATUS_LABEL[a["status"]],
                     "source": a["source"], "appliedAt": a["applied_at"]})
        items.append(item)
    items.sort(key=lambda i: -i["combined"])
    return jsonify({"job": job, "applicants": items})


@bp.patch("/applications/<int:app_id>/status")
@login_required("recruiter")
def set_status(app_id):
    status = body().get("status")
    if status not in STATUSES:
        return fail("Unknown status.")
    conn = db.get_db()
    row = conn.execute("""SELECT a.id FROM applications a JOIN jobs j ON j.id=a.job_id
                          WHERE a.id=? AND j.recruiter_id=?""", (app_id, g.user["id"])).fetchone()
    if row is None:
        return fail("Application not found.", 404)
    conn.execute("UPDATE applications SET status=?, updated_at=? WHERE id=?", (status, db.now_iso(), app_id))
    conn.commit()
    return jsonify({"status": status, "statusLabel": STATUS_LABEL[status]})


# =========================================================
# DASHBOARD
# =========================================================
@bp.get("/recruiter/dashboard")
@login_required("recruiter")
def dashboard():
    conn = db.get_db()
    uid = g.user["id"]
    one = lambda sql, *a: conn.execute(sql, a).fetchone()[0]
    stats = {
        "activeJobs": one("SELECT COUNT(*) FROM jobs WHERE recruiter_id=? AND status='Open'", uid),
        "totalJobs": one("SELECT COUNT(*) FROM jobs WHERE recruiter_id=?", uid),
        "applicants": one("""SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id=a.job_id
                             WHERE j.recruiter_id=?""", uid),
        "shortlisted": one("""SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id=a.job_id
                              WHERE j.recruiter_id=? AND a.status='Shortlisted'""", uid),
        "selected": one("""SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id=a.job_id
                           WHERE j.recruiter_id=? AND a.status='Selected'""", uid),
        "students": one("SELECT COUNT(*) FROM users WHERE role='student' AND status='Active' AND onboarded=1"),
    }
    recent = conn.execute("""SELECT a.id, a.status, a.applied_at, a.source, u.id AS sid, u.name, u.branch, j.title, j.id AS jid
                             FROM applications a JOIN jobs j ON j.id=a.job_id JOIN users u ON u.id=a.student_id
                             WHERE j.recruiter_id=? ORDER BY a.applied_at DESC LIMIT 6""", (uid,)).fetchall()
    return jsonify({
        "stats": stats,
        "profileIncomplete": not (g.user["industry"] and g.user["location"] and g.user["about"]),
        "recent": [{"applicationId": r["id"], "status": r["status"], "statusLabel": STATUS_LABEL[r["status"]],
                    "appliedAt": r["applied_at"], "studentId": r["sid"], "name": r["name"], "branch": r["branch"],
                    "jobTitle": r["title"], "jobId": r["jid"], "source": r["source"]} for r in recent],
    })


# =========================================================
# ANALYTICS  (charts for the recruiter dashboard)
# =========================================================
@bp.get("/recruiter/analytics")
@login_required("recruiter")
def analytics():
    conn = db.get_db()
    uid = g.user["id"]

    branch_rows = conn.execute("""
        SELECT u.branch AS branch, COUNT(*) AS n
        FROM applications a JOIN jobs j ON j.id=a.job_id JOIN users u ON u.id=a.student_id
        WHERE j.recruiter_id=? AND u.branch != '' GROUP BY u.branch ORDER BY n DESC""", (uid,)).fetchall()
    branch_dist = [{"branch": r["branch"], "count": r["n"]} for r in branch_rows]

    status_rows = conn.execute("""
        SELECT a.status AS status, COUNT(*) AS n
        FROM applications a JOIN jobs j ON j.id=a.job_id
        WHERE j.recruiter_id=? GROUP BY a.status""", (uid,)).fetchall()
    have = {r["status"]: r["n"] for r in status_rows}
    status_breakdown = [{"status": s, "label": STATUS_LABEL[s], "count": have.get(s, 0)} for s in STATUSES]

    from datetime import date, timedelta
    days = [(date.today() - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    trend_rows = conn.execute("""
        SELECT substr(a.applied_at,1,10) AS d, COUNT(*) AS n
        FROM applications a JOIN jobs j ON j.id=a.job_id
        WHERE j.recruiter_id=? AND substr(a.applied_at,1,10) >= ?
        GROUP BY d""", (uid, days[0])).fetchall()
    by_day = {r["d"]: r["n"] for r in trend_rows}
    trend = [{"date": d, "count": by_day.get(d, 0)} for d in days]

    job_rows = conn.execute("""
        SELECT j.title AS title, COUNT(a.id) AS n
        FROM jobs j LEFT JOIN applications a ON a.job_id=j.id
        WHERE j.recruiter_id=? GROUP BY j.id ORDER BY n DESC LIMIT 6""", (uid,)).fetchall()
    top_jobs = [{"title": r["title"], "count": r["n"]} for r in job_rows]

    skill_rows = conn.execute("SELECT skills FROM jobs WHERE recruiter_id=?", (uid,)).fetchall()
    skill_counts = {}
    for r in skill_rows:
        for sk in json.loads(r["skills"] or "[]"):
            skill_counts[sk] = skill_counts.get(sk, 0) + 1
    top_skills = sorted(skill_counts.items(), key=lambda x: -x[1])[:8]

    total_apps = sum(s["count"] for s in status_breakdown)
    shortlisted_or_better = sum(s["count"] for s in status_breakdown if s["status"] in ("Shortlisted", "Selected"))
    shortlist_rate = round(shortlisted_or_better / total_apps * 100, 1) if total_apps else 0

    return jsonify({
        "branchDistribution": branch_dist, "statusBreakdown": status_breakdown, "trend": trend,
        "topJobs": top_jobs, "topSkills": [{"skill": s, "count": c} for s, c in top_skills],
        "shortlistRate": shortlist_rate, "totalApplications": total_apps,
    })


# =========================================================
# STUDENT RANKINGS + PROFILE VIEW
# =========================================================
def _paginate(items, sort_key, reverse=True):
    items.sort(key=sort_key, reverse=reverse)
    per_page = to_int(request.args.get("perPage"), 5, 100, 25)
    total = len(items)
    pages = max(1, math.ceil(total / per_page))
    page = min(max(to_int(request.args.get("page"), 1, default=1), 1), pages)
    start = (page - 1) * per_page
    chunk = items[start:start + per_page]
    for i, it in enumerate(chunk):
        it["rank"] = start + i + 1
    return chunk, {"total": total, "page": page, "pages": pages, "perPage": per_page}


def _common_filters(items):
    q = clean_str(request.args.get("q"), 60).lower()
    branch = request.args.get("branch")
    if q:
        items = [i for i in items if q in i["name"].lower() or q in i["email"].lower()]
    if branch:
        items = [i for i in items if i["branch"] == branch]
    return items


@bp.get("/students")
@login_required("recruiter")
def student_rankings():
    conn = db.get_db()
    students = _load_students(conn)
    branches = sorted({s["branch"] for s in students if s["branch"]})
    items = [_summary(s, r) for s, r in zip(students, ai.predict_readiness(students))]
    items = _common_filters(items)
    min_ready = to_float(request.args.get("minReadiness"), 0, 100, 0)
    items = [i for i in items if i["readiness"] >= min_ready]
    sort = request.args.get("sort", "readiness")
    key = {"cgpa": lambda i: i["cgpa"], "name": lambda i: i["name"].lower()}.get(sort, lambda i: i["readiness"])
    chunk, meta = _paginate(items, key, reverse=(sort != "name"))
    return jsonify({"students": chunk, "branches": branches, **meta})


@bp.get("/students/<int:student_id>")
@login_required("recruiter")
def student_detail(student_id):
    conn = db.get_db()
    row = conn.execute("SELECT * FROM users WHERE id=? AND role='student'", (student_id,)).fetchone()
    if row is None:
        return fail("Student not found.", 404)
    s = db.student_dict(row)
    analysis = ai.career_analysis(s)
    (score, label), = ai.predict_readiness([s])
    analysis.update({"readiness": {"score": score, "label": label}})
    apps = conn.execute("""SELECT a.status, j.id, j.title FROM applications a JOIN jobs j ON j.id=a.job_id
                           WHERE a.student_id=? AND j.recruiter_id=?""", (student_id, g.user["id"])).fetchall()
    return jsonify({"student": s, "analysis": analysis,
                    "cgpa": ai.cgpa_of(s),
                    "applications": [{"jobId": a["id"], "title": a["title"], "status": a["status"],
                                      "statusLabel": STATUS_LABEL[a["status"]]} for a in apps]})


@bp.get("/students/<int:student_id>/explain")
@login_required("recruiter")
def explain_student_readiness(student_id):
    row = db.get_db().execute("SELECT * FROM users WHERE id=? AND role='student'", (student_id,)).fetchone()
    if row is None:
        return fail("Student not found.", 404)
    return jsonify(ai.explain_readiness(db.student_dict(row)))


# =========================================================
# SMART SHORTLIST  (rank ALL students for one job)
# =========================================================
@bp.get("/jobs/<int:job_id>/shortlist")
@login_required("recruiter")
def smart_shortlist(job_id):
    conn = db.get_db()
    row = _own_job(conn, job_id)
    if row is None:
        return fail("Job not found.", 404)
    job = db.job_dict(row)

    students = _load_students(conn)
    branches = sorted({s["branch"] for s in students if s["branch"]})
    items = [_summary(s, r, job) for s, r in zip(students, ai.predict_readiness(students))]

    total_students = len(items)
    eligible_count = sum(1 for i in items if i["eligible"])

    items = _common_filters(items)
    if request.args.get("eligibleOnly") == "1":
        items = [i for i in items if i["eligible"]]
    min_match = to_float(request.args.get("minMatch"), 0, 100, 0)
    items = [i for i in items if i["matchPct"] >= min_match]

    sort = request.args.get("sort", "combined")
    key = {"match": lambda i: (i["matchPct"], i["combined"]), "readiness": lambda i: i["readiness"],
           "cgpa": lambda i: i["cgpa"]}.get(sort, lambda i: i["combined"])
    chunk, meta = _paginate(items, key)

    status_map = {r["student_id"]: r["status"] for r in
                  conn.execute("SELECT student_id, status FROM applications WHERE job_id=?", (job_id,))}
    for it in chunk:
        st = status_map.get(it["id"])
        it["applicationStatus"] = st
        it["applicationLabel"] = STATUS_LABEL.get(st) if st else None

    return jsonify({"job": job, "students": chunk, "branches": branches,
                    "summary": {"students": total_students, "eligible": eligible_count,
                                "matching": meta["total"]},
                    "weights": {"skill": SKILL_WEIGHT, "readiness": READINESS_WEIGHT}, **meta})


@bp.post("/jobs/<int:job_id>/shortlist")
@login_required("recruiter")
def bulk_shortlist(job_id):
    conn = db.get_db()
    if _own_job(conn, job_id) is None:
        return fail("Job not found.", 404)
    ids = body().get("studentIds")
    if not isinstance(ids, list) or not ids:
        return fail("Select at least one student.")
    ids = [i for i in {to_int(x) for x in ids} if i is not None][:500]
    valid = {r["id"] for r in conn.execute(
        f"SELECT id FROM users WHERE role='student' AND status='Active' AND id IN ({','.join('?' for _ in ids)})",
        ids)}
    now, added, updated = db.now_iso(), 0, 0
    for sid in valid:
        existing = conn.execute("SELECT id, status FROM applications WHERE student_id=? AND job_id=?",
                                (sid, job_id)).fetchone()
        if existing is None:
            conn.execute("""INSERT INTO applications (student_id, job_id, status, source, applied_at, updated_at)
                            VALUES (?,?, 'Shortlisted', 'recruiter', ?, ?)""", (sid, job_id, now, now))
            added += 1
        elif existing["status"] not in ("Shortlisted", "Selected"):
            conn.execute("UPDATE applications SET status='Shortlisted', updated_at=? WHERE id=?",
                         (now, existing["id"]))
            updated += 1
    conn.commit()
    return jsonify({"added": added, "updated": updated,
                    "skipped": len(ids) - added - updated})


# =========================================================
# COMPANY PROFILE
# =========================================================
@bp.put("/recruiter/profile")
@login_required("recruiter")
def update_company():
    d = body()
    name = clean_str(d.get("name"), 80)
    if len(name) < 2:
        return fail("Company name is too short.")
    conn = db.get_db()
    conn.execute("UPDATE users SET name=?, industry=?, location=?, website=?, about=? WHERE id=?",
                 (name, clean_str(d.get("industry"), 60), clean_str(d.get("location"), 60),
                  clean_str(d.get("website"), 120), clean_text(d.get("about"), 1000), g.user["id"]))
    conn.execute("UPDATE jobs SET company=? WHERE recruiter_id=?", (name, g.user["id"]))
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id=?", (g.user["id"],)).fetchone()
    return jsonify({"user": db.recruiter_dict(row)})
