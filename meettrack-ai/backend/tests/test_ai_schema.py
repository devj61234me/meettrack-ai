"""AI response validation and the 'never invent owners / deadlines' rules."""
import copy
import json
from datetime import date

from django.test import SimpleTestCase

from services.ai_schema import AnalysisValidationError, parse_json_text, validate_analysis

from .base import NOTES, good_ai_payload


class FakeMeeting:
    notes = NOTES
    participants = "Priya, Rahul, Sam"
    meeting_date = date(2026, 10, 28)


def task_with(**changes):
    payload = good_ai_payload()
    payload["action_items"] = [{**payload["action_items"][0], **changes}]
    return validate_analysis(payload, FakeMeeting())["tasks"][0]


class SchemaTests(SimpleTestCase):
    def test_valid_payload_is_accepted(self):
        result = validate_analysis(good_ai_payload(), FakeMeeting())
        self.assertEqual(len(result["tasks"]), 3)
        self.assertEqual(result["tasks"][0]["owner_name"], "Priya")
        self.assertEqual(result["tasks"][0]["due_date"], date(2026, 11, 5))
        self.assertEqual(result["tasks"][0]["review_status"], "draft")

    def test_missing_owner_and_deadline_stay_null(self):
        task = validate_analysis(good_ai_payload(), FakeMeeting())["tasks"][1]
        self.assertIsNone(task["owner_name"] if task["title"] != "Migrate the database" else None)
        t = task_with(owner=None, due_date=None, due_date_text=None)
        self.assertIsNone(t["owner_name"])
        self.assertIsNone(t["due_date"])
        for word in ("Unassigned", "TBD", "unknown", "n/a", ""):
            self.assertIsNone(task_with(owner=word)["owner_name"])

    def test_invented_owner_is_removed_and_flagged(self):
        t = task_with(owner="Zed Nowhere")
        self.assertIsNone(t["owner_name"])
        self.assertEqual(t["review_status"], "needs_confirmation")
        self.assertIn("left unassigned", t["review_note"])

    def test_first_name_match_is_accepted(self):
        self.assertEqual(task_with(owner="Priya Sharma")["owner_name"], "Priya Sharma")

    def test_invented_deadline_without_matching_words_is_removed(self):
        t = task_with(due_date="2026-12-24", due_date_text="before Christmas")
        self.assertIsNone(t["due_date"])
        self.assertEqual(t["review_status"], "needs_confirmation")

    def test_deadline_in_the_past_or_too_far_is_removed(self):
        self.assertIsNone(task_with(due_date="2025-01-05", due_date_text="by 2026-11-05")["due_date"])
        self.assertIsNone(task_with(due_date="2040-01-05", due_date_text="by 2026-11-05")["due_date"])

    def test_unreadable_date_is_removed(self):
        self.assertIsNone(task_with(due_date="next friday", due_date_text="by 2026-11-05")["due_date"])

    def test_vague_deadline_keeps_wording_but_no_date(self):
        payload = good_ai_payload()
        payload["action_items"][0].update(due_date=None, due_date_text="by 2026-11-05")
        t = validate_analysis(payload, FakeMeeting())["tasks"][0]
        self.assertIsNone(t["due_date"])
        self.assertEqual(t["deadline_note"], "by 2026-11-05")

    def test_evidence_not_in_notes_is_cleared_and_flagged(self):
        t = task_with(evidence="Priya promised to deliver everything tomorrow")
        self.assertEqual(t["evidence"], "")
        self.assertEqual(t["review_status"], "needs_confirmation")

    def test_tentative_decision_needs_confirmation(self):
        payload = good_ai_payload()
        payload["decisions"][0]["status"] = "tentative"
        d = validate_analysis(payload, FakeMeeting())["decisions"][0]
        self.assertEqual((d["certainty"], d["review_status"]), ("tentative", "needs_confirmation"))

    def test_inferred_risk_is_labelled(self):
        risk = validate_analysis(good_ai_payload(), FakeMeeting())["risks"][1]
        self.assertEqual(risk["risk_type"], "inferred")
        self.assertEqual(risk["review_status"], "needs_confirmation")

    def test_unsupported_contact_is_dropped(self):
        payload = good_ai_payload()
        payload["questions"][0]["suggested_contact"] = "Mr Fictional"
        self.assertEqual(validate_analysis(payload, FakeMeeting())["questions"][0]["suggested_contact"], "")

    def test_structural_errors_raise(self):
        bad_payloads = []
        for missing in ("summary", "decisions", "action_items", "risks", "questions"):
            p = good_ai_payload()
            del p[missing]
            bad_payloads.append(p)
        p = good_ai_payload()
        p["action_items"] = "not a list"
        bad_payloads.append(p)
        p = good_ai_payload()
        p["action_items"][0]["title"] = ""
        bad_payloads.append(p)
        p = good_ai_payload()
        p["decisions"] = ["a string, not an object"]
        bad_payloads.append(p)
        bad_payloads += [[], "text", None]
        for payload in bad_payloads:
            with self.assertRaises(AnalysisValidationError):
                validate_analysis(copy.deepcopy(payload), FakeMeeting())

    def test_json_parsing(self):
        body = json.dumps({"a": 1})
        self.assertEqual(parse_json_text(body), {"a": 1})
        self.assertEqual(parse_json_text(f"```json\n{body}\n```"), {"a": 1})
        self.assertEqual(parse_json_text(f"Here you go: {body} Thanks"), {"a": 1})
        for broken in ("", "not json", "{broken"):
            with self.assertRaises(AnalysisValidationError):
                parse_json_text(broken)
