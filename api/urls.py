"""Mobile API v1. See ecosystem-mobile/docs/API.md for request/response shapes."""
from django.urls import path, register_converter

from . import views
from .converters import IsoDateConverter

register_converter(IsoDateConverter, 'isodate')

app_name = 'api'

urlpatterns = [
    path('health/', views.HealthView.as_view(), name='health'),

    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/signup/', views.SignupView.as_view(), name='signup'),
    path('auth/refresh/', views.RefreshView.as_view(), name='refresh'),
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),

    path('me/', views.MeView.as_view(), name='me'),
    path('me/onboarding/', views.OnboardingView.as_view(), name='onboarding'),

    path('days/<isodate:day>/', views.DayView.as_view(), name='day'),
    path('calendar/<int:year>/<int:month>/', views.CalendarView.as_view(), name='calendar'),

    path('activities/', views.ActivityListView.as_view(), name='activities'),
    path('activities/<int:pk>/', views.ActivityDetailView.as_view(), name='activity'),

    path('tasks/', views.TaskListView.as_view(), name='tasks'),
    path('tasks/<int:pk>/', views.TaskDetailView.as_view(), name='task'),

    path('habits/<int:year>/<int:month>/', views.HabitsView.as_view(), name='habits'),
    path('habits/<int:year>/<int:month>/clear/', views.HabitClearView.as_view(), name='habit_clear'),

    path('journal/<int:year>/<int:month>/', views.JournalView.as_view(), name='journal'),

    path('insights/overview/', views.OverviewView.as_view(), name='overview'),
    path('insights/month/<int:year>/<int:month>/', views.MonthInsightsView.as_view(), name='insights_month'),
    path('insights/year/<int:year>/', views.YearInsightsView.as_view(), name='insights_year'),

    path('account/export/', views.ExportView.as_view(), name='export'),
    path('account/clear-logs/', views.ClearLogsView.as_view(), name='clear_logs'),
    path('account/delete/', views.DeleteAccountView.as_view(), name='delete_account'),
]
