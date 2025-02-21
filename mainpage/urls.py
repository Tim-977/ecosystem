from django.urls import path

from .views import day_view, main_page_view, set_habits_view, monthly_stats_view

urlpatterns = [
    path('', main_page_view, name='main_page'),
    path('day/<int:year>/<int:month>/<int:day>/', day_view, name='day_view'),
    path('set-habits/', set_habits_view, name='set_habits'),
    path('monthly-stats/', monthly_stats_view, name='monthly_stats_view'),
]
