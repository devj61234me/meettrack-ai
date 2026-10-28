from .models import ActivityLog


def log_activity(user, action, obj=None, meeting=None, detail=""):
    """Record an audit event. Only ids and short labels are stored, never meeting contents."""
    ActivityLog.objects.create(
        user=user,
        meeting=meeting if meeting is not None and getattr(meeting, "pk", None) else None,
        action=action,
        object_type=obj.__class__.__name__.lower() if obj is not None else "",
        object_id=getattr(obj, "pk", None) if obj is not None else None,
        detail=detail[:255],
    )
