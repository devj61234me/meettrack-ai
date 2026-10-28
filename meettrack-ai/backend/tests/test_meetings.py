from meetings.models import ActivityLog, Meeting

from .base import NOTES, BaseAPITest


class MeetingCrudTests(BaseAPITest):
    payload = {"title": "Kickoff", "client_name": "Acme", "meeting_date": "2026-10-20",
               "participants": "Priya", "notes": NOTES}

    def test_create_saves_original_notes(self):
        r = self.client.post("/api/meetings/", self.payload, format="json")
        self.assertEqual(r.status_code, 201)
        meeting = Meeting.objects.get(pk=r.data["id"])
        self.assertEqual(meeting.owner, self.user)
        self.assertEqual(meeting.notes, NOTES)
        self.assertEqual(meeting.analysis_status, "not_analyzed")
        self.assertTrue(ActivityLog.objects.filter(action="meeting.created").exists())

    def test_create_validation(self):
        for bad, field in [({"title": ""}, "title"), ({"notes": "short"}, "notes"), ({"meeting_date": ""}, "meeting_date")]:
            r = self.client.post("/api/meetings/", {**self.payload, **bad}, format="json")
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn(field, r.data["error"]["details"])

    def test_empty_database_for_new_user(self):
        r = self.client.get("/api/meetings/")
        self.assertEqual(r.data["count"], 0)

    def test_update_and_delete(self):
        meeting = self.make_meeting()
        r = self.client.patch(f"/api/meetings/{meeting.pk}/", {"title": "Renamed"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["title"], "Renamed")
        self.assertEqual(self.client.delete(f"/api/meetings/{meeting.pk}/").status_code, 204)
        self.assertFalse(Meeting.objects.filter(pk=meeting.pk).exists())

    def test_notes_locked_after_analysis(self):
        meeting = self.make_meeting()
        self.analyze(meeting)
        r = self.client.patch(f"/api/meetings/{meeting.pk}/", {"notes": NOTES + " More text added here."}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("notes", r.data["error"]["details"])
        # other fields remain editable
        self.assertEqual(self.client.patch(f"/api/meetings/{meeting.pk}/", {"client_name": "New"}, format="json").status_code, 200)

    def test_delete_cascades_to_extracted_records(self):
        from tasks.models import Task
        meeting = self.make_meeting()
        self.analyze(meeting)
        self.assertTrue(Task.objects.filter(meeting=meeting).exists())
        self.client.delete(f"/api/meetings/{meeting.pk}/")
        self.assertFalse(Task.objects.filter(user=self.user).exists())

    def test_search_filter_and_pagination(self):
        for i in range(12):
            self.make_meeting(title=f"Sync {i}", client_name="Globex" if i % 2 else "Acme")
        self.make_meeting(title="Budget review", client_name="Initech")
        r = self.client.get("/api/meetings/?page_size=5")
        self.assertEqual((r.data["count"], len(r.data["results"]), r.data["total_pages"]), (13, 5, 3))
        self.assertEqual(self.client.get("/api/meetings/?search=initech").data["count"], 1)
        self.assertEqual(self.client.get("/api/meetings/?search=budget").data["count"], 1)
        self.assertEqual(self.client.get("/api/meetings/?status=not_analyzed").data["count"], 13)
        self.assertEqual(self.client.get("/api/meetings/?status=completed").data["count"], 0)

    def test_list_shows_review_status_and_approved_count(self):
        meeting = self.make_meeting()
        self.analyze(meeting)
        row = self.client.get("/api/meetings/").data["results"][0]
        self.assertEqual(row["review_status"], "needs_review")
        self.assertEqual(row["approved_task_count"], 0)
        self.assertGreater(row["pending_review_count"], 0)
