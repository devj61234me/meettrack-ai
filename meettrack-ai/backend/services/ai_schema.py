"""
Validates the AI's JSON against our schema BEFORE anything is saved, and applies the accuracy rules:
owners, deadlines and evidence that cannot be verified against the notes are removed or flagged.
"""
import json
import re
from datetime import date, timedelta

MAX_ITEMS = 60
UNASSIGNED_WORDS = {"", "unassigned", "tbd", "tba", "unknown", "n/a", "na", "none", "null", "not specified", "nobody"}


class AnalysisValidationError(Exception):
    """The AI response could not be used. The message is safe to show to the user."""


# ---------------------------------------------------------------- helpers
def alnum(text):
    """Lower-case letters/digits only, single spaces. Used to compare text loosely."""
    return re.sub(r"[^\w]+", " ", (text or "").lower(), flags=re.UNICODE).replace("_", " ").strip()


def contains_loose(haystack, needle):
    needle = alnum(needle)
    return bool(needle) and needle in alnum(haystack)


def parse_json_text(raw):
    """Parse the model output, tolerating ```json fences or text around the object."""
    text = (raw or "").strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        text = fenced.group(1)
    try:
        return json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except ValueError:
                pass
    raise AnalysisValidationError("The AI response was not valid JSON. Please retry the analysis.")


def _text(value, field, max_len, required=False):
    if value is None:
        if required:
            raise AnalysisValidationError(f"The AI response is missing required field '{field}'.")
        return ""
    if not isinstance(value, str):
        raise AnalysisValidationError(f"The AI response has an invalid value for '{field}' (expected text).")
    value = value.strip()
    if required and not value:
        raise AnalysisValidationError(f"The AI response has an empty required field '{field}'.")
    return value[:max_len]


def _list(payload, key):
    value = payload.get(key)
    if not isinstance(value, list):
        raise AnalysisValidationError(f"The AI response must contain a list named '{key}'.")
    if len(value) > MAX_ITEMS:
        value = value[:MAX_ITEMS]
    for item in value:
        if not isinstance(item, dict):
            raise AnalysisValidationError(f"Every entry in '{key}' must be an object.")
    return value


def _check_owner(owner, notes, participants, reasons):
    owner = _text(owner, "owner", 150)
    if owner.lower() in UNASSIGNED_WORDS:
        return None
    haystack = f"{notes}\n{participants}"
    if contains_loose(haystack, owner):
        return owner
    # allow a first name / surname match, e.g. owner "Priya Sharma" when notes say "Priya"
    words = set(alnum(haystack).split())
    if any(len(token) >= 3 and token in words for token in alnum(owner).split()):
        return owner
    reasons.append(f"Owner '{owner}' was not found in the notes, so it was left unassigned")
    return None


def _check_deadline(due_date_raw, due_text_raw, notes, meeting_date, reasons):
    """Returns (due_date or None, deadline_note)."""
    due_text = _text(due_text_raw, "due_date_text", 200)
    if due_text and not contains_loose(notes, due_text):
        due_text = ""  # the quoted deadline wording is not in the notes: do not trust it
    parsed = None
    if due_date_raw not in (None, ""):
        try:
            parsed = date.fromisoformat(str(due_date_raw).strip())
        except ValueError:
            reasons.append("The AI gave a deadline in an unreadable format, so it was left empty")
    if parsed is not None:
        if not due_text:
            reasons.append("A deadline was suggested without matching words in the notes, so it was left empty")
            parsed = None
        elif parsed < meeting_date or parsed > meeting_date + timedelta(days=366 * 3):
            reasons.append(f"Deadline '{due_text}' did not resolve to a plausible date, so it was left empty")
            parsed = None
    if parsed is None and due_text:
        reasons.append(f"Deadline wording '{due_text}' is not specific enough to set a date")
    return parsed, due_text


def _check_evidence(evidence_raw, notes, reasons, required=True):
    evidence = _text(evidence_raw, "evidence", 600)
    if evidence and not contains_loose(notes, evidence):
        reasons.append("The supporting excerpt could not be found in the notes and was removed")
        return ""
    if not evidence and required:
        reasons.append("No supporting excerpt was provided")
    return evidence


def _finish(item, reasons, force_confirm=False):
    item["review_status"] = "needs_confirmation" if (reasons or force_confirm) else "draft"
    item["review_note"] = "; ".join(dict.fromkeys(reasons))[:500]
    return item


# ---------------------------------------------------------------- main entry
def validate_analysis(payload, meeting):
    """Return a clean dict of reviewable items, or raise AnalysisValidationError."""
    if not isinstance(payload, dict):
        raise AnalysisValidationError("The AI response had an unexpected structure. Please retry.")

    notes = meeting.notes
    participants = meeting.participants or ""
    summary = _text(payload.get("summary"), "summary", 5000, required=True)

    decisions = []
    for raw in _list(payload, "decisions"):
        reasons = []
        status = str(raw.get("status", "")).strip().lower()
        if status not in ("confirmed", "tentative"):
            status = "tentative"
            reasons.append("The AI did not say whether this was confirmed, so it is treated as tentative")
        elif status == "tentative":
            reasons.append("Marked tentative: it may not be a firm decision")
        decisions.append(
            _finish(
                {
                    "text": _text(raw.get("text"), "decisions.text", 3000, required=True),
                    "topic": _text(raw.get("topic"), "decisions.topic", 200),
                    "certainty": status,
                    "evidence": _check_evidence(raw.get("evidence"), notes, reasons),
                },
                reasons,
            )
        )

    tasks = []
    for raw in _list(payload, "action_items"):
        reasons = []
        owner = _check_owner(raw.get("owner"), notes, participants, reasons)
        due_date, deadline_note = _check_deadline(
            raw.get("due_date"), raw.get("due_date_text"), notes, meeting.meeting_date, reasons
        )
        priority = str(raw.get("priority") or "").strip().lower()
        priority = priority if priority in ("low", "medium", "high") else None
        dependencies = raw.get("dependencies")
        if isinstance(dependencies, list):
            dependencies = "; ".join(str(d) for d in dependencies if d)
        if raw.get("uncertain") is True:
            reasons.append("The AI marked this item as uncertain")
        tasks.append(
            _finish(
                {
                    "title": _text(raw.get("title"), "action_items.title", 255, required=True),
                    "description": _text(raw.get("description"), "action_items.description", 5000),
                    "owner_name": owner,
                    "due_date": due_date,
                    "deadline_note": deadline_note if due_date is None else "",
                    "priority": priority,
                    "dependencies": _text(dependencies, "action_items.dependencies", 1000),
                    "related_decision": _text(raw.get("related_decision"), "action_items.related_decision", 3000),
                    "evidence": _check_evidence(raw.get("evidence"), notes, reasons),
                },
                reasons,
            )
        )

    risks = []
    for raw in _list(payload, "risks"):
        reasons = []
        risk_type = str(raw.get("type", "")).strip().lower()
        if risk_type not in ("explicit", "inferred", "dependency", "blocker"):
            risk_type = "inferred"
        if risk_type == "inferred":
            reasons.append("Inferred by the AI; nobody stated this risk in the meeting")
        risks.append(
            _finish(
                {
                    "text": _text(raw.get("text"), "risks.text", 3000, required=True),
                    "risk_type": risk_type,
                    "evidence": _check_evidence(raw.get("evidence"), notes, reasons, required=risk_type != "inferred"),
                },
                reasons,
            )
        )

    questions = []
    for raw in _list(payload, "questions"):
        reasons = []
        contact = _text(raw.get("suggested_contact"), "questions.suggested_contact", 200)
        if contact and not contains_loose(f"{notes}\n{participants}", contact):
            contact = ""  # contact must be supported by the notes
        questions.append(
            _finish(
                {
                    "text": _text(raw.get("text"), "questions.text", 3000, required=True),
                    "reason": _text(raw.get("reason"), "questions.reason", 2000),
                    "related_item": _text(raw.get("related_item"), "questions.related_item", 300),
                    "suggested_contact": contact,
                    "evidence": _check_evidence(raw.get("evidence"), notes, reasons, required=False),
                },
                reasons,
            )
        )

    return {
        "summary": summary,
        "followup_draft": _text(payload.get("followup_draft"), "followup_draft", 8000),
        "decisions": decisions,
        "tasks": tasks,
        "risks": risks,
        "questions": questions,
    }
