from django.db import models

class DailyData(models.Model):
    user_id = models.IntegerField()
    date = models.DateField()

    mood_rating = models.IntegerField(null=True, blank=True)
    productivity_score = models.IntegerField(null=True, blank=True)

    # bed time, wake time, first alarm in a single comma-separated string in this field
    sleep = models.TextField(null=True, blank=True)

    habits_completed = models.TextField(null=True, blank=True)
    thoughts = models.TextField(null=True, blank=True)
    self_reflection = models.TextField(null=True, blank=True)
    hourly_activity_logging = models.TextField(null=True, blank=True)
    todo = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"DailyData(user={self.user_id}, date={self.date})"

    class Meta:
        unique_together = ("user_id", "date")


class Streak(models.Model):
    user_id = models.IntegerField()
    streak_data = models.JSONField(default=dict)

    def __str__(self):
        return f"Streak for user {self.user_id}"
