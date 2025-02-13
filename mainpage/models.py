# mainpage/models.py

from django.db import models
from django.db.models import JSONField  # For Django 3.1+; or use models.JSONField

class DailyData(models.Model):
    user_id = models.IntegerField()
    date = models.DateField()

    mood_rating = models.IntegerField(null=True, blank=True)
    productivity_score = models.IntegerField(null=True, blank=True)

    sleep = models.TextField(null=True, blank=True)               # Was sleep_info
    habits_completed = models.TextField(null=True, blank=True)    # Was habits
    thoughts = models.TextField(null=True, blank=True)            # Unchanged
    self_reflection = models.TextField(null=True, blank=True)     # New field
    hourly_activity_logging = models.TextField(null=True, blank=True)  # Was hourly_activity
    todo = models.TextField(null=True, blank=True)                # New field

    def __str__(self):
        return f"DailyData(user={self.user_id}, date={self.date})"

    class Meta:
        unique_together = ("user_id", "date")  # Ensure only one record per user per date


class Streak(models.Model):
    user_id = models.IntegerField()
    # A JSONField to store: current_streak, longest_streak, last_activity_date
    streak_data = models.JSONField(default=dict)

    def __str__(self):
        return f"Streak for user {self.user_id}"
