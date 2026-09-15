from django.urls import path

from .views import landing_page, onboarding_view

urlpatterns = [
    path('landing/', landing_page, name='landing'),
    path('start/', onboarding_view, name='onboarding'),
]
