"""
database.py
-----------
All database code lives here. We use Python's built-in `sqlite3` (plain SQL,
no ORM) so there is nothing extra to install and you can see exactly which
SQL runs - good for viva/explaining.

Only TWO roles exist: 'student' and 'recruiter'.

List-type fields (skills, projects, hackathons ...) are stored as JSON text
in a TEXT column, because SQLite has no array type.
"""

import os
import json
import sqlite3
from datetime import datetime, timezone, timedelta, date

from flask import g
from werkzeug.security import generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))   # so it works from ANY folder
DB_PATH = os.path.join(BASE_DIR, "smarthire.db")


# ---------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------
def connect():
    """Plain connection (used by scripts like seed_bulk_students.py)."""
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    """One connection per web request, stored on flask.g and closed afterwards."""
    if "db" not in g:
        g.db = connect()
    return g.db


def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------
# Schema
# ---------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK (role IN ('student','recruiter')),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    onboarded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,

    -- student fields
    phone TEXT DEFAULT '',
    college TEXT DEFAULT '',
    branch TEXT DEFAULT '',
    current_year TEXT DEFAULT '',
    grad_year TEXT DEFAULT '',
    semester TEXT DEFAULT '',
    section TEXT DEFAULT '',
    roll_number TEXT DEFAULT '',
    backlogs INTEGER DEFAULT 0,
    attendance REAL,
    fee_status TEXT DEFAULT 'Pending',
    resume_file TEXT,
    resume_name TEXT,
    retest_papers TEXT DEFAULT '[]',
    skills TEXT DEFAULT '[]',
    projects TEXT DEFAULT '[]',
    certifications TEXT DEFAULT '[]',
    semesters TEXT DEFAULT '[]',
    hackathons TEXT DEFAULT '[]',
    awards TEXT DEFAULT '[]',
    leadership TEXT DEFAULT '[]',
    internships TEXT DEFAULT '[]',
    saved_jobs TEXT DEFAULT '[]',

    -- recruiter (company) fields
    industry TEXT DEFAULT '',
    location TEXT DEFAULT '',
    website TEXT DEFAULT '',
    about TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recruiter_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT DEFAULT '',
    mode TEXT DEFAULT 'On-site',
    job_type TEXT DEFAULT 'Internship',
    duration TEXT DEFAULT '',
    stipend TEXT DEFAULT '',
    deadline TEXT DEFAULT '',            -- YYYY-MM-DD
    posted_on TEXT DEFAULT '',           -- YYYY-MM-DD
    openings INTEGER DEFAULT 1,
    min_cgpa REAL DEFAULT 0,
    max_backlogs INTEGER,                -- NULL = no limit
    description TEXT DEFAULT '',
    skills TEXT DEFAULT '[]',
    eligibility TEXT DEFAULT '[]',
    status TEXT DEFAULT 'Open',          -- Open | Closed
    verified INTEGER DEFAULT 1,
    FOREIGN KEY (recruiter_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    job_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Applied',   -- Applied | UnderReview | Shortlisted | Selected | Rejected
    source TEXT NOT NULL DEFAULT 'applied',   -- applied | recruiter (added by Smart Shortlist)
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (student_id, job_id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_apps_student ON applications(student_id);
"""


def init_db():
    conn = connect()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


# ---------------------------------------------------------
# Row -> dict converters (what the API sends to the browser)
# ---------------------------------------------------------
def _j(text, default):
    if not text:
        return default
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        return default


STUDENT_LIST_FIELDS = ["retest_papers", "skills", "projects", "certifications", "semesters",
                       "hackathons", "awards", "leadership", "internships", "saved_jobs"]


def student_dict(row):
    """Full student profile."""
    d = {
        "id": row["id"], "role": "student", "name": row["name"], "email": row["email"],
        "onboarded": bool(row["onboarded"]), "phone": row["phone"], "college": row["college"],
        "branch": row["branch"], "currentYear": row["current_year"], "gradYear": row["grad_year"],
        "semester": row["semester"], "section": row["section"], "rollNumber": row["roll_number"],
        "backlogs": row["backlogs"] or 0, "attendance": row["attendance"],
        "feeStatus": row["fee_status"], "hasResume": bool(row["resume_file"]),
        "resumeName": row["resume_name"],
    }
    d["retestPapers"] = _j(row["retest_papers"], [])
    d["skills"] = _j(row["skills"], [])
    d["projects"] = _j(row["projects"], [])
    d["certifications"] = _j(row["certifications"], [])
    d["semesters"] = _j(row["semesters"], [])
    d["hackathons"] = _j(row["hackathons"], [])
    d["awards"] = _j(row["awards"], [])
    d["leadership"] = _j(row["leadership"], [])
    d["internships"] = _j(row["internships"], [])
    d["savedJobs"] = _j(row["saved_jobs"], [])
    return d


def recruiter_dict(row):
    return {
        "id": row["id"], "role": "recruiter", "name": row["name"], "email": row["email"],
        "onboarded": bool(row["onboarded"]), "industry": row["industry"],
        "location": row["location"], "website": row["website"], "about": row["about"],
    }


def user_dict(row):
    return student_dict(row) if row["role"] == "student" else recruiter_dict(row)


def light_student(row):
    """
    Lightweight student dict - only what ranking/matching needs. Used when we
    process thousands of students at once (Smart Shortlist), so we skip the
    fields we don't need.
    """
    return {
        "id": row["id"], "name": row["name"], "email": row["email"],
        "college": row["college"], "branch": row["branch"], "currentYear": row["current_year"],
        "backlogs": row["backlogs"] or 0,
        "attendance": row["attendance"] if row["attendance"] is not None else 0,
        "skills": _j(row["skills"], []), "projects": _j(row["projects"], []),
        "semesters": _j(row["semesters"], []), "hackathons": _j(row["hackathons"], []),
        "awards": _j(row["awards"], []), "leadership": _j(row["leadership"], []),
        "internships": _j(row["internships"], []),
        "hasResume": bool(row["resume_file"]),
    }


def job_dict(row):
    today = date.today().isoformat()
    deadline = row["deadline"] or ""
    closed = row["status"] == "Closed" or (deadline != "" and deadline < today)
    days_left = None
    if deadline:
        try:
            days_left = (date.fromisoformat(deadline) - date.today()).days
        except ValueError:
            pass
    return {
        "id": row["id"], "recruiterId": row["recruiter_id"], "title": row["title"],
        "company": row["company"], "location": row["location"], "mode": row["mode"],
        "jobType": row["job_type"], "duration": row["duration"], "stipend": row["stipend"],
        "deadline": deadline, "postedOn": row["posted_on"], "openings": row["openings"],
        "minCgpa": row["min_cgpa"] or 0, "maxBacklogs": row["max_backlogs"],
        "description": row["description"], "skills": _j(row["skills"], []),
        "eligibility": _j(row["eligibility"], []), "status": row["status"],
        "verified": bool(row["verified"]), "closed": closed, "daysLeft": days_left,
    }


# ---------------------------------------------------------
# Demo data (only inserted into an EMPTY database)
# ---------------------------------------------------------
def seed_demo_data():
    conn = connect()
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        conn.close()
        return

    import random
    from seed_bulk_students import make_students

    pw = generate_password_hash("pass123")
    now = now_iso()

    def ago(days):
        return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def in_days(n):
        return (date.today() + timedelta(days=n)).isoformat()

    # ---- main demo student (matches the prototype screenshots) ----
    conn.execute("""
        INSERT INTO users (role, name, email, password_hash, onboarded, created_at,
            phone, college, branch, current_year, grad_year, semester, section, roll_number,
            backlogs, attendance, fee_status, skills, projects, certifications, semesters,
            hackathons, awards, leadership, internships)
        VALUES ('student','Utkarsh','student1@gmail.com',?,1,?,
            '+91 98765 43210','ABC Institute of Technology','CSE (AIML)','3rd Year','2028',
            '6th Semester','A','22CSAIML045',0,88,'Cleared',?,?,?,?,?,?,?,?)
    """, (pw, now,
          json.dumps(["Python", "Java", "SQL", "HTML"]),
          json.dumps(["AI Chatbot using Python", "Movie Recommendation System"]),
          json.dumps(["Python for Data Science", "Web Development"]),
          json.dumps([{"sem": 1, "sgpa": 8.2}, {"sem": 2, "sgpa": 8.5}, {"sem": 3, "sgpa": 8.7},
                      {"sem": 4, "sgpa": 8.9}, {"sem": 5, "sgpa": 9.1}, {"sem": 6, "sgpa": 9.0}]),
          json.dumps([{"name": "Smart India Hackathon", "result": "Finalist"},
                      {"name": "IEEE Hackathon", "result": "Winner"},
                      {"name": "College Hackathon", "result": "Participant"},
                      {"name": "TechFest Hackathon", "result": "Finalist"}]),
          json.dumps([{"name": "Hackathon Winner", "category": "Hackathon"},
                      {"name": "SIH Finalist", "category": "Hackathon"},
                      {"name": "Best Project Award", "category": "Academic"},
                      {"name": "Coding Competition Winner", "category": "Coding"},
                      {"name": "Technical Event Achievement", "category": "Technical"}]),
          json.dumps([{"role": "Technical Club Coordinator", "org": "Tech Club", "teamSize": 15},
                      {"role": "Hackathon Team Leader", "org": "SIH Team", "teamSize": 4}]),
          json.dumps([{"company": "TechNova Solutions", "role": "Software Developer Intern", "months": 3},
                      {"company": "ABC Technologies", "role": "Machine Learning Intern", "months": 2}])))

    # ---- recruiters (3 companies) ----
    recruiters = [
        ("TechNova Solutions", "hr@technova.com", "Software", "Bangalore",
         "https://technova.example.com", "TechNova builds cloud software for logistics companies."),
        ("AI Labs", "hr@ailabs.com", "Artificial Intelligence", "Hyderabad",
         "https://ailabs.example.com", "AI Labs works on applied machine learning products."),
        ("DataEdge", "hr@dataedge.com", "Analytics", "Bangalore",
         "https://dataedge.example.com", "DataEdge helps retailers make decisions from data."),
    ]
    rec_ids = []
    for name, email, industry, loc, site, about in recruiters:
        cur = conn.execute("""INSERT INTO users (role, name, email, password_hash, onboarded, created_at,
                              industry, location, website, about)
                              VALUES ('recruiter',?,?,?,1,?,?,?,?,?)""",
                           (name, email, pw, now, industry, loc, site, about))
        rec_ids.append(cur.lastrowid)

    # ---- jobs ----
    jobs = [
        (rec_ids[0], "Software Developer Intern", "TechNova Solutions", "Bangalore", "On-site", "Internship",
         "3-6 Months", "Rs 15,000 / Month", in_days(25), 2, 7.0, 1,
         "We are looking for a Software Developer Intern who wants to build real-world applications with our engineering team.",
         ["Python", "Java", "SQL", "Data Structures"],
         ["Pursuing B.Tech / B.E.", "Good programming skills"]),
        (rec_ids[1], "Machine Learning Intern", "AI Labs", "Hyderabad", "Remote", "Internship",
         "6 Months", "Rs 20,000 / Month", in_days(35), 3, 7.5, 0,
         "Work with our AI team on building, training and deploying machine learning models.",
         ["Python", "Machine Learning", "Data Science", "TensorFlow"],
         ["Pursuing B.Tech / B.E. in CS or AIML", "Basic ML knowledge"]),
        (rec_ids[2], "Data Analyst Intern", "DataEdge", "Bangalore", "Hybrid", "Internship",
         "3 Months", "Rs 12,000 / Month", in_days(18), 2, 6.5, 2,
         "Turn raw sales data into dashboards and insights that our retail clients use every day.",
         ["SQL", "Excel", "Data Visualization", "Python"],
         ["Any engineering branch", "Comfortable with spreadsheets and SQL"]),
        (rec_ids[0], "Frontend Developer (Full-time)", "TechNova Solutions", "Pune", "Hybrid", "Full-time",
         "Permanent", "Rs 6 LPA", in_days(40), 5, 7.0, 0,
         "Build fast, accessible user interfaces for our logistics dashboards.",
         ["HTML", "CSS", "JavaScript", "React"],
         ["B.Tech 2026 / 2027 batch", "Portfolio of web projects"]),
    ]
    job_ids = []
    for (rid, title, company, loc, mode, jtype, dur, stipend, deadline, openings, mincg, maxbl,
         desc, skills, elig) in jobs:
        cur = conn.execute("""INSERT INTO jobs (recruiter_id,title,company,location,mode,job_type,duration,
                              stipend,deadline,posted_on,openings,min_cgpa,max_backlogs,description,skills,
                              eligibility,status,verified)
                              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'Open',1)""",
                           (rid, title, company, loc, mode, jtype, dur, stipend, deadline,
                            date.today().isoformat(), openings, mincg, maxbl, desc,
                            json.dumps(skills), json.dumps(elig)))
        job_ids.append(cur.lastrowid)

    # ---- main student's applications (as in the prototype) ----
    student_id = conn.execute("SELECT id FROM users WHERE email='student1@gmail.com'").fetchone()[0]
    conn.execute("INSERT INTO applications (student_id,job_id,status,source,applied_at,updated_at) VALUES (?,?,?,?,?,?)",
                 (student_id, job_ids[0], "UnderReview", "applied", ago(2), ago(1)))
    conn.execute("INSERT INTO applications (student_id,job_id,status,source,applied_at,updated_at) VALUES (?,?,?,?,?,?)",
                 (student_id, job_ids[2], "Shortlisted", "applied", ago(5), ago(3)))

    # ---- 40 extra demo students so recruiter screens are not empty ----
    rng = random.Random(7)
    demo_hash = generate_password_hash("student123")
    students = make_students(start_n=1, count=40, password_hash=demo_hash, rng=rng)
    cols = list(students[0].keys())
    conn.executemany(
        f"INSERT INTO users ({', '.join(cols)}) VALUES ({','.join('?' for _ in cols)})",
        [[s[c] for c in cols] for s in students])
    ids = [r[0] for r in conn.execute("SELECT id FROM users WHERE email LIKE '%@college.edu' LIMIT 40")]
    statuses = ["Applied", "Applied", "UnderReview", "Shortlisted", "Rejected"]
    for sid in ids[:22]:
        for jid in rng.sample(job_ids, k=rng.randint(1, 2)):
            conn.execute("""INSERT OR IGNORE INTO applications (student_id,job_id,status,source,applied_at,updated_at)
                            VALUES (?,?,?,?,?,?)""",
                         (sid, jid, rng.choice(statuses), "applied", ago(rng.randint(0, 9)), ago(rng.randint(0, 4))))

    conn.commit()
    conn.close()