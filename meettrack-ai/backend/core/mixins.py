from rest_framework.decorators import action
from rest_framework.response import Response

from meetings.activity import log_activity
from meetings.models import ReviewStatus


class ReviewActionsMixin:
    """Adds approve / reject / reset endpoints to a viewset whose model has `review_status`."""

    activity_name = "item"

    def _set_review_status(self, request, new_status, verb):
        obj = self.get_object()
        obj.review_status = new_status
        obj.save(update_fields=["review_status", "updated_at"])
        log_activity(request.user, f"{self.activity_name}.{verb}", obj=obj, meeting=getattr(obj, "meeting", None))
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._set_review_status(request, ReviewStatus.APPROVED, "approved")

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._set_review_status(request, ReviewStatus.REJECTED, "rejected")

    @action(detail=True, methods=["post"])
    def reset(self, request, pk=None):
        """Undo an approval/rejection: puts the record back to 'Needs Confirmation'."""
        return self._set_review_status(request, ReviewStatus.NEEDS_CONFIRMATION, "reset")
