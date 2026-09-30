"""
ai.py
-----
Everything "AI" in SmartHire is in this one file:

1. skill_match()       - how many of a job's skills the student has (with aliases, so DSA = Data Structures)
2. career_analysis()   - 7 category scores (Academics, Skills, Projects ...), strengths, gaps, advice
3. Random Forest model - predicts a "career readiness %" from 9 profile numbers
                         (trained on synthetic data - see train_model.py)
4. explain_readiness() - "Why this score?" feature-attribution breakdown

If model.pkl is missing or broken (for example a bad copy, or a different
scikit-learn version), the model is trained again automatically - so the app
never crashes because of that file.
"""

import os
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")

FEATURES = ["cgpa", "backlogs", "attendance", "skills_count", "projects_count",
            "hackathons_count", "hackathon_wins", "internship_count", "internship_months",
            "leadership_count", "awards_count"]

# ---------------------------------------------------------
# 1. SKILL MATCHING
# ---------------------------------------------------------
SKILL_ALIASES = {
    "dsa": "data structures", "data structure": "data structures",
    "data structures and algorithms": "data structures", "algorithms": "data structures",
    "js": "javascript", "ml": "machine learning", "ai": "machine learning",
    "node": "node.js", "nodejs": "node.js", "reactjs": "react", "react.js": "react",
    "py": "python", "postgres": "postgresql", "tf": "tensorflow",
    "power bi": "data visualization", "tableau": "data visualization",
    "ms excel": "excel", "html5": "html", "css3": "css", "c plus plus": "c++",
}


def norm_skill(s):
    s = " ".join(str(s).strip().lower().split())
    return SKILL_ALIASES.get(s, s)


def skill_match(student_skills, job_skills):
    have = {norm_skill(s) for s in student_skills}
    matched = [s for s in job_skills if norm_skill(s) in have]
    missing = [s for s in job_skills if norm_skill(s) not in have]
    pct = round(len(matched) / len(job_skills) * 100) if job_skills else 0
    return {"pct": pct, "matched": matched, "missing": missing}


def match_label(pct):
    if pct >= 75:
        return "Great Match!"
    if pct >= 50:
        return "Good Match"
    if pct >= 25:
        return "Partial Match"
    return "Low Match"


# ---------------------------------------------------------
# 2. PROFILE NUMBERS + CAREER ANALYSIS
# ---------------------------------------------------------
def cgpa_of(s):
    sems = [x.get("sgpa", 0) for x in s.get("semesters", []) if x.get("sgpa") is not None]
    return round(sum(sems) / len(sems), 2) if sems else 0.0


def intern_months(s):
    return sum(int(i.get("months") or 0) for i in s.get("internships", []))


def features_of(s):
    hacks = s.get("hackathons", [])
    return {
        "cgpa": cgpa_of(s),
        "backlogs": s.get("backlogs") or 0,
        "attendance": s.get("attendance") if s.get("attendance") is not None else 0,
        "skills_count": len(s.get("skills", [])),
        "projects_count": len(s.get("projects", [])),
        "hackathons_count": len(hacks),
        "hackathon_wins": sum(1 for h in hacks if h.get("result") == "Winner"),
        "internship_count": len(s.get("internships", [])),
        "internship_months": intern_months(s),
        "leadership_count": len(s.get("leadership", [])),
        "awards_count": len(s.get("awards", [])),
    }


def readiness_label(score):
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Strong"
    if score >= 50:
        return "Developing"
    return "Getting Started"


SKILL_POOL_FOR_GAPS = ["Advanced DSA", "React", "Cloud Computing", "System Design",
                       "Node.js", "Docker", "Kubernetes", "TypeScript"]


def career_analysis(s, best_job_title=None):
    """Rule-based breakdown shown as the bars on the AI Analysis page."""
    cgpa = cgpa_of(s)
    backlog_penalty = min(40, (s.get("backlogs") or 0) * 12)
    academics = max(0, min(100, round(cgpa / 10 * 100) - backlog_penalty))
    skills_score = min(100, len(s.get("skills", [])) * 9)
    projects_score = min(100, len(s.get("projects", [])) * 30)
    hacks = s.get("hackathons", [])
    wins = sum(1 for h in hacks if h.get("result") == "Winner")
    finals = sum(1 for h in hacks if h.get("result") in ("Finalist", "Runner-up"))
    hack_score = min(100, len(hacks) * 12 + wins * 10 + finals * 5)
    intern_score = min(100, len(s.get("internships", [])) * 35 + intern_months(s) * 4)
    lead_score = min(100, len(s.get("leadership", [])) * 40)
    ach_score = min(100, len(s.get("awards", [])) * 18)

    categories = [
        {"key": "academics", "label": "Academics", "score": academics},
        {"key": "skills", "label": "Technical Skills", "score": skills_score},
        {"key": "projects", "label": "Projects", "score": projects_score},
        {"key": "hackathons", "label": "Hackathons", "score": hack_score},
        {"key": "internships", "label": "Internships", "score": intern_score},
        {"key": "leadership", "label": "Leadership", "score": lead_score},
        {"key": "achievements", "label": "Achievements", "score": ach_score},
    ]
    overall = round(sum(c["score"] for c in categories) / len(categories))
    strengths = [c["label"] for c in categories if c["score"] >= 75]

    have = {norm_skill(x) for x in s.get("skills", [])}
    gaps = [g for g in SKILL_POOL_FOR_GAPS if norm_skill(g) not in have][:4]

    role = (best_job_title or "Software Development").replace(" Intern", "")
    if gaps:
        advice = f"Improve {' and '.join(gaps[:2])} to increase your placement opportunities."
    else:
        advice = "Keep building on your strengths to stand out further."
    recommendation = f"Based on your profile, you are currently well suited for {role} roles. {advice}"

    concerns = []
    if (s.get("backlogs") or 0) > 0:
        papers = s.get("retestPapers") or []
        extra = f" ({', '.join(papers)})" if papers else ""
        concerns.append(f"{s['backlogs']} pending backlog{'s' if s['backlogs'] > 1 else ''}{extra}")
    if s.get("attendance") is not None and s["attendance"] < 75:
        concerns.append(f"Attendance at {s['attendance']}% is below the usual 75% eligibility requirement")
    if s.get("feeStatus") == "Pending":
        concerns.append("Fee clearance is pending and may affect placement eligibility")

    return {"profileScore": overall, "categories": categories, "strengths": strengths,
            "gaps": gaps, "recommendation": recommendation, "concerns": concerns}


# ---------------------------------------------------------
# 3. RANDOM FOREST MODEL
# ---------------------------------------------------------
def _random_student(rng):
    """
    A made-up student. `q` is how strong the student is overall (0 = weak,
    1 = very strong); every feature follows q with some randomness, so the
    training data covers weak, average and strong students properly.
    """
    q = float(rng.beta(2, 2))

    def count(max_value, spread=0.3):
        return int(np.clip(round((q + rng.normal(0, spread)) * max_value), 0, max_value))

    base = 5.0 + 4.8 * float(np.clip(q + rng.normal(0, 0.15), 0, 1))
    sems = [{"sgpa": float(np.clip(base + rng.normal(0, 0.3), 4, 10))} for _ in range(int(rng.integers(2, 9)))]
    win_chance = 0.1 + 0.4 * q
    hacks = []
    for _ in range(count(5)):
        r = rng.random()
        hacks.append({"result": "Winner" if r < win_chance else ("Finalist" if r < win_chance + 0.25 else "Participant")})
    return {
        "semesters": sems,
        "backlogs": int(rng.poisson(1.5 * (1 - q))),
        "attendance": float(55 + 45 * np.clip(q + rng.normal(0, 0.25), 0, 1)),
        "skills": ["x"] * count(14),
        "projects": ["x"] * count(5),
        "hackathons": hacks,
        "internships": [{"months": int(rng.integers(1, 7))} for _ in range(count(3))],
        "leadership": ["x"] * count(2),
        "awards": ["x"] * count(5),
    }


def train_and_save(verbose=False):
    """
    Make synthetic students, give each a "true" readiness score, train a
    Random Forest to predict it, and save model.pkl.

    True score = the category average from career_analysis()
                 - 10 points if attendance is below 75%
                 + a little random noise (real life is never exact).
    """
    rng = np.random.default_rng(42)
    rows, labels = [], []
    for _ in range(1500):
        s = _random_student(rng)
        score = career_analysis(s)["profileScore"]
        if s["attendance"] < 75:
            score -= 10
        labels.append(float(np.clip(score + rng.normal(0, 3), 0, 100)))
        rows.append(features_of(s))

    X = pd.DataFrame(rows)[FEATURES]
    y = np.array(labels)
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestRegressor(n_estimators=100, max_depth=9, min_samples_leaf=3,
                                  random_state=42, n_jobs=1)
    model.fit(X_tr, y_tr)
    mae = mean_absolute_error(y_te, model.predict(X_te))
    joblib.dump({"model": model, "features": FEATURES}, MODEL_PATH)

    if verbose:
        print(f"Trained on {len(X_tr)} students, tested on {len(X_te)}.")
        print(f"Average error on test data: {mae:.2f} points (out of 100)")
        imp = pd.Series(model.feature_importances_, index=FEATURES).sort_values(ascending=False)
        print("\nWhich factors mattered most:\n" + imp.round(3).to_string())
        print(f"\nSaved model to {MODEL_PATH}")
    return mae


_bundle = None


def get_model():
    global _bundle
    if _bundle is not None:
        return _bundle
    try:
        _bundle = joblib.load(MODEL_PATH)
        _ = _bundle["model"], _bundle["features"]
    except Exception as exc:   # missing / empty / corrupt / version mismatch
        print(f"[ai] model.pkl not usable ({type(exc).__name__}) - training a fresh model...")
        train_and_save()
        _bundle = joblib.load(MODEL_PATH)
    return _bundle


def predict_readiness(students):
    """
    Predict readiness for MANY students with ONE model.predict() call
    (fast even for 10,000 students). Returns [(score, label), ...].
    """
    if not students:
        return []
    bundle = get_model()
    df = pd.DataFrame([features_of(s) for s in students])[bundle["features"]]
    scores = bundle["model"].predict(df)
    out = []
    for sc in scores:
        sc = round(float(max(0, min(100, sc))), 1)
        out.append((sc, readiness_label(sc)))
    return out


# ---------------------------------------------------------
# 4. EXPLAINABLE AI  ("Why this score?")
# ---------------------------------------------------------
# A typical/average student's numbers, used as the comparison point.
# Swapping one feature to this "typical" value and re-predicting shows
# how much that one feature is pushing the score up or down - a simple,
# easy-to-explain form of feature attribution (no extra ML library needed).
BASELINE = {
    "cgpa": 7.2, "backlogs": 1, "attendance": 78, "skills_count": 6,
    "projects_count": 2, "hackathons_count": 2, "hackathon_wins": 0,
    "internship_count": 1, "internship_months": 3, "leadership_count": 0, "awards_count": 1,
}

FEATURE_LABELS = {
    "cgpa": "CGPA", "backlogs": "Backlogs", "attendance": "Attendance",
    "skills_count": "Number of skills", "projects_count": "Number of projects",
    "hackathons_count": "Hackathons participated", "hackathon_wins": "Hackathons won",
    "internship_count": "Internships", "internship_months": "Internship months",
    "leadership_count": "Leadership roles", "awards_count": "Awards",
}


def explain_readiness(student):
    """
    Returns the AI score plus a ranked list of which profile numbers pushed
    it up or down the most, compared to a typical student.
    """
    bundle = get_model()
    model, features = bundle["model"], bundle["features"]
    feats = features_of(student)
    row = pd.DataFrame([feats])[features]
    base_score = float(model.predict(row)[0])

    factors = []
    for f in features:
        swapped = row.copy()
        swapped[f] = BASELINE[f]
        swapped_score = float(model.predict(swapped)[0])
        impact = round(base_score - swapped_score, 1)   # + means this feature raised the score
        factors.append({
            "key": f, "label": FEATURE_LABELS[f], "impact": impact,
            "yourValue": feats[f], "typicalValue": BASELINE[f],
        })
    factors.sort(key=lambda x: -abs(x["impact"]))

    score = round(max(0, min(100, base_score)), 1)
    return {"score": score, "label": readiness_label(score), "factors": factors}