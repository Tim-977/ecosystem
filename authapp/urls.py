from django.urls import path

from .views import (clear_logs_view, confirm_password_before_download_view,
                    delete_account_view, download_user_data_view, login_page,
                    logout_view, settings_view, signup_page, welcome_page)

urlpatterns = [
    path('login/', login_page, name='login'),
    path('logout/', logout_view, name='logout'),
    path('signup/', signup_page, name='signup'),
    path('settings/', settings_view, name='settings'),
    path('settings/clear_logs/', clear_logs_view, name='clear_logs'),
    path('welcome/', welcome_page, name='welcome'),
    path('settings/delete_account/', delete_account_view, name='delete_account'),
    path('settings/download_user_data/', download_user_data_view, name='download_user_data'),
    path('settings/confirm_password_download/', confirm_password_before_download_view, name='confirm_password_download'),
]
