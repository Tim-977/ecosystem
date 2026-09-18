from django.urls import path

from .views import (clear_logs_view, confirm_password_before_download_view,
                    delete_account_view, download_user_data_view, login_page,
                    logout_view, rating_format_view, settings_view, signup_page,
                    tour_state_view,
                    developer_info_view, changelog_view, license_view, feedback_view)

urlpatterns = [
    path('login/', login_page, name='login'),
    path('logout/', logout_view, name='logout'),
    path('signup/', signup_page, name='signup'),
    path('tour/state/', tour_state_view, name='tour_state'),
    path('settings/', settings_view, name='settings'),
    path('settings/rating-format/', rating_format_view, name='rating_format'),
    path('settings/clear_logs/', clear_logs_view, name='clear_logs'),
    path('settings/delete_account/', delete_account_view, name='delete_account'),
    path('settings/download_user_data/', download_user_data_view, name='download_user_data'),
    path('settings/confirm_password_download/', confirm_password_before_download_view, name='confirm_password_download'),
    path('settings/developer_info/', developer_info_view, name='developer_info'),
    path('settings/changelog/', changelog_view, name='changelog'),
    path('settings/license/', license_view, name='license'),
    path('setting/feedback/', feedback_view, name='feedback')
]
