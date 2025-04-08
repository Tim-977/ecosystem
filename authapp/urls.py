from django.urls import path
from .views import login_page, logout_view, signup_page, settings_view, clear_logs_view, welcome_page, delete_account_view, download_user_data_view

urlpatterns = [
    path('login/', login_page, name='login'),
    path('logout/', logout_view, name='logout'),
    path('signup/', signup_page, name='signup'),
    path('settings/', settings_view, name='settings'),
    path('settings/clear_logs/', clear_logs_view, name='clear_logs'),
    path('welcome/', welcome_page, name='welcome'),
    path('settings/delete_account/', delete_account_view, name='delete_account'),
    path('settings/download_user_data/', download_user_data_view, name='download_user_data'),
]
