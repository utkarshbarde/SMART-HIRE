"""Sign up / log in / log out / who am I."""

import time
from flask import Blueprint, jsonify, session, g
from werkzeug.security import generate_password_hash, check_password_hash

import database as db
from .helpers import body, fail, login_required, clean_str, EMAIL_RE

bp = Blueprint("auth", __name__, url_prefix="/api")

_FAILED = {}          # email -> [timestamps]  (small brute-force protection)
MAX_TRIES, WINDOW = 5, 300


def _too_many_tries(email):
    now = time.time()
    tries = [t for t in _FAILED.get(email, []) if now - t < WINDOW]
    _FAILED[email] = tries
    return len(tries) >= MAX_TRIES


def _password_ok(p):
    return len(p) >= 6 and any(c.isalpha() for c in p) and any(c.isdigit() for c in p)


@bp.post("/signup")
def signup():
    d = body()
    role = d.get("role")
    name = clean_str(d.get("name"), 80)
    email = clean_str(d.get("email"), 120).lower()
    password = d.get("password") or ""

    if role not in ("student", "recruiter"):
        return fail("Choose Student or Recruiter.")
    if len(name) < 2:
        return fail("Company name is too short." if role == "recruiter" else "Please enter your full name.")
    if not EMAIL_RE.match(email):
        return fail("Enter a valid email address.")
    if not _password_ok(password):
        return fail("Password must be at least 6 characters and contain a letter and a number.")

    conn = db.get_db()
    if conn.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        return fail("An account with this email already exists. Try logging in.", 409)

    cur = conn.execute(
        "INSERT INTO users (role, name, email, password_hash, onboarded, created_at) VALUES (?,?,?,?,?,?)",
        (role, name, email, generate_password_hash(password), 1 if role == "recruiter" else 0, db.now_iso()))
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone()
    session.clear()
    session["user_id"] = row["id"]
    return jsonify({"user": db.user_dict(row)}), 201


@bp.post("/login")
def login():
    d = body()
    email = clean_str(d.get("email"), 120).lower()
    password = d.get("password") or ""
    role = d.get("role")

    if _too_many_tries(email):
        return fail("Too many wrong attempts. Please wait 5 minutes and try again.", 429)

    row = db.get_db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        _FAILED.setdefault(email, []).append(time.time())
        return fail("Wrong email or password.", 401)
    if row["status"] != "Active":
        return fail("This account is not active.", 403)
    if role in ("student", "recruiter") and row["role"] != role:
        actual = "Recruiter" if row["role"] == "recruiter" else "Student"
        return fail(f"This is a {actual} account. Switch to the {actual} tab to log in.", 403)

    _FAILED.pop(email, None)
    session.clear()
    session["user_id"] = row["id"]
    return jsonify({"user": db.user_dict(row)})


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/me")
@login_required()
def me():
    return jsonify({"user": db.user_dict(g.user)})


@bp.post("/change-password")
@login_required()
def change_password():
    d = body()
    if not check_password_hash(g.user["password_hash"], d.get("current") or ""):
        return fail("Current password is wrong.", 403)
    new = d.get("new") or ""
    if not _password_ok(new):
        return fail("New password must be at least 6 characters with a letter and a number.")
    conn = db.get_db()
    conn.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new), g.user["id"]))
    conn.commit()
    return jsonify({"ok": True})
