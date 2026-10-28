"""A user must never be able to read or change another user's data."""
from meetings.models import Decision
from tasks.models import Task

from .base import BaseAPITest


class IsolationTests(BaseAPITest):
    def setUp(self):
        super().setUp()
        self.meeting = self.make_meeting()
        self.analyze(self.meeting)
        self.bob = self.client_for(self.other)
        self.task = Task.objects.filter(meeting=self.meeting).first()
        self.decision = Decision.objects.filter(meeting=self.meeting).first()

    def test_lists_only_show_own_records(self):
        self.assertEqual(self.bob.get("/api/meetings/").data["count"], 0)
        self.assertEqual(self.bob.get("/api/tasks/?view=all").data["count"], 0)
        self.assertEqual(self.bob.get("/api/decisions/").data["count"], 0)
        self.assertEqual(self.bob.get("/api/risks/").data["count"], 0)
        self.assertEqual(self.bob.get("/api/questions/").data["count"], 0)

    def test_foreign_meeting_is_not_found(self):
        m = self.meeting.pk
        self.assertEqual(self.bob.get(f"/api/meetings/{m}/").status_code, 404)
        self.assertEqual(self.bob.patch(f"/api/meetings/{m}/", {"title": "x"}, format="json").status_code, 404)
        self.assertEqual(self.bob.delete(f"/api/meetings/{m}/").status_code, 404)
        self.assertEqual(self.bob.get(f"/api/meetings/{m}/analysis/").status_code, 404)
        self.assertEqual(self.bob.get(f"/api/meetings/{m}/report/").status_code, 404)
        self.assertEqual(self.analyze(self.meeting, client=self.bob).status_code, 404)

    def test_foreign_task_and_decision_actions_blocked(self):
        t, d = self.task.pk, self.decision.pk
        self.assertEqual(self.bob.get(f"/api/tasks/{t}/").status_code, 404)
        self.assertEqual(self.bob.patch(f"/api/tasks/{t}/", {"title": "hacked"}, format="json").status_code, 404)
        self.assertEqual(self.bob.post(f"/api/tasks/{t}/approve/").status_code, 404)
        self.assertEqual(self.bob.delete(f"/api/tasks/{t}/").status_code, 404)
        self.assertEqual(self.bob.post(f"/api/decisions/{d}/approve/").status_code, 404)
        self.assertEqual(self.bob.patch(f"/api/decisions/{d}/", {"text": "x"}, format="json").status_code, 404)
        self.task.refresh_from_db()
        self.assertNotEqual(self.task.title, "hacked")

    def test_bulk_review_cannot_touch_foreign_items(self):
        bobs_meeting = self.make_meeting(owner=self.other, title="Bob's meeting")
        r = self.bob.post(
            f"/api/meetings/{bobs_meeting.pk}/review/",
            {"action": "approve", "confirm": True, "items": [{"type": "task", "id": self.task.pk}]}, format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["updated"], 0)
        self.task.refresh_from_db()
        self.assertNotEqual(self.task.review_status, "approved")

    def test_cannot_attach_task_to_foreign_meeting(self):
        r = self.bob.post("/api/tasks/", {"title": "Sneaky", "meeting": self.meeting.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Task.objects.filter(title="Sneaky").exists())

    def test_dashboard_and_exports_are_per_user(self):
        stats = self.bob.get("/api/dashboard/stats/").data
        self.assertEqual(stats["total_meetings"], 0)
        csv_text = self.bob.get("/api/tasks/export/?view=all").content.decode("utf-8-sig")
        self.assertEqual(len(csv_text.strip().splitlines()), 1)  # header only
