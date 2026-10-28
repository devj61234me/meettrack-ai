"""Shared helpers for the test-suite. All records live in an isolated test database."""
import json
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from meetings.models import Meeting

User = get_user_model()

NOTES = (
    "Weekly sync with Acme. Priya will send the revised proposal by 2026-11-05. "
    "Rahul agreed to migrate the database; no date was given. "
    "We decided to launch on the staging server first. "
    "Budget approval from the client is still unclear. "
    "Risk: vendor delay could block the launch. Sam from Acme might know the contract terms."
)


def good_ai_payload():
    return {
        "summary": "The team agreed to launch on staging first and assigned follow-ups.",
        "decisions": [
            {"text": "Launch on the staging server first", "status": "confirmed", "topic": "Launch",
             "evidence": "We decided to launch on the staging server first"}
        ],
        "action_items": [
            {"title": "Send revised proposal", "description": "Send the updated proposal", "owner": "Priya",
             "due_date": "2026-11-05", "due_date_text": "by 2026-11-05", "priority": "high",
             "related_decision": None, "dependencies": None,
             "evidence": "Priya will send the revised proposal by 2026-11-05", "uncertain": False},
            {"title": "Migrate the database", "description": "", "owner": "Rahul", "due_date": None,
             "due_date_text": None, "priority": None, "related_decision": "Launch on the staging server first",
             "dependencies": None, "evidence": "Rahul agreed to migrate the database; no date was given",
             "uncertain": False},
            {"title": "Review the contract", "description": "", "owner": None, "due_date": None,
             "due_date_text": None, "priority": None, "related_decision": None, "dependencies": None,
             "evidence": "", "uncertain": True},
        ],
        "risks": [
            {"text": "Vendor delay could block the launch", "type": "explicit",
             "evidence": "Risk: vendor delay could block the launch"},
            {"text": "Budget may be cut", "type": "inferred", "evidence": ""},
        ],
        "questions": [
            {"text": "Has the client approved the budget?", "reason": "Approval is unclear in the notes",
             "related_item": None, "suggested_contact": "Sam", "evidence": "Budget approval from the client is still unclear"}
        ],
        "followup_draft": "Hello team, thanks for the call.",
    }


def ai_returns(payload=None):
    """Patch the LLM call to return `payload` as JSON text (no real API request is ever made)."""
    return mock.patch(
        "services.ai_provider.call_llm", return_value=json.dumps(payload if payload is not None else good_ai_payload())
    )


class BaseAPITest(APITestCase):
    def setUp(self):
        cache.clear()  # reset throttle counters between tests
        self.user = self.make_user("alice@example.com")
        self.other = self.make_user("bob@example.com")
        self.client = self.client_for(self.user)

    def make_user(self, email, password="Str0ng-Passw0rd!x"):
        return User.objects.create_user(username=email, email=email, password=password)

    def client_for(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return client

    def make_meeting(self, owner=None, **overrides):
        data = dict(title="Acme weekly sync", client_name="Acme", meeting_date=date(2026, 10, 28),
                    participants="Priya, Rahul, Sam", notes=NOTES)
        data.update(overrides)
        return Meeting.objects.create(owner=owner or self.user, **data)

    def analyze(self, meeting, payload=None, client=None):
        with ai_returns(payload):
            return (client or self.client).post(
                f"/api/meetings/{meeting.pk}/analyze/", {"acknowledge_external_processing": True}, format="json"
            )
