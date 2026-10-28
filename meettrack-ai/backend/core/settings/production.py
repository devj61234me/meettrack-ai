"""
Production settings. Run with DJANGO_SETTINGS_MODULE=core.settings.production
behind gunicorn (never `manage.py runserver`) and an HTTPS-terminating proxy.
"""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import DB_ENGINE, env, env_bool, env_int, env_list

DEBUG = False
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS must be set in production (comma-separated host names).")
if not env_list("CORS_ALLOWED_ORIGINS"):
    raise ImproperlyConfigured("CORS_ALLOWED_ORIGINS must be set in production (your frontend https URL).")
if DB_ENGINE == "sqlite":
    raise ImproperlyConfigured("SQLite is not allowed in production. Use MySQL.")

# HTTPS and cookie hardening
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # trust the hosting proxy's header
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")
SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 3600)  # raise to 31536000 once HTTPS is verified
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# The built-in Django admin is the only HTML surface; keep its URL configurable.
ADMIN_URL = env("ADMIN_URL", "admin/")

# Errors go to stdout (collected by the hosting provider). Secrets are never logged.
