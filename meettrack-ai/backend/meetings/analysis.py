"""
Runs one AI analysis for a meeting and saves the result as DRAFT records.

Safety rules implemented here:
  * the original notes are already saved before this runs, so an AI failure never loses them;
  * the response is validated (services.ai_schema) before anything is stored;
  * records a human has approved or edited are never overwritten or deleted by a re-analysis;
  * records the user rejected stay rejected (the same item is not proposed again).
"""
import logging
import re
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from core.exceptions import ServiceError
from services import ai_provider
from services.ai_prompt import PROMPT_VERSION, SYSTEM_PROMPT, build_user_prompt
from services.ai_schema import AnalysisValidationError, parse_json_text, validate_analysis
from tasks.models import Task

from .activity import log_activity
from .models import PENDING_REVIEW, Decision, Meeting, MeetingAnalysis, Question, Risk
from .serializers import notes_hash

logger = logging.getLogger(__name__)
STALE_LOCK = timedelta(minutes=5)  # an "analyzing" lock older than this is considered abandoned


def _key(text):
    return re.sub(r"[^\w]+", " ", (text or "").lower(), flags=re.UNICODE).strip()


def _acquire_lock(meeting):
    """Atomically mark the meeting as analyzing. Returns False if another analysis is already running."""
    now = timezone.now()
    updated = (
        Meeting.objects.filter(pk=meeting.pk)
        .exclude(analysis_status=Meeting.AnalysisStatus.ANALYZING, analysis_started_at__gt=now - STALE_LOCK)
        .update(analysis_status=Meeting.AnalysisStatus.ANALYZING, analysis_started_at=now)
    )
    return updated == 1


def _record_failure(meeting, version, code, message):
    MeetingAnalysis.objects.create(
        meeting=meeting, version=version, status=MeetingAnalysis.Status.FAILED, error_code=code,
        error_message=message[:500], provider=settings.AI_PROVIDER, model=settings.AI_MODEL,
        prompt_version=PROMPT_VERSION, notes_sha256=notes_hash(meeting.notes),
    )
    Meeting.objects.filter(pk=meeting.pk).update(analysis_status=Meeting.AnalysisStatus.FAILED)


def run_analysis(meeting, user, acknowledged):
    """Analyze `meeting`. Returns the new MeetingAnalysis or raises ServiceError."""
    if not settings.AI_EXTERNAL_PROCESSING_ENABLED:
        raise ServiceError(
            "Sending meeting notes to an external AI provider is disabled by the administrator.",
            code="external_ai_disabled", status_code=403, retryable=False,
        )
    if not ai_provider.is_configured():
        raise ServiceError(
            "The AI provider is not configured yet. Set AI_PROVIDER, AI_API_KEY and AI_MODEL in backend/.env "
            "and restart the backend. Your meeting is saved.",
            code="ai_not_configured", status_code=503, retryable=False,
        )
    if not acknowledged:
        raise ServiceError(
            "Please confirm that you understand the notes will be sent to the external AI provider.",
            code="acknowledgement_required", status_code=400,
        )
    if len(meeting.notes) > settings.AI_MAX_INPUT_CHARS:
        raise ServiceError(
            f"These notes are longer than the {settings.AI_MAX_INPUT_CHARS:,} characters that can be analyzed at once.",
            code="notes_too_long", status_code=400,
        )
    if not _acquire_lock(meeting):
        raise ServiceError(
            "An analysis is already running for this meeting.", code="analysis_in_progress", status_code=409
        )

    version = (meeting.analyses.aggregate(m=Max("version"))["m"] or 0) + 1
    meeting.refresh_from_db()
    try:
        raw_text = ai_provider.call_llm(SYSTEM_PROMPT, build_user_prompt(meeting))
        cleaned = validate_analysis(parse_json_text(raw_text), meeting)
    except ai_provider.AIProviderError as exc:
        _record_failure(meeting, version, exc.code, exc.message)
        raise ServiceError(exc.message, code=exc.code, status_code=exc.http_status, retryable=exc.retryable)
    except AnalysisValidationError as exc:
        _record_failure(meeting, version, "ai_invalid_response", str(exc))
        raise ServiceError(str(exc), code="ai_invalid_response", status_code=422, retryable=True)
    except Exception:  # noqa: BLE001 - never leave the meeting stuck in "analyzing"
        logger.exception("Unexpected analysis failure for meeting %s", meeting.pk)
        _record_failure(meeting, version, "ai_unexpected_error", "Unexpected error during analysis.")
        raise ServiceError("Unexpected error during analysis. Please retry.", code="ai_unexpected_error",
                           status_code=500, retryable=True)

    with transaction.atomic():
        analysis = _save_results(meeting, user, version, cleaned, raw_text)
    log_activity(user, "meeting.analyzed", obj=analysis, meeting=meeting, detail=f"version {version}")
    return analysis


def _save_results(meeting, user, version, cleaned, raw_text):
    analysis = MeetingAnalysis.objects.create(
        meeting=meeting, version=version, status=MeetingAnalysis.Status.COMPLETED, summary=cleaned["summary"],
        followup_draft=cleaned["followup_draft"], provider=settings.AI_PROVIDER, model=settings.AI_MODEL,
        prompt_version=PROMPT_VERSION, notes_sha256=notes_hash(meeting.notes), completed_at=timezone.now(),
        raw_response={"text": raw_text},  # untouched AI output, kept for audit
    )

    # 1) Remove only old, unreviewed AI drafts the user never touched.
    for model in (Decision, Risk, Question):
        model.objects.filter(
            meeting=meeting, analysis__isnull=False, user_edited=False, review_status__in=PENDING_REVIEW
        ).delete()
    Task.objects.filter(
        meeting=meeting, analysis__isnull=False, user_edited=False, review_status__in=PENDING_REVIEW
    ).delete()

    # 2) Create new drafts, skipping anything that matches a record that survived (approved/edited/rejected).
    existing = {
        Decision: {_key(d.text) for d in meeting.decisions.all()},
        Risk: {_key(r.text) for r in meeting.risks.all()},
        Question: {_key(q.text) for q in meeting.questions.all()},
        Task: {_key(t.title) for t in meeting.tasks.all()},
    }
    decisions_by_key = {_key(d.text): d for d in meeting.decisions.all()}

    for item in cleaned["decisions"]:
        if _key(item["text"]) in existing[Decision]:
            continue
        decision = Decision.objects.create(meeting=meeting, analysis=analysis, **item)
        decisions_by_key[_key(decision.text)] = decision
        existing[Decision].add(_key(decision.text))

    for item in cleaned["risks"]:
        if _key(item["text"]) not in existing[Risk]:
            Risk.objects.create(meeting=meeting, analysis=analysis, **item)
            existing[Risk].add(_key(item["text"]))

    for item in cleaned["questions"]:
        if _key(item["text"]) not in existing[Question]:
            Question.objects.create(meeting=meeting, analysis=analysis, **item)
            existing[Question].add(_key(item["text"]))

    for item in cleaned["tasks"]:
        if _key(item["title"]) in existing[Task]:
            continue
        related = _key(item.pop("related_decision", ""))
        decision = decisions_by_key.get(related)
        if decision is None and len(related) >= 12:
            decision = next((d for k, d in decisions_by_key.items() if related in k or k in related), None)
        Task.objects.create(user=user, meeting=meeting, analysis=analysis, decision=decision, **item)
        existing[Task].add(_key(item["title"]))

    Meeting.objects.filter(pk=meeting.pk).update(analysis_status=Meeting.AnalysisStatus.COMPLETED)
    return analysis
