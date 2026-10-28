from django.contrib import admin

from .models import ActivityLog, Decision, Meeting, MeetingAnalysis, Question, Risk

for model in (Meeting, MeetingAnalysis, Decision, Risk, Question, ActivityLog):
    admin.site.register(model)
