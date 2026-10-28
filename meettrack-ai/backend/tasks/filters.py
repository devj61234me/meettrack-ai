from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone

from meetings.models import PENDING_REVIEW, ReviewStatus

from .models import Task

ORDERING = {
    "due_date": ["due_date_null", "due_date", "id"],  # tasks without a date sort last
    "-due_date": ["due_date_null", "-due_date", "id"],
    "priority": ["priority_rank", "id"],
    "-priority": ["-priority_rank", "id"],
    "title": ["title", "id"],
    "-title": ["-title", "id"],
    "status": ["status", "id"],
    "created": ["created_at"],
    "-created": ["-created_at"],
}


def apply_task_filters(qs, params):
    """Shared by the task list and the CSV export so both always agree.

    view: operational (approved, default) | review (draft + needs confirmation) | rejected | all
    """
    view = params.get("view", "operational")
    if view == "operational":
        qs = qs.filter(review_status=ReviewStatus.APPROVED)
    elif view == "review":
        qs = qs.filter(review_status__in=PENDING_REVIEW)
    elif view == "rejected":
        qs = qs.filter(review_status=ReviewStatus.REJECTED)

    if search := params.get("search", "").strip():
        qs = qs.filter(
            Q(title__icontains=search) | Q(description__icontains=search)
            | Q(owner_name__icontains=search) | Q(meeting__title__icontains=search)
        )
    if statuses := [s for s in params.get("status", "").split(",") if s]:
        qs = qs.filter(status__in=statuses)
    if priorities := [p for p in params.get("priority", "").split(",") if p]:
        if "none" in priorities:
            qs = qs.filter(Q(priority__in=priorities) | Q(priority__isnull=True))
        else:
            qs = qs.filter(priority__in=priorities)
    if owner := params.get("owner", "").strip():
        if owner.lower() == "unassigned":
            qs = qs.filter(Q(owner_name__isnull=True) | Q(owner_name=""))
        else:
            qs = qs.filter(owner_name__icontains=owner)
    if meeting := params.get("meeting", "").strip():
        if meeting.isdigit():
            qs = qs.filter(meeting_id=int(meeting))
    if due_from := params.get("due_from"):
        qs = qs.filter(due_date__gte=due_from)
    if due_to := params.get("due_to"):
        qs = qs.filter(due_date__lte=due_to)
    if params.get("no_due_date") == "true":
        qs = qs.filter(due_date__isnull=True)
    if params.get("overdue") == "true":
        # tasks without a due date are never overdue
        qs = qs.filter(
            review_status=ReviewStatus.APPROVED, due_date__isnull=False, due_date__lt=timezone.localdate()
        ).exclude(status=Task.Status.COMPLETED)
    if params.get("open") == "true":
        qs = qs.exclude(status=Task.Status.COMPLETED)
    if ids := [i for i in params.get("ids", "").split(",") if i.isdigit()]:
        qs = qs.filter(id__in=ids)
    return qs


def order_tasks(qs, ordering):
    keys = ORDERING.get(ordering or "due_date", ORDERING["due_date"])
    qs = qs.annotate(
        due_date_null=Case(When(due_date__isnull=True, then=Value(1)), default=Value(0), output_field=IntegerField()),
        priority_rank=Case(
            When(priority="high", then=Value(3)), When(priority="medium", then=Value(2)),
            When(priority="low", then=Value(1)), default=Value(0), output_field=IntegerField(),
        ),
    )
    return qs.order_by(*keys)
