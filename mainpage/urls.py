from django.urls import path
from .views import main_page_view, day_view

urlpatterns = [
    path('', main_page_view, name='main_page'),
    path('day/<int:year>/<int:month>/<int:day>/', day_view, name='day_view'),
]
