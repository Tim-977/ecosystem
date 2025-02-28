from django.urls import path

from .views import add_todo_task, day_view, delete_todo_task, get_todo_tasks, main_page_view, monthly_stats_view, set_habits_view, update_todo_task

urlpatterns = [
    path('', main_page_view, name='main_page'),
    path('day/<int:year>/<int:month>/<int:day>/', day_view, name='day_view'),
    path('set-habits/', set_habits_view, name='set_habits'),
    path('monthly-stats/', monthly_stats_view, name='monthly_stats_view'),

    path('api/todo/', get_todo_tasks, name='get_todo_tasks'),
    path('api/todo/add/', add_todo_task, name='add_todo_task'),
    path('api/todo/<int:task_id>/update/', update_todo_task, name='update_todo_task'),
    path('api/todo/<int:task_id>/delete/', delete_todo_task, name='delete_todo_task'),
]
