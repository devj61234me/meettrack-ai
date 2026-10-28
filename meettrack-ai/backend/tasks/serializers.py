from rest_framework import serializers

from meetings.models import Meeting, ReviewStatus

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    meeting_title = serializers.CharField(source="meeting.title", read_only=True, default=None)
    meeting_date = serializers.DateField(source="meeting.meeting_date", read_only=True, default=None)
    is_overdue = serializers.BooleanField(read_only=True)
    meeting = serializers.PrimaryKeyRelatedField(queryset=Meeting.objects.none(), required=False, allow_null=True)

    class Meta:
        model = Task
        fields = [
            "id", "title", "description", "meeting", "meeting_title", "meeting_date", "owner_name", "due_date",
            "deadline_note", "priority", "status", "review_status", "review_note", "dependencies", "evidence",
            "user_edited", "is_overdue", "completed_at", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "review_status", "review_note", "evidence", "user_edited", "completed_at"]
        extra_kwargs = {
            "owner_name": {"allow_null": True, "required": False, "allow_blank": True},
            "priority": {"allow_null": True, "required": False},
            "description": {"required": False, "allow_blank": True},
            "dependencies": {"required": False, "allow_blank": True},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            # A user can only link tasks to their own meetings (object-level isolation).
            self.fields["meeting"].queryset = Meeting.objects.filter(owner=request.user)

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Task title is required.")
        return value

    def validate_owner_name(self, value):
        value = (value or "").strip()
        return value or None  # empty means "not specified" -> NULL, never an empty string

    def validate(self, attrs):
        instance = self.instance
        if instance and "status" in attrs and attrs["status"] != instance.status:
            if instance.review_status != ReviewStatus.APPROVED:
                raise serializers.ValidationError(
                    {"status": "Approve this task before tracking its status."}
                )
        return attrs
