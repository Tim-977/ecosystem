from django.urls import path
from . import views

urlpatterns = [
    path('render_test/', views.render_test, name='render_test'),
]
