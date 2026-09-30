"""Small shared helpers used by all route files."""

import re
from functools import wraps
from flask import request, jsonify, session, g

import ai
import database as db

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def body():
    return request.get_json(silent=True) or {}


def fail(message, code=400):
    return jsonify({"error": message}), code


def login_required(role=None):
    """Decorator: user must be logged in (and have `role` if given)."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            uid = session.get("user_id")
            if not uid:
                return fail("Please log in first.", 401)
            row = db.get_db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
            if row is None or row["status"] != "Active":
                session.clear()
                return fail("Your session has ended. Please log in again.", 401)
            if role and row["role"] != role:
                return fail("You do not have access to this page.", 403)
            g.user = row
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ---------- input cleaning ----------
def clean_str(v, max_len=200):
    return " ".join(str(v or "").split())[:max_len]


def clean_text(v, max_len=3000):
    return str(v or "").strip()[:max_len]


def clean_str_list(v, max_items=40, max_len=120):
    if isinstance(v, str):
        v = re.split(r"[,\n]", v)
    out, seen = [], set()
    for item in (v or []):
        item = clean_str(item, max_len)
        if item and item.lower() not in seen:
            seen.add(item.lower())
            out.append(item)
    return out[:max_items]


def to_float(v, lo=None, hi=None, default=None):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    if lo is not None and x < lo:
        return default
    if hi is not None and x > hi:
        return default
    return x


def to_int(v, lo=None, hi=None, default=None):
    x = to_float(v, lo, hi, None)
    return int(x) if x is not None else default


# ---------- job serialisation for a student ----------
def eligibility_issues(job, student):
    issues = []
    cg = ai.cgpa_of(student)
    if job["minCgpa"] and cg < job["minCgpa"]:
        issues.append(f"Minimum CGPA {job['minCgpa']:g} needed (yours is {cg:g})")
    if job["maxBacklogs"] is not None and student["backlogs"] > job["maxBacklogs"]:
        issues.append(f"At most {job['maxBacklogs']} backlog(s) allowed (you have {student['backlogs']})")
    return issues


def job_for_student(job_row, student, app_status=None):
    job = db.job_dict(job_row)
    job["match"] = ai.skill_match(student["skills"], job["skills"])
    job["applied"] = app_status is not None
    job["applicationStatus"] = app_status
    job["saved"] = job["id"] in student["savedJobs"]
    job["eligibilityIssues"] = eligibility_issues(job, student)
    job["eligible"] = not job["eligibilityIssues"]
    return job


def student_app_statuses(conn, student_id):
    rows = conn.execute("SELECT job_id, status FROM applications WHERE student_id=?", (student_id,)).fetchall()
    return {r["job_id"]: r["status"] for r in rows}


def profile_completeness(s):
    checks = [s["phone"], s["college"], s["branch"], s["currentYear"], s["gradYear"], s["rollNumber"],
              s["semesters"], s["attendance"] is not None, s["skills"], s["projects"],
              (s["hackathons"] or s["awards"] or s["leadership"] or s["internships"] or s["certifications"])]
    return round(sum(1 for c in checks if c) / len(checks) * 100)