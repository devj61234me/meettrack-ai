from django.conf import settings
from django.db import connection
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from services import ai_provider


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])
def health_view(request):
    """Health check for hosting providers. Confirms the app is up and the database answers."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return Response({"status": "ok"})
    except Exception:  # noqa: BLE001 - report unhealthy without leaking details
        return Response({"status": "unavailable"}, status=503)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def config_view(request):
    """Non-secret settings the frontend needs (never returns keys)."""
    return Response(
        {
            "ai_configured": ai_provider.is_configured(),
            "ai_external_processing_enabled": settings.AI_EXTERNAL_PROCESSING_ENABLED,
            "ai_provider": settings.AI_PROVIDER if ai_provider.is_configured() else None,
            "max_upload_mb": settings.MAX_UPLOAD_MB,
            "max_notes_chars": settings.MAX_NOTES_CHARS,
            "supported_file_types": [".txt", ".docx", ".pdf"],
        }
    )
