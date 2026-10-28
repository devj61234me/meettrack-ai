from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from core.auth import AnalysisThrottle, UploadThrottle
from core.exceptions import ServiceError
from core.mixins import ReviewActionsMixin
from reports.exports import render_meeting_docx, render_meeting_pdf
from services.file_extraction import FileExtractionError, extract_text
from services.followup import build_followup_draft
from tasks.models import Task
from tasks.serializers import TaskSerializer

from .activity import log_activity
from .analysis import run_analysis
from .models import PENDING_REVIEW, Decision, Meeting, MeetingAnalysis, Question, ReviewStatus, Risk
from .serializers import (
    BulkReviewSerializer,
    DecisionSerializer,
    FollowupSerializer,
    MeetingAnalysisSerializer,
    MeetingDetailSerializer,
    MeetingListSerializer,
    MeetingWriteSerializer,
    QuestionSerializer,
    RiskSerializer,
)


def annotate_meetings(qs):
    """Adds approved_task_count and pending_review_count to a meeting queryset."""
    return qs.annotate(
        approved_task_count=Count("tasks", filter=Q(tasks__review_status=ReviewStatus.APPROVED), distinct=True),
        pending_review_count=(
            Count("tasks", filter=Q(tasks__review_status__in=PENDING_REVIEW), distinct=True)
            + Count("decisions", filter=Q(decisions__review_status__in=PENDING_REVIEW), distinct=True)
            + Count("risks", filter=Q(risks__review_status__in=PENDING_REVIEW), distinct=True)
            + Count("questions", filter=Q(questions__review_status__in=PENDING_REVIEW), distinct=True)
        ),
    )


def analysis_bundle(meeting, request):
    """Everything the review page needs in one response."""
    latest = meeting.analyses.filter(status=MeetingAnalysis.Status.COMPLETED).order_by("-version").first()
    attempts = meeting.analyses.order_by("-version")[:10]
    ctx = {"request": request}
    return {
        "meeting_id": meeting.id,
        "analysis": MeetingAnalysisSerializer(latest).data if latest else None,
        "attempts": MeetingAnalysisSerializer(attempts, many=True).data,
        "decisions": DecisionSerializer(meeting.decisions.select_related("meeting"), many=True).data,
        "tasks": TaskSerializer(meeting.tasks.select_related("meeting").order_by("id"), many=True, context=ctx).data,
        "risks": RiskSerializer(meeting.risks.select_related("meeting"), many=True).data,
        "questions": QuestionSerializer(meeting.questions.select_related("meeting"), many=True).data,
    }


class MeetingViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        qs = annotate_meetings(Meeting.objects.filter(owner=self.request.user))  # only the user's own meetings
        params = self.request.query_params
        if self.action == "list":
            if search := params.get("search", "").strip():
                qs = qs.filter(Q(title__icontains=search) | Q(client_name__icontains=search))
            if state := params.get("status"):
                if state == "needs_review":
                    qs = qs.filter(analysis_status="completed", pending_review_count__gt=0)
                elif state == "reviewed":
                    qs = qs.filter(analysis_status="completed", pending_review_count=0)
                else:
                    qs = qs.filter(analysis_status=state)
            if date_from := params.get("date_from"):
                qs = qs.filter(meeting_date__gte=date_from)
            if date_to := params.get("date_to"):
                qs = qs.filter(meeting_date__lte=date_to)
            allowed = {"meeting_date", "-meeting_date", "title", "-title", "updated_at", "-updated_at"}
            ordering = params.get("ordering")
            qs = qs.order_by(ordering if ordering in allowed else "-meeting_date", "-id")
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return MeetingListSerializer
        if self.action in ("create", "update", "partial_update"):
            return MeetingWriteSerializer
        return MeetingDetailSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        meeting = serializer.save(owner=request.user)  # notes are saved before any AI work happens
        log_activity(request.user, "meeting.created", obj=meeting, meeting=meeting)
        return Response(self._detail(meeting), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        meeting = self.get_object()
        serializer = self.get_serializer(meeting, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(request.user, "meeting.updated", obj=meeting, meeting=meeting)
        return Response(self._detail(meeting))

    def _detail(self, meeting):
        fresh = self.get_queryset().get(pk=meeting.pk)
        return MeetingDetailSerializer(fresh, context=self.get_serializer_context()).data

    def perform_destroy(self, instance):
        log_activity(self.request.user, "meeting.deleted", obj=instance, detail=f"meeting id {instance.pk}")
        instance.delete()  # cascades to analyses, decisions, tasks, risks, questions

    # ---- document upload -> text (so the user can check it before analysis)
    @action(detail=False, methods=["post"], url_path="extract-text", parser_classes=[MultiPartParser],
            throttle_classes=[UploadThrottle])
    def upload_text(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            raise ServiceError("Choose a file to upload.", code="file_required")
        try:
            text, filename = extract_text(upload)
        except FileExtractionError as exc:
            raise ServiceError(str(exc), code="file_unreadable", status_code=400)
        return Response({"text": text, "filename": filename, "characters": len(text)})

    # ---- AI analysis
    @action(detail=True, methods=["post"], throttle_classes=[AnalysisThrottle])
    def analyze(self, request, pk=None):
        meeting = self.get_object()
        run_analysis(meeting, request.user, acknowledged=bool(request.data.get("acknowledge_external_processing")))
        return Response(analysis_bundle(meeting, request), status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "patch"], url_path="analysis")
    def analysis(self, request, pk=None):
        meeting = self.get_object()
        if request.method == "PATCH":  # edit the follow-up draft
            serializer = FollowupSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            latest = meeting.analyses.filter(status="completed").order_by("-version").first()
            if latest is None:
                raise ServiceError("Analyze this meeting before editing the follow-up draft.", code="no_analysis")
            latest.followup_draft = serializer.validated_data["followup_draft"]
            latest.save(update_fields=["followup_draft"])
            log_activity(request.user, "followup.edited", obj=latest, meeting=meeting)
        return Response(analysis_bundle(meeting, request))

    @action(detail=True, methods=["post"], url_path="followup/rebuild")
    def rebuild_followup(self, request, pk=None):
        """Regenerate the follow-up draft from APPROVED records only (no AI call)."""
        meeting = self.get_object()
        latest = meeting.analyses.filter(status="completed").order_by("-version").first()
        if latest is None:
            raise ServiceError("Analyze this meeting first.", code="no_analysis")
        latest.followup_draft = build_followup_draft(meeting, latest.summary, request.user)
        latest.save(update_fields=["followup_draft"])
        return Response(analysis_bundle(meeting, request))

    # ---- bulk approve / reject (approve needs explicit confirmation)
    @action(detail=True, methods=["post"], url_path="review")
    def bulk_review(self, request, pk=None):
        meeting = self.get_object()
        serializer = BulkReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data["action"] == "approve" and not data["confirm"]:
            raise ServiceError(
                "Bulk approval must be confirmed.", code="confirmation_required", status_code=400
            )
        models = {"decision": Decision, "task": Task, "risk": Risk, "question": Question}
        new_status = ReviewStatus.APPROVED if data["action"] == "approve" else ReviewStatus.REJECTED
        changed = 0
        with transaction.atomic():
            for kind, model in models.items():
                ids = [i["id"] for i in data["items"] if i["type"] == kind]
                if ids:
                    # restricting to this meeting also guarantees the user owns every item
                    changed += model.objects.filter(meeting=meeting, id__in=ids).update(review_status=new_status)
        log_activity(request.user, f"bulk.{data['action']}", meeting=meeting, detail=f"{changed} items")
        return Response({"updated": changed, **analysis_bundle(meeting, request)})

    # ---- downloadable meeting report
    @action(detail=True, methods=["get"])
    def report(self, request, pk=None):
        meeting = self.get_object()
        fmt = request.query_params.get("file", "pdf").lower()
        if fmt == "pdf":
            content, mime, ext = render_meeting_pdf(meeting), "application/pdf", "pdf"
        elif fmt == "docx":
            content = render_meeting_docx(meeting)
            mime, ext = "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"
        else:
            raise ServiceError("Report format must be pdf or docx.", code="invalid_format")
        response = HttpResponse(content, content_type=mime)
        response["Content-Disposition"] = f'attachment; filename="meeting-report-{meeting.pk}.{ext}"'
        return response


class ReviewItemViewSet(
    ReviewActionsMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """List / edit / approve / reject extracted records. Items are created by the AI only."""

    model = None
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_queryset(self):
        qs = self.model.objects.filter(meeting__owner=self.request.user).select_related("meeting")
        params = self.request.query_params
        if meeting := params.get("meeting"):
            if meeting.isdigit():
                qs = qs.filter(meeting_id=int(meeting))
        if review := params.get("review_status"):
            qs = qs.filter(review_status__in=review.split(","))
        if search := params.get("search", "").strip():
            qs = qs.filter(text__icontains=search)
        return qs.order_by("-meeting__meeting_date", "id")

    def perform_update(self, serializer):
        item = serializer.save(user_edited=True)
        log_activity(self.request.user, f"{self.activity_name}.edited", obj=item, meeting=item.meeting)


class DecisionViewSet(ReviewItemViewSet):
    model, serializer_class, activity_name = Decision, DecisionSerializer, "decision"


class RiskViewSet(ReviewItemViewSet):
    model, serializer_class, activity_name = Risk, RiskSerializer, "risk"


class QuestionViewSet(ReviewItemViewSet):
    model, serializer_class, activity_name = Question, QuestionSerializer, "question"
