"""CSV export plus the downloadable meeting report (PDF and DOCX). Only real stored records are used."""
import csv
import io
from xml.sax.saxutils import escape

from meetings.models import PENDING_REVIEW, ReviewStatus

CSV_COLUMNS = [
    "ID", "Task", "Description", "Meeting", "Meeting date", "Owner", "Due date", "Deadline wording",
    "Priority", "Status", "Approval", "Dependencies", "Source excerpt",
]


def safe_cell(value):
    """Stops spreadsheet formula injection: cells starting with = + - @ are prefixed with an apostrophe."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def tasks_to_csv(tasks):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    for t in tasks:
        writer.writerow(
            [safe_cell(v) for v in [
                t.id, t.title, t.description, t.meeting.title if t.meeting else "",
                t.meeting.meeting_date.isoformat() if t.meeting else "",
                t.owner_name or "Unassigned",
                t.due_date.isoformat() if t.due_date else "Not specified",
                t.deadline_note, t.get_priority_display() if t.priority else "Not specified",
                t.get_status_display(), t.get_review_status_display(), t.dependencies, t.evidence,
            ]]
        )
    return "﻿" + buffer.getvalue()  # BOM so Excel opens UTF-8 text correctly


# ------------------------------------------------------------------ meeting report data
def _report_data(meeting):
    approved = ReviewStatus.APPROVED
    analysis = meeting.analyses.filter(status="completed").order_by("-version").first()
    pending = sum(
        getattr(meeting, rel).filter(review_status__in=PENDING_REVIEW).count()
        for rel in ("decisions", "tasks", "risks", "questions")
    )
    return {
        "meeting": meeting,
        "analysis": analysis,
        "decisions": list(meeting.decisions.filter(review_status=approved)),
        "tasks": list(meeting.tasks.filter(review_status=approved).order_by("due_date", "id")),
        "risks": list(meeting.risks.filter(review_status=approved)),
        "questions": list(meeting.questions.filter(review_status=approved)),
        "pending": pending,
    }


def _task_line(t):
    owner = t.owner_name or "Unassigned"
    due = t.due_date.strftime("%d %b %Y") if t.due_date else "Not specified"
    return f"{t.title}  |  Owner: {owner}  |  Due: {due}  |  Status: {t.get_status_display()}"


def _latin(text):
    """The built-in PDF fonts only cover Latin-1; other characters become '?' (DOCX has no such limit)."""
    return (text or "").encode("cp1252", "replace").decode("cp1252")


def render_meeting_pdf(meeting):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    data = _report_data(meeting)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], textColor=colors.HexColor("#111827"), fontSize=20, alignment=0)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=colors.HexColor("#4338CA"), spaceBefore=12)
    body = styles["BodyText"]
    muted = ParagraphStyle("muted", parent=body, textColor=colors.HexColor("#64748B"), fontSize=9)

    def p(text, style=body):
        return Paragraph(escape(_latin(text)).replace("\n", "<br/>"), style)

    story = [p(meeting.title, h1)]
    meta = f"Date: {meeting.meeting_date:%d %B %Y}"
    if meeting.client_name:
        meta += f"   |   Client/project: {meeting.client_name}"
    story += [p(meta, muted)]
    if meeting.participants:
        story += [p(f"Participants: {meeting.participants}", muted)]
    story += [p("Only items approved by a person are listed as confirmed. AI drafts are not included.", muted)]

    story += [p("Summary", h2), p(data["analysis"].summary if data["analysis"] else "This meeting has not been analyzed.")]
    story += [p("Decisions", h2)]
    story += [p(f"- {d.text}" + ("" if d.certainty == "confirmed" else " (tentative)")) for d in data["decisions"]] or [p("None approved.")]
    story += [p("Action items", h2)]
    story += [p(f"- {_task_line(t)}") for t in data["tasks"]] or [p("None approved.")]
    story += [p("Risks and blockers", h2)]
    story += [p(f"- {r.text} ({r.get_risk_type_display()})") for r in data["risks"]] or [p("None approved.")]
    story += [p("Unanswered questions", h2)]
    story += [p(f"- {q.text}" + (f" Reason: {q.reason}" if q.reason else "")) for q in data["questions"]] or [p("None approved.")]
    if data["analysis"] and data["analysis"].followup_draft:
        story += [p("Client follow-up draft", h2), p(data["analysis"].followup_draft)]
    if data["pending"]:
        story += [Spacer(1, 6), p(f"{data['pending']} extracted item(s) are still awaiting review and are not included.", muted)]

    buffer = io.BytesIO()
    SimpleDocTemplate(buffer, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm,
                      bottomMargin=18 * mm, title=meeting.title).build(story)
    return buffer.getvalue()


def render_meeting_docx(meeting):
    from docx import Document
    from docx.shared import Pt, RGBColor

    data = _report_data(meeting)
    doc = Document()
    doc.styles["Normal"].font.name = "Calibri"
    doc.styles["Normal"].font.size = Pt(11)
    doc.add_heading(meeting.title, level=0)
    meta = f"Date: {meeting.meeting_date:%d %B %Y}"
    if meeting.client_name:
        meta += f"  |  Client/project: {meeting.client_name}"
    run = doc.add_paragraph().add_run(meta)
    run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
    if meeting.participants:
        doc.add_paragraph(f"Participants: {meeting.participants}")
    doc.add_paragraph("Only items approved by a person are listed. AI drafts are not included.").italic = True

    doc.add_heading("Summary", level=1)
    doc.add_paragraph(data["analysis"].summary if data["analysis"] else "This meeting has not been analyzed.")

    def bullets(title, lines):
        doc.add_heading(title, level=1)
        if not lines:
            doc.add_paragraph("None approved.")
        for line in lines:
            doc.add_paragraph(line, style="List Bullet")

    bullets("Decisions", [d.text + ("" if d.certainty == "confirmed" else " (tentative)") for d in data["decisions"]])
    doc.add_heading("Action items", level=1)
    if data["tasks"]:
        table = doc.add_table(rows=1, cols=5)
        table.style = "Light Grid Accent 1"
        for cell, label in zip(table.rows[0].cells, ["Task", "Owner", "Due", "Priority", "Status"]):
            cell.text = label
        for t in data["tasks"]:
            row = table.add_row().cells
            row[0].text = t.title
            row[1].text = t.owner_name or "Unassigned"
            row[2].text = t.due_date.strftime("%d %b %Y") if t.due_date else "Not specified"
            row[3].text = t.get_priority_display() if t.priority else "Not specified"
            row[4].text = t.get_status_display()
    else:
        doc.add_paragraph("None approved.")
    bullets("Risks and blockers", [f"{r.text} ({r.get_risk_type_display()})" for r in data["risks"]])
    bullets("Unanswered questions", [q.text + (f" Reason: {q.reason}" if q.reason else "") for q in data["questions"]])
    if data["analysis"] and data["analysis"].followup_draft:
        doc.add_heading("Client follow-up draft", level=1)
        doc.add_paragraph(data["analysis"].followup_draft)
    if data["pending"]:
        doc.add_paragraph(f"{data['pending']} extracted item(s) are still awaiting review and are not included.")
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
