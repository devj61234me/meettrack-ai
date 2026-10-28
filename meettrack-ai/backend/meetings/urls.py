from rest_framework.routers import DefaultRouter

from .views import DecisionViewSet, MeetingViewSet, QuestionViewSet, RiskViewSet

router = DefaultRouter()
router.register("meetings", MeetingViewSet, basename="meeting")
router.register("decisions", DecisionViewSet, basename="decision")
router.register("risks", RiskViewSet, basename="risk")
router.register("questions", QuestionViewSet, basename="question")
urlpatterns = router.urls
