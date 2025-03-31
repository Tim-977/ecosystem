from django.urls import path
from .views import login_page, logout_view, signup_page, settings_view

urlpatterns = [
    path('login/', login_page, name='login'),
    path('logout/', logout_view, name='logout'),
    path('signup/', signup_page, name='signup'),
    path('settings/', settings_view, name='settings'),
]
