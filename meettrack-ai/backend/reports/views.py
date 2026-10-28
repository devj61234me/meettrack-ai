from datetime import timedelta

from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from meetings.models import PENDING_REVIEW, Meeting, Question, ReviewStatus
from meetings.serializers import MeetingListSerializer
from meetings.views import annotate_meetings
from tasks.models import Task
from tasks.serializers import TaskSerializer

from .exports import safe_cell


def _open_approved(user):
    return Task.objects.filter(user=user, review_status=ReviewStatus.APPROVED).exclude(status=Task.Status.COMPLETED)


@api_view(["GET"])
def dashboard_stats(request):
    """Every number is computed from the signed-in user's real database rows."""
    user = request.user
    today = timezone.localdate()
    meetings = Meeting.objects.filter(owner=user)
    total = meetings.count()

    awaiting = annotate_meetings(meetings.filter(analysis_status="completed")).filter(pending_review_count__gt=0).count()
    open_tasks = _open_approved(user)
    overdue = open_tasks.filter(due_date__isnull=False, due_date__lt=today)  # no date = never overdue
    upcoming = open_tasks.filter(due_date__gte=today, due_date__lte=today + timedelta(days=14)).order_by("due_date")[:6]
    attention = (
        open_tasks.filter(Q(status=Task.Status.BLOCKED) | Q(due_date__lt=today, due_date__isnull=False))
        .select_related("meeting").order_by("due_date")[:6]
    )
    by_status = {
        row["status"]: row["n"]
        for row in Task.objects.filter(user=user, review_status=ReviewStatus.APPROVED)
        .values("status").annotate(n=Count("id"))
    }
    ctx = {"request": request}
    return Response(
        {
            "total_meetings": total,
            "meetings_awaiting_review": awaiting,
            "open_task_count": open_tasks.count(),
            "overdue_count": overdue.count(),
            "pending_item_count": sum(
                m.objects.filter(**{("meeting__owner" if m is not Task else "user"): user,
                                    "review_status__in": PENDING_REVIEW}).count()
                for m in (Task, Question)
            ),
            "task_status_counts": {s: by_status.get(s, 0) for s in ("pending", "in_progress", "blocked", "completed")},
            "upcoming_deadlines": TaskSerializer(upcoming.select_related("meeting"), many=True, context=ctx).data,
            "attention_tasks": TaskSerializer(attention, many=True, context=ctx).data,
            "recent_meetings": MeetingListSerializer(
                annotate_meetings(meetings).order_by("-created_at")[:5], many=True
            ).data,
        }
    )


@api_view(["GET"])
def questions_export(request):
    """CSV of unanswered (approved) questions across all meetings."""
    import csv
    import io

    qs = Question.objects.filter(meeting__owner=request.user, review_status=ReviewStatus.APPROVED).select_related("meeting")
    if meeting := request.query_params.get("meeting"):
        if meeting.isdigit():
            qs = qs.filter(meeting_id=int(meeting))
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["ID", "Question", "Reason", "Related item", "Suggested contact", "Meeting", "Meeting date"])
    for q in qs:
        writer.writerow([safe_cell(v) for v in [q.id, q.text, q.reason, q.related_item, q.suggested_contact,
                                                q.meeting.title, q.meeting.meeting_date.isoformat()]])
    response = HttpResponse("﻿" + buffer.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="meettrack-questions.csv"'
    return response
