from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/stats/", views.dashboard_stats),
    path("reports/questions/export/", views.questions_export),
]
