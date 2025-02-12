# mainpage/models.py
'''
from django.db import models
from django.utils import timezone

# If you have a User model from django.contrib.auth, you could do:
# from django.contrib.auth.models import User
# and use user = models.ForeignKey(User, on_delete=models.CASCADE)
# but here we'll just store an integer user_id for demonstration.

# 1) TODO Table
#    - Stores your entire TODO JSON ("tasks": [...]) in a JSONField,
#      plus a user_id to filter which user it belongs to.
class Todo(models.Model):
    user_id = models.IntegerField()
    # If you also want to associate tasks with a specific day, add a date field:
    # date = models.DateField(null=True, blank=True)
    todo_json = models.JSONField()  # Django 3.1+ has a built-in JSONField

    def __str__(self):
        return f"Todo(user_id={self.user_id})"


# 2) Hourly Activity (HAL)
#    - Typically includes a date plus big JSON with hour logs & activity mappings
#    - Example structure from your spec:
#      {
#         "date": "2025-02-10",
#         "hourly_log": [ { "hour": 0, "activity": 2 }, ... ],
#         "activity_mappings": { "1": {"color": "...", "name": "..."} }
#      }
class HourlyActivity(models.Model):
    user_id = models.IntegerField()
    date = models.DateField()
    hal_json = models.JSONField()

    def __str__(self):
        return f"HourlyActivity(user_id={self.user_id}, date={self.date})"


# 3) Streak Table
#    - Usually 1 row per user if you just track one ongoing streak, or multiple
#      if you want historical records. The JSON might look like:
#      {
#        "user_id": 1,
#        "streak_data": {
#          "current_streak": 5,
#          "longest_streak": 12,
#          "last_activity_date": "2025-02-09"
#        }
#      }
class Streak(models.Model):
    user_id = models.IntegerField()
    streak_json = models.JSONField()

    def __str__(self):
        return f"Streak(user_id={self.user_id})"


# 4) Thoughts & Reflections
#    - Typically 1 row per user per day.
#    - The JSON might look like:
#      {
#        "user_id": 1,
#        "date": "2025-02-10",
#        "thoughts_and_reflections": {
#          "brief_thoughts": "...",
#          "deep_reflections": "..."
#        }
#      }
class ThoughtsAndReflections(models.Model):
    user_id = models.IntegerField()
    date = models.DateField()
    t_and_r_json = models.JSONField()

    def __str__(self):
        return f"Thoughts(user_id={self.user_id}, date={self.date})"


# 5) Sleep
#    - Possibly 1 row per user per day, storing your sleep_data JSON:
#      {
#        "user_id": 1,
#        "sleep_data": {
#          "bed_time": "22:30:00",
#          "wake_up_time": "06:30:00",
#          "first_alarm_time": "06:00:00"
#        }
#      }
class SleepLog(models.Model):
    user_id = models.IntegerField()
    date = models.DateField(null=True, blank=True)
    sleep_json = models.JSONField()

    def __str__(self):
        return f"SleepLog(user_id={self.user_id}, date={self.date})"


# 6) Habits Log
#    - 1 row per user per day, with JSON:
#      {
#        "user_id": 1,
#        "date": "2025-02-10",
#        "habits_log": [
#           { "habit_name": "Exercise", "status": "completed" },
#           ...
#        ]
#      }
class HabitsLog(models.Model):
    user_id = models.IntegerField()
    date = models.DateField()
    habits_json = models.JSONField()

    def __str__(self):
        return f"HabitsLog(user_id={self.user_id}, date={self.date})"


# 7) Mood (no JSON needed, just an int)
#    - 1 row per user per day with an integer rating
class Mood(models.Model):
    user_id = models.IntegerField()
    date = models.DateField()
    mood_rating = models.IntegerField()

    def __str__(self):
        return f"Mood(user_id={self.user_id}, date={self.date}, rating={self.mood_rating})"


# 8) Productivity (no JSON needed, just an int)
#    - 1 row per user per day with an integer productivity score
class Productivity(models.Model):
    user_id = models.IntegerField()
    date = models.DateField()
    productivity_score = models.IntegerField()

    def __str__(self):
        return f"Productivity(user_id={self.user_id}, date={self.date}, score={self.productivity_score})"
'''

from django.db import models

class DailyData(models.Model):
    user_id = models.IntegerField()
    date = models.DateField()

    mood_rating = models.IntegerField(null=True, blank=True)
    productivity_score = models.IntegerField(null=True, blank=True)

    # You can store longer text in these fields
    habits = models.TextField(null=True, blank=True)
    hourly_activity = models.TextField(null=True, blank=True)
    sleep_info = models.TextField(null=True, blank=True)
    thoughts = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"DailyData(user={self.user_id}, date={self.date})"

    class Meta:
        # If you want to ensure only one (user_id, date) row, use a unique constraint:
        unique_together = ("user_id", "date")
