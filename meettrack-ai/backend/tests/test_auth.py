from django.core import mail
from django.test import override_settings
from rest_framework.test import APIClient

from .base import BaseAPITest, User

PASSWORD = "Str0ng-Passw0rd!x"


class AuthTests(BaseAPITest):
    def setUp(self):
        super().setUp()
        self.anon = APIClient()

    def test_register_creates_user_and_returns_token(self):
        r = self.anon.post("/api/auth/register/", {"email": "New@Example.com", "password": PASSWORD}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertIn("token", r.data)
        self.assertTrue(User.objects.filter(username="new@example.com").exists())
        self.assertNotEqual(User.objects.get(username="new@example.com").password, PASSWORD)  # hashed

    def test_register_rejects_weak_password_and_duplicates(self):
        r = self.anon.post("/api/auth/register/", {"email": "x@example.com", "password": "12345"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["error"]["code"], "validation_error")
        self.assertIn("password", r.data["error"]["details"])
        r = self.anon.post("/api/auth/register/", {"email": "alice@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_login_success_and_failure(self):
        ok = self.anon.post("/api/auth/login/", {"email": "alice@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(ok.status_code, 200)
        bad = self.anon.post("/api/auth/login/", {"email": "alice@example.com", "password": "wrong"}, format="json")
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.data["error"]["code"], "invalid_credentials")

    def test_protected_endpoints_require_authentication(self):
        for url in ["/api/meetings/", "/api/tasks/", "/api/decisions/", "/api/risks/", "/api/questions/",
                    "/api/dashboard/stats/", "/api/tasks/export/", "/api/auth/me/"]:
            self.assertEqual(self.anon.get(url).status_code, 401, url)

    def test_logout_invalidates_token(self):
        token = self.anon.post("/api/auth/login/", {"email": "alice@example.com", "password": PASSWORD},
                               format="json").data["token"]
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(client.get("/api/meetings/").status_code, 200)
        self.assertEqual(client.post("/api/auth/logout/").status_code, 204)
        self.assertEqual(client.get("/api/meetings/").status_code, 401)

    def test_expired_token_is_rejected(self):
        with override_settings(TOKEN_TTL_HOURS=0):
            self.assertEqual(self.client.get("/api/meetings/").status_code, 401)

    def test_password_reset_flow(self):
        r = self.anon.post("/api/auth/password-reset/", {"email": "alice@example.com"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        link = [line for line in mail.outbox[0].body.splitlines() if "reset-password" in line][0]
        uid = link.split("uid=")[1].split("&")[0]
        token = link.split("token=")[1].strip()
        new = "An0ther-Str0ng-Pass!"
        r = self.anon.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": new},
                           format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.anon.post("/api/auth/login/", {"email": "alice@example.com", "password": new},
                                        format="json").status_code, 200)
        # the same link cannot be reused
        again = self.anon.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": new},
                               format="json")
        self.assertEqual(again.status_code, 400)

    def test_password_reset_does_not_reveal_unknown_emails(self):
        r = self.anon.post("/api/auth/password-reset/", {"email": "nobody@example.com"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_change_password_requires_current_password(self):
        r = self.client.post("/api/auth/change-password/",
                             {"current_password": "nope", "new_password": "An0ther-Str0ng-Pass!"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/auth/change-password/",
                             {"current_password": PASSWORD, "new_password": "An0ther-Str0ng-Pass!"}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_delete_account_removes_all_data(self):
        meeting = self.make_meeting()
        self.assertEqual(self.client.post("/api/auth/delete-account/", {"password": "wrong"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/auth/delete-account/", {"password": PASSWORD}, format="json").status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        from meetings.models import Meeting
        self.assertFalse(Meeting.objects.filter(pk=meeting.pk).exists())

    @override_settings(AUTH_RATE="3/min")
    def test_login_is_rate_limited(self):
        codes = [self.anon.post("/api/auth/login/", {"email": "a@b.co", "password": "x"}, format="json").status_code
                 for _ in range(5)]
        self.assertIn(429, codes)
