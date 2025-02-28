from django.conf import settings
from django.db import models


class UserTodo(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='user_todo')
    tasks = models.JSONField(default=list)  # Store tasks with due_type, due_date, due_time, etc.

    def __str__(self):
        return f"TODO list for {self.user.username}"


class DailyData(models.Model):
    user_id = models.IntegerField()
    date = models.DateField()

    mood_rating = models.IntegerField(null=True, blank=True)
    productivity_score = models.IntegerField(null=True, blank=True)

    # bed time, wake time, first alarm in a single comma-separated string in this field
    sleep = models.TextField(null=True, blank=True)

    # Now we store each day's habit completions (binary string) for up to 10 habits
    habits_completed = models.TextField(null=True, blank=True)

    thoughts = models.TextField(null=True, blank=True)
    self_reflection = models.TextField(null=True, blank=True)
    hourly_activity_logging = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"DailyData(user={self.user_id}, date={self.date})"

    class Meta:
        unique_together = ("user_id", "date")


class Streak(models.Model):
    user_id = models.IntegerField()
    streak_data = models.JSONField(default=dict)

    def __str__(self):
        return f"Streak for user {self.user_id}"


class MonthlyHabits(models.Model):
    """
    Stores up to 10 habits + a goals text for each user, for a particular year+month.
    We tie them to the user, year, and month. Example usage:
      - user_id=5, year=2025, month=2, goal_text="Get in shape by end of Feb",
        habit_1="Gym", habit_2="Reading", ...
    """
    user_id = models.IntegerField()
    year = models.IntegerField()
    month = models.IntegerField()
    goal_text = models.TextField(blank=True)

    # Up to 10 possible habits for the month
    habit_1 = models.CharField(max_length=100, blank=True)
    habit_2 = models.CharField(max_length=100, blank=True)
    habit_3 = models.CharField(max_length=100, blank=True)
    habit_4 = models.CharField(max_length=100, blank=True)
    habit_5 = models.CharField(max_length=100, blank=True)
    habit_6 = models.CharField(max_length=100, blank=True)
    habit_7 = models.CharField(max_length=100, blank=True)
    habit_8 = models.CharField(max_length=100, blank=True)
    habit_9 = models.CharField(max_length=100, blank=True)
    habit_10 = models.CharField(max_length=100, blank=True)

    class Meta:
        unique_together = ("user_id", "year", "month")

    def __str__(self):
        return f"MonthlyHabits(user={self.user_id}, {self.year}-{self.month:02d})"
