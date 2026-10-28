from django.conf import settings
from django.db import models


class ReviewStatus(models.TextChoices):
    DRAFT = "draft", "AI Draft"
    NEEDS_CONFIRMATION = "needs_confirmation", "Needs Confirmation"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


PENDING_REVIEW = [ReviewStatus.DRAFT, ReviewStatus.NEEDS_CONFIRMATION]


class Meeting(models.Model):
    class AnalysisStatus(models.TextChoices):
        NOT_ANALYZED = "not_analyzed", "Not analyzed"
        ANALYZING = "analyzing", "Analyzing"
        COMPLETED = "completed", "Analyzed"
        FAILED = "failed", "Analysis failed"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="meetings")
    title = models.CharField(max_length=200)
    client_name = models.CharField(max_length=200, blank=True)
    meeting_date = models.DateField()
    participants = models.TextField(blank=True, max_length=2000)
    notes = models.TextField()  # original notes; locked once an analysis has completed
    source_filename = models.CharField(max_length=255, blank=True)
    analysis_status = models.CharField(
        max_length=20, choices=AnalysisStatus.choices, default=AnalysisStatus.NOT_ANALYZED
    )
    analysis_started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-meeting_date", "-id"]
        indexes = [
            models.Index(fields=["owner", "-meeting_date"]),
            models.Index(fields=["owner", "analysis_status"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.meeting_date})"


class MeetingAnalysis(models.Model):
    """One AI analysis attempt. Kept for auditability (raw model output is stored)."""

    class Status(models.TextChoices):
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="analyses")
    version = models.PositiveIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices)
    summary = models.TextField(blank=True)
    followup_draft = models.TextField(blank=True)  # editable by the user
    provider = models.CharField(max_length=40, blank=True)
    model = models.CharField(max_length=100, blank=True)
    prompt_version = models.CharField(max_length=20, blank=True)
    notes_sha256 = models.CharField(max_length=64, blank=True)  # detects notes changed after analysis
    raw_response = models.JSONField(null=True, blank=True)  # draft AI output, untouched
    error_code = models.CharField(max_length=40, blank=True)
    error_message = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["meeting", "version"], name="uniq_analysis_version")]

    def __str__(self):
        return f"Analysis v{self.version} of meeting {self.meeting_id} ({self.status})"


class ReviewableModel(models.Model):
    """Common fields for everything the AI extracts and a human reviews."""

    review_status = models.CharField(
        max_length=20, choices=ReviewStatus.choices, default=ReviewStatus.DRAFT, db_index=True
    )
    review_note = models.CharField(max_length=500, blank=True)  # why the item needs confirmation
    user_edited = models.BooleanField(default=False)
    evidence = models.TextField(blank=True)  # verbatim excerpt from the meeting notes
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Decision(ReviewableModel):
    class Certainty(models.TextChoices):
        CONFIRMED = "confirmed", "Confirmed"
        TENTATIVE = "tentative", "Tentative"

    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="decisions")
    analysis = models.ForeignKey(MeetingAnalysis, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    text = models.TextField()
    topic = models.CharField(max_length=200, blank=True)
    certainty = models.CharField(max_length=12, choices=Certainty.choices, default=Certainty.TENTATIVE)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["meeting", "review_status"])]


class Risk(ReviewableModel):
    class RiskType(models.TextChoices):
        EXPLICIT = "explicit", "Stated in meeting"
        INFERRED = "inferred", "Inferred by AI"
        DEPENDENCY = "dependency", "Dependency"
        BLOCKER = "blocker", "Blocker"

    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="risks")
    analysis = models.ForeignKey(MeetingAnalysis, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    text = models.TextField()
    risk_type = models.CharField(max_length=12, choices=RiskType.choices, default=RiskType.EXPLICIT)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["meeting", "review_status"])]


class Question(ReviewableModel):
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="questions")
    analysis = models.ForeignKey(MeetingAnalysis, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    text = models.TextField()
    reason = models.TextField(blank=True)
    related_item = models.CharField(max_length=300, blank=True)
    suggested_contact = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["meeting", "review_status"])]


class ActivityLog(models.Model):
    """Audit trail of important events. Stores ids and short labels, never meeting text."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="activity")
    meeting = models.ForeignKey(Meeting, on_delete=models.SET_NULL, null=True, blank=True, related_name="activity")
    action = models.CharField(max_length=60)
    object_type = models.CharField(max_length=40, blank=True)
    object_id = models.PositiveBigIntegerField(null=True, blank=True)
    detail = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]
