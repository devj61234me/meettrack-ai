from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from meetings.models import Decision, Meeting, MeetingAnalysis, ReviewableModel, ReviewStatus


class Task(ReviewableModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        BLOCKED = "blocked", "Blocked"
        COMPLETED = "completed", "Completed"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tasks")
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, null=True, blank=True, related_name="tasks")
    analysis = models.ForeignKey(MeetingAnalysis, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    decision = models.ForeignKey(Decision, on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    owner_name = models.CharField(max_length=150, null=True, blank=True)  # NULL = not specified
    due_date = models.DateField(null=True, blank=True)  # NULL = not specified (never "overdue")
    deadline_note = models.CharField(max_length=200, blank=True)  # vague wording, e.g. "end of next month"
    priority = models.CharField(max_length=10, choices=Priority.choices, null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    dependencies = models.TextField(blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["due_date", "id"]
        indexes = [
            models.Index(fields=["user", "review_status", "status"]),
            models.Index(fields=["user", "due_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=["pending", "in_progress", "blocked", "completed"]), name="task_status_valid"
            ),
            models.CheckConstraint(
                condition=Q(priority__isnull=True) | Q(priority__in=["low", "medium", "high"]),
                name="task_priority_valid",
            ),
            models.CheckConstraint(
                condition=Q(review_status__in=["draft", "needs_confirmation", "approved", "rejected"]),
                name="task_review_status_valid",
            ),
        ]

    def __str__(self):
        return self.title

    @property
    def is_overdue(self):
        """Only approved, unfinished tasks with a real due date can be overdue."""
        return bool(
            self.due_date
            and self.review_status == ReviewStatus.APPROVED
            and self.status != self.Status.COMPLETED
            and self.due_date < timezone.localdate()
        )
