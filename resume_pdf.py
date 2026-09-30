"""
resume_pdf.py
-------------
Builds a clean, one-page resume PDF straight from a student's SmartHire
profile - no design work needed from the student, and recruiters get a
consistent format for every candidate.

Uses reportlab (pip install reportlab).
"""

from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_LEFT

INK = HexColor("#0F172A")
SOFT = HexColor("#64748B")
PRIMARY = HexColor("#4F46E5")
LINE = HexColor("#E2E8F0")


def _styles():
    ss = getSampleStyleSheet()
    return {
        "name": ParagraphStyle("name", parent=ss["Title"], fontSize=22, leading=26,
                               textColor=INK, alignment=TA_LEFT, spaceAfter=2),
        "contact": ParagraphStyle("contact", parent=ss["Normal"], fontSize=9.5,
                                  textColor=SOFT, spaceAfter=10),
        "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontSize=12, textColor=PRIMARY,
                             spaceBefore=12, spaceAfter=4, borderPadding=0),
        "body": ParagraphStyle("body", parent=ss["Normal"], fontSize=10, leading=14, textColor=INK),
        "small": ParagraphStyle("small", parent=ss["Normal"], fontSize=9, leading=13, textColor=SOFT),
        "item_title": ParagraphStyle("item_title", parent=ss["Normal"], fontSize=10.5,
                                     leading=14, textColor=INK, fontName="Helvetica-Bold"),
    }


def _cgpa_of(s):
    sems = [x.get("sgpa", 0) for x in s.get("semesters", []) if x.get("sgpa") is not None]
    return round(sum(sems) / len(sems), 2) if sems else None


def build_resume_pdf(s):
    """s is a student dict (from database.student_dict). Returns PDF bytes."""
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=16 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm)
    st = _styles()
    flow = []

    flow.append(Paragraph(s["name"] or "Student", st["name"]))
    contact_bits = [s["email"]]
    if s.get("phone"):
        contact_bits.append(s["phone"])
    if s.get("college"):
        contact_bits.append(s["college"])
    flow.append(Paragraph(" &nbsp;|&nbsp; ".join(contact_bits), st["contact"]))

    cgpa = _cgpa_of(s)
    edu_line = f"B.Tech in {s.get('branch') or '-'}"
    if s.get("college"):
        edu_line += f", {s['college']}"
    if s.get("gradYear"):
        edu_line += f" (Class of {s['gradYear']})"
    flow.append(Paragraph("EDUCATION", st["h2"]))
    flow.append(Paragraph(edu_line, st["body"]))
    detail = []
    if cgpa:
        detail.append(f"CGPA: {cgpa}")
    if s.get("backlogs") is not None:
        detail.append(f"Backlogs: {s['backlogs']}")
    if detail:
        flow.append(Paragraph(" &nbsp;•&nbsp; ".join(detail), st["small"]))

    if s.get("skills"):
        flow.append(Paragraph("SKILLS", st["h2"]))
        flow.append(Paragraph(", ".join(s["skills"]), st["body"]))

    if s.get("projects"):
        flow.append(Paragraph("PROJECTS", st["h2"]))
        for p in s["projects"]:
            flow.append(Paragraph(f"• {p}", st["body"]))

    if s.get("internships"):
        flow.append(Paragraph("INTERNSHIPS", st["h2"]))
        for i in s["internships"]:
            months = i.get("months")
            suffix = f" — {months} month{'s' if months != 1 else ''}" if months else ""
            flow.append(Paragraph(f"<b>{i.get('role','')}</b>, {i.get('company','')}{suffix}", st["body"]))

    if s.get("hackathons"):
        flow.append(Paragraph("HACKATHONS", st["h2"]))
        for h in s["hackathons"]:
            flow.append(Paragraph(f"• {h.get('name','')} — {h.get('result','')}", st["body"]))

    if s.get("awards"):
        flow.append(Paragraph("AWARDS & ACHIEVEMENTS", st["h2"]))
        for a in s["awards"]:
            flow.append(Paragraph(f"• {a.get('name','')} ({a.get('category','')})", st["body"]))

    if s.get("leadership"):
        flow.append(Paragraph("LEADERSHIP", st["h2"]))
        for l in s["leadership"]:
            team = f", team of {l.get('teamSize')}" if l.get("teamSize") else ""
            flow.append(Paragraph(f"<b>{l.get('role','')}</b> — {l.get('org','')}{team}", st["body"]))

    if s.get("certifications"):
        flow.append(Paragraph("CERTIFICATIONS", st["h2"]))
        flow.append(Paragraph(", ".join(s["certifications"]), st["body"]))

    doc.build(flow)
    return buf.getvalue()