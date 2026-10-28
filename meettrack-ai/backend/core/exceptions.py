"""
One consistent error format for the whole API:

    {"error": {"code": "validation_error", "message": "...", "details": {...}}}
"""
import logging

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ServiceError(APIException):
    """Raise this from views/services to return a clean error with our own code."""

    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, message, code="error", status_code=None, details=None, retryable=None):
        super().__init__(detail=message, code=code)
        if status_code:
            self.status_code = status_code
        self.code = code
        self.details = details or {}
        self.retryable = retryable


def api_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = _not_found()
    elif isinstance(exc, PermissionDenied):
        exc = _forbidden()

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled error in API view")
        return Response(
            {"error": {"code": "server_error", "message": "Something went wrong on our side. Please try again."}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, ValidationError):
        body = {
            "code": "validation_error",
            "message": "Please correct the highlighted fields.",
            "details": response.data,
        }
    elif isinstance(exc, ServiceError):
        body = {"code": exc.code, "message": str(exc.detail), "details": exc.details}
        if exc.retryable is not None:
            body["retryable"] = exc.retryable
    else:
        detail = response.data.get("detail") if isinstance(response.data, dict) else None
        body = {
            "code": getattr(exc, "default_code", "error"),
            "message": str(detail or "Request failed."),
            "details": {},
        }
    response.data = {"error": body}
    return response


def _not_found():
    from rest_framework.exceptions import NotFound

    return NotFound("The requested record was not found.")


def _forbidden():
    from rest_framework.exceptions import PermissionDenied as DRFPermissionDenied

    return DRFPermissionDenied("You do not have permission to do that.")
