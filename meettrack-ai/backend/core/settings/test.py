"""
Settings used by the automated tests only (fast, isolated, no MySQL needed).
Run:  python manage.py test --settings=core.settings.test
The MySQL-backed run (python manage.py test) uses the development settings instead.
"""
import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key-not-used-anywhere-else-0123456789")
os.environ["DB_ENGINE"] = "sqlite"

from .base import *  # noqa: F401,F403,E402

DEBUG = False
ALLOWED_HOSTS = ["testserver", "localhost"]
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # speed only; tests only
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
AUTH_RATE = "1000/min"
AI_ANALYSIS_RATE = "1000/hour"
UPLOAD_RATE = "1000/hour"
AI_PROVIDER = "openai"
AI_API_KEY = "test-key"
AI_MODEL = "test-model"
AI_EXTERNAL_PROCESSING_ENABLED = True
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
