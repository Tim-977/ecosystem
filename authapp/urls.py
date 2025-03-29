from django.urls import path
from .views import login_page, logout_view, signup_page, personal_data_view, settings_view

urlpatterns = [
    path('login/', login_page, name='login'),
    path('logout/', logout_view, name='logout'),
    path('signup/', signup_page, name='signup'),
    path('personal_data/', personal_data_view, name='personal_data'),
    path('settings/', settings_view, name='settings'),
]
