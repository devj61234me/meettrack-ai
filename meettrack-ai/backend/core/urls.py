from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from .views import config_view, health_view

admin_url = getattr(settings, "ADMIN_URL", "admin/")

urlpatterns = [
    path(admin_url, admin.site.urls),
    path("api/health/", health_view),
    path("api/config/", config_view),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("meetings.urls")),
    path("api/", include("tasks.urls")),
    path("api/", include("reports.urls")),
]
