from django.urls import path
from .views import login_page, logout_view, signup_page, settings_view, clear_logs_view

urlpatterns = [
    path('login/', login_page, name='login'),
    path('logout/', logout_view, name='logout'),
    path('signup/', signup_page, name='signup'),
    path('settings/', settings_view, name='settings'),
    path('settings/clear_logs/', clear_logs_view, name='clear_logs'),
]
