import hashlib

from django.conf import settings
from rest_framework import serializers

from .models import Decision, Meeting, MeetingAnalysis, Question, Risk


def notes_hash(text):
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


class MeetingListSerializer(serializers.ModelSerializer):
    approved_task_count = serializers.IntegerField(read_only=True)
    pending_review_count = serializers.IntegerField(read_only=True)
    review_status = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            "id", "title", "client_name", "meeting_date", "analysis_status", "review_status",
            "approved_task_count", "pending_review_count", "created_at", "updated_at",
        ]

    def get_review_status(self, obj):
        """Single label the UI shows: not_analyzed / analyzing / failed / needs_review / reviewed."""
        if obj.analysis_status != Meeting.AnalysisStatus.COMPLETED:
            return obj.analysis_status
        return "needs_review" if obj.pending_review_count else "reviewed"


class MeetingDetailSerializer(MeetingListSerializer):
    notes_locked = serializers.SerializerMethodField()
    notes_changed_since_analysis = serializers.SerializerMethodField()

    class Meta(MeetingListSerializer.Meta):
        fields = MeetingListSerializer.Meta.fields + [
            "participants", "notes", "source_filename", "notes_locked", "notes_changed_since_analysis",
        ]

    def _latest_completed(self, obj):
        return obj.analyses.filter(status=MeetingAnalysis.Status.COMPLETED).order_by("-version").first()

    def get_notes_locked(self, obj):
        return self._latest_completed(obj) is not None

    def get_notes_changed_since_analysis(self, obj):
        latest = self._latest_completed(obj)
        return bool(latest and latest.notes_sha256 and latest.notes_sha256 != notes_hash(obj.notes))


class MeetingWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Meeting
        fields = ["title", "client_name", "meeting_date", "participants", "notes", "source_filename"]
        extra_kwargs = {
            "client_name": {"required": False, "allow_blank": True},
            "participants": {"required": False, "allow_blank": True},
            "source_filename": {"required": False, "allow_blank": True},
        }

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Meeting title is required.")
        return value

    def validate_notes(self, value):
        value = value.replace("\x00", "").strip()
        if len(value) < 20:
            raise serializers.ValidationError("Meeting notes are too short to analyze (minimum 20 characters).")
        if len(value) > settings.MAX_NOTES_CHARS:
            raise serializers.ValidationError(
                f"Meeting notes are too long (maximum {settings.MAX_NOTES_CHARS:,} characters)."
            )
        return value

    def validate(self, attrs):
        # Evidence excerpts point into the notes, so notes are frozen once an analysis has completed.
        if self.instance and "notes" in attrs and attrs["notes"] != self.instance.notes:
            if self.instance.analyses.filter(status=MeetingAnalysis.Status.COMPLETED).exists():
                raise serializers.ValidationError(
                    {"notes": "Notes are locked after analysis so source excerpts stay accurate. "
                              "Create a new meeting to analyze different notes."}
                )
        return attrs


class MeetingAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeetingAnalysis
        fields = [
            "id", "version", "status", "summary", "followup_draft", "provider", "model", "prompt_version",
            "error_code", "error_message", "created_at", "completed_at",
        ]
        read_only_fields = fields


class _ReviewSerializer(serializers.ModelSerializer):
    meeting_title = serializers.CharField(source="meeting.title", read_only=True)


class DecisionSerializer(_ReviewSerializer):
    class Meta:
        model = Decision
        fields = [
            "id", "meeting", "meeting_title", "text", "topic", "certainty", "evidence",
            "review_status", "review_note", "user_edited", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "meeting", "evidence", "review_status", "review_note", "user_edited"]


class RiskSerializer(_ReviewSerializer):
    class Meta:
        model = Risk
        fields = [
            "id", "meeting", "meeting_title", "text", "risk_type", "evidence",
            "review_status", "review_note", "user_edited", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "meeting", "evidence", "review_status", "review_note", "user_edited"]


class QuestionSerializer(_ReviewSerializer):
    class Meta:
        model = Question
        fields = [
            "id", "meeting", "meeting_title", "text", "reason", "related_item", "suggested_contact", "evidence",
            "review_status", "review_note", "user_edited", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "meeting", "evidence", "review_status", "review_note", "user_edited"]

    def validate_text(self, value):
        if not value.strip():
            raise serializers.ValidationError("This field cannot be blank.")
        return value.strip()


class BulkReviewSerializer(serializers.Serializer):
    class ItemSerializer(serializers.Serializer):
        type = serializers.ChoiceField(choices=["decision", "task", "risk", "question"])
        id = serializers.IntegerField()

    action = serializers.ChoiceField(choices=["approve", "reject"])
    items = ItemSerializer(many=True, allow_empty=False, max_length=300)
    confirm = serializers.BooleanField(required=False, default=False)


class FollowupSerializer(serializers.Serializer):
    followup_draft = serializers.CharField(allow_blank=True, max_length=8000)
