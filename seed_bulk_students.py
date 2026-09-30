"""
seed_bulk_students.py
---------------------
Adds many FAKE students to smarthire.db so you can demo "a college of 10,000
students" and the Smart Shortlist feature at scale.

    python seed_bulk_students.py            # adds 10,000 students
    python seed_bulk_students.py 2000       # or any number

Safe to re-run: it always adds NEW students. All of them share the password
student123 (hashed once - hashing 10,000 times would take minutes).
"""

import sys
import json
import random
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash

FIRST = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
         "Rohan", "Kabir", "Anaya", "Diya", "Saanvi", "Ananya", "Aadhya", "Kavya", "Myra", "Riya", "Ira",
         "Pari", "Aisha", "Meera", "Priya", "Rahul", "Amit", "Vikram", "Neha", "Pooja", "Sneha", "Rakesh",
         "Suresh", "Manish", "Deepak", "Anjali", "Kiran", "Nikhil", "Varun", "Tanvi", "Shreya"]
LAST = ["Sharma", "Verma", "Patel", "Gupta", "Kumar", "Singh", "Reddy", "Rao", "Mehta", "Joshi", "Nair",
        "Iyer", "Pillai", "Chauhan", "Malhotra", "Kapoor", "Bansal", "Agarwal", "Deshmukh", "Kulkarni",
        "Bhatt", "Trivedi", "Pandey", "Yadav"]
BRANCHES = ["CSE", "CSE (AIML)", "CSE (Data Science)", "IT", "ECE", "Electrical", "Mechanical", "Civil"]
BRANCH_W = [22, 20, 10, 16, 12, 8, 7, 5]
YEARS = ["2nd Year", "3rd Year", "3rd Year", "4th Year"]
SKILLS = ["Python", "Java", "C++", "JavaScript", "SQL", "HTML", "CSS", "React", "Node.js",
          "Machine Learning", "Data Science", "TensorFlow", "Django", "Flask", "Git", "Docker", "AWS",
          "MongoDB", "Kotlin", "Data Structures", "Excel", "Data Visualization", "Linux"]
PROJECTS = ["Portfolio Website", "E-commerce App", "Chatbot", "Movie Recommender",
            "Inventory Management System", "Weather App", "Blog Platform", "Attendance Tracker",
            "Expense Tracker", "Quiz App", "Social Media Clone"]
HACKS = ["Smart India Hackathon", "College Hack Fest", "IEEE Hackathon", "TechFest Hackathon",
         "Code Sprint", "Innovate-a-thon"]
HACK_RESULTS = ["Participant", "Participant", "Participant", "Shortlisted", "Finalist", "Winner"]


def make_students(start_n, count, password_hash, rng=None):
    """Return `count` student rows (dicts) ready to INSERT into the users table."""
    rng = rng or random
    rows, used, n = [], set(), start_n
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    while len(rows) < count:
        first, last = rng.choice(FIRST), rng.choice(LAST)
        email = f"{first.lower()}.{last.lower()}{n}@college.edu"
        if email in used:
            n += 1
            continue
        used.add(email)

        sems_done = rng.randint(2, 6)
        base = rng.uniform(5.5, 9.8)
        semesters = [{"sem": i + 1, "sgpa": round(min(10, max(4, base + rng.uniform(-0.4, 0.4))), 1)}
                     for i in range(sems_done)]
        hacks = [{"name": h, "result": rng.choice(HACK_RESULTS)}
                 for h in rng.sample(HACKS, k=rng.randint(0, 2))]
        interns = ([{"company": "Some Company Pvt Ltd", "role": "Intern", "months": rng.randint(1, 6)}]
                   if rng.random() < 0.3 else [])
        lead = ([{"role": "Club Member", "org": "Tech Club", "teamSize": rng.randint(2, 20)}]
                if rng.random() < 0.15 else [])
        awards = ([{"name": "Coding Competition", "category": "Coding"}] if rng.random() < 0.2 else [])

        rows.append({
            "role": "student", "name": f"{first} {last}", "email": email,
            "password_hash": password_hash, "status": "Active", "onboarded": 1, "created_at": now,
            "phone": "", "college": "Demo College of Engineering",
            "branch": rng.choices(BRANCHES, weights=BRANCH_W)[0], "current_year": rng.choice(YEARS),
            "grad_year": str(rng.randint(2026, 2029)), "semester": f"{sems_done}th Semester",
            "section": rng.choice(["A", "B", "C"]), "roll_number": f"22CS{n:05d}",
            "backlogs": rng.choices([0, 1, 2, 3], weights=[70, 15, 10, 5])[0],
            "attendance": round(rng.uniform(55, 100), 1),
            "fee_status": rng.choices(["Cleared", "Pending"], weights=[85, 15])[0],
            "retest_papers": "[]", "skills": json.dumps(rng.sample(SKILLS, k=rng.randint(2, 10))),
            "projects": json.dumps(rng.sample(PROJECTS, k=rng.randint(0, 4))),
            "certifications": "[]", "semesters": json.dumps(semesters),
            "hackathons": json.dumps(hacks), "awards": json.dumps(awards),
            "leadership": json.dumps(lead), "internships": json.dumps(interns), "saved_jobs": "[]",
        })
        n += 1
    return rows


def main():
    import database
    database.init_db()
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10000
    conn = database.connect()
    existing = conn.execute("SELECT COUNT(*) FROM users WHERE role='student'").fetchone()[0]
    rows = make_students(existing + 1000, count, generate_password_hash("student123"))
    cols = list(rows[0].keys())
    conn.executemany(f"INSERT OR IGNORE INTO users ({', '.join(cols)}) VALUES ({','.join('?' for _ in cols)})",
                     [[r[c] for c in cols] for r in rows])
    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM users WHERE role='student'").fetchone()[0]
    conn.close()
    print(f"Added {count} students. Total students in database now: {total}")
    print("Bulk students share the password: student123")


if __name__ == "__main__":
    main()