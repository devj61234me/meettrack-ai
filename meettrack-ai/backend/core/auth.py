from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class ExpiringTokenAuthentication(TokenAuthentication):
    """DRF token authentication, but tokens stop working after TOKEN_TTL_HOURS."""

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if timezone.now() - token.created > timedelta(hours=settings.TOKEN_TTL_HOURS):
            token.delete()
            raise AuthenticationFailed("Your session has expired. Please sign in again.")
        return user, token


class AuthThrottle(SimpleRateThrottle):
    """Limits login / register / password-reset attempts per IP address."""

    scope = "auth"

    def get_rate(self):
        return settings.AUTH_RATE

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class AnalysisThrottle(UserRateThrottle):
    """Limits expensive AI analysis requests per user."""

    scope = "analysis"

    def get_rate(self):
        return settings.AI_ANALYSIS_RATE


class UploadThrottle(UserRateThrottle):
    scope = "upload"

    def get_rate(self):
        return settings.UPLOAD_RATE
