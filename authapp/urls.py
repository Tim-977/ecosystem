from django.urls import path
from .views import login_page, signup_page

urlpatterns = [
    path('login/', login_page, name='login_page'),
    path('signup/', signup_page, name='signup_page'),
]
