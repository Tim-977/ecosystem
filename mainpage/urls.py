from django.urls import path

from .views import (activity_config_view, add_todo_task, day_view,
                    delete_todo_task, get_activities, get_todo_tasks,
                    main_page_view, set_habits_view,
                    update_todo_task, month_view, diary_view, get_activities, year_view)

urlpatterns = [
    path('', main_page_view, name='main_page'),
    path('day/<int:year>/<int:month>/<int:day>/', day_view, name='day_view'),
    path('habits/<int:year>/<int:month>/', set_habits_view, name='set_habits'),
    path('api/todo/', get_todo_tasks, name='get_todo_tasks'),
    path('api/todo/add/', add_todo_task, name='add_todo_task'),
    path('api/todo/<int:task_id>/update/', update_todo_task, name='update_todo_task'),
    path('api/todo/<int:task_id>/delete/', delete_todo_task, name='delete_todo_task'),
    path('activities/<int:year>/<int:month>/', activity_config_view, name='activity_config_view'),
    path('api/activities/', get_activities, name='get_activities'),
    path('get_activities/', get_activities, name='get_activities'),
    path('month/<int:year>/<int:month>/', month_view, name='month_view'),
    path('diary/<int:year>/<int:month>/', diary_view, name='diary_view'),
    path('year/<int:year>/', year_view, name="year_statistics"),
]
