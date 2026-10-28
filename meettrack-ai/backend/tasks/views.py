from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action

from core.mixins import ReviewActionsMixin
from meetings.activity import log_activity
from meetings.models import ReviewStatus
from reports.exports import tasks_to_csv

from .filters import apply_task_filters, order_tasks
from .models import Task
from .serializers import TaskSerializer


class TaskViewSet(ReviewActionsMixin, viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    activity_name = "task"

    def get_queryset(self):
        # Object-level isolation: every query starts from the signed-in user's own tasks.
        qs = Task.objects.filter(user=self.request.user).select_related("meeting")
        if self.action == "list":
            qs = apply_task_filters(qs, self.request.query_params)
            qs = order_tasks(qs, self.request.query_params.get("ordering"))
        return qs

    def perform_create(self, serializer):
        # Manually created tasks are authored by the user, so they start approved.
        meeting = serializer.validated_data.get("meeting")
        task = serializer.save(user=self.request.user, review_status=ReviewStatus.APPROVED, user_edited=True)
        log_activity(self.request.user, "task.created", obj=task, meeting=meeting)

    def perform_update(self, serializer):
        task = serializer.save(user_edited=True)
        if "status" in serializer.validated_data:
            task.completed_at = timezone.now() if task.status == Task.Status.COMPLETED else None
            task.save(update_fields=["completed_at"])
        log_activity(self.request.user, "task.updated", obj=task, meeting=task.meeting)

    def perform_destroy(self, instance):
        log_activity(self.request.user, "task.deleted", obj=instance, meeting=instance.meeting)
        instance.delete()

    @action(detail=False, methods=["get"])
    def export(self, request):
        """CSV of the tasks matching the same filters as the list (or specific ?ids=1,2,3)."""
        qs = apply_task_filters(Task.objects.filter(user=request.user).select_related("meeting"), request.query_params)
        qs = order_tasks(qs, request.query_params.get("ordering"))
        response = HttpResponse(tasks_to_csv(qs), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="meettrack-tasks-{timezone.localdate()}.csv"'
        return response
