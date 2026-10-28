"""Builds an editable client follow-up draft from APPROVED records only (no AI call, no invention)."""
from meetings.models import ReviewStatus


def build_followup_draft(meeting, summary, user):
    approved = ReviewStatus.APPROVED
    decisions = list(meeting.decisions.filter(review_status=approved))
    confirmed = [d for d in decisions if d.certainty == "confirmed"]
    tentative = [d for d in decisions if d.certainty != "confirmed"]
    tasks = list(meeting.tasks.filter(review_status=approved).order_by("due_date", "id"))
    questions = list(meeting.questions.filter(review_status=approved))

    lines = [
        f"Subject: Follow-up: {meeting.title} ({meeting.meeting_date:%d %b %Y})",
        "",
        f"Hello{' ' + meeting.client_name + ' team' if meeting.client_name else ''},",
        "",
        f"Thank you for meeting with us on {meeting.meeting_date:%d %B %Y}. Here is a summary of what we covered.",
    ]
    if summary:
        lines += ["", "Summary", summary.strip()]

    lines += ["", "Confirmed decisions"]
    lines += [f"- {d.text}" for d in confirmed] or ["- None have been confirmed yet."]
    if tentative:
        lines += ["", "Still under discussion"] + [f"- {d.text}" for d in tentative]

    lines += ["", "Action items"]
    if tasks:
        for task in tasks:
            owner = task.owner_name or "Owner to be confirmed"
            due = task.due_date.strftime("%d %b %Y") if task.due_date else (task.deadline_note or "Date to be confirmed")
            lines.append(f"- {task.title} (Owner: {owner}; Due: {due})")
    else:
        lines.append("- No action items have been approved yet.")

    lines += ["", "Open questions"]
    lines += [f"- {q.text}" for q in questions] or ["- None at this time."]

    name = (user.get_full_name() or "").strip()
    lines += ["", "Please let us know if anything above needs correcting.", "", "Kind regards,", name]
    return "\n".join(lines).strip() + "\n"
