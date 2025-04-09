import os
import django
import random
import json
import calendar
from datetime import date, datetime, time, timedelta

# Point to your Django settings:
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ecosystem.settings")
django.setup()

from mainpage.models import DailyData, MonthlyHabits

# ----------------------------- #
#          ~~ CONFIG ~~         #
# ----------------------------- #
USER_ID = 2                     #
YEAR = 2025                     #
MONTH = 4                       #
END_DAY = 8                     #
#                               #
#                               #
# ----------------------------- #

from mainpage.models import DailyData, MonthlyHabits


def seed_data_for_user(user_id, year, month, end_day):
    # Figure out how many days are in the given month
    days_in_month = calendar.monthrange(year, month)[1]
    if end_day == 0 or end_day > days_in_month:
        end_day = days_in_month

    # Clear existing DailyData for this user in [year-month]
    DailyData.objects.filter(
        user_id=user_id,
        date__year=year,
        date__month=month
    ).delete()

    # Create or update MonthlyHabits
    monthly_obj, _ = MonthlyHabits.objects.get_or_create(
        user_id=user_id,
        year=year,
        month=month
    )
    # Sample habits (edit as desired)
    monthly_obj.habit_1 = "Exercise"
    monthly_obj.habit_2 = "Read 20 pages"
    monthly_obj.habit_3 = "Write code"
    monthly_obj.habit_4 = "Meditate"
    monthly_obj.habit_5 = "Practice algorithms"
    monthly_obj.habit_6 = "Drink enough water"
    monthly_obj.habit_7 = "Take breaks"
    monthly_obj.habit_8 = "Sleep before midnight"
    monthly_obj.habit_9 = "Review lecture notes"
    monthly_obj.habit_10 = "Cook at home"
    monthly_obj.goal_text = "Focus"
    monthly_obj.save()

    start_date = date(year, month, 1)
    thoughts_pool = [
        "Spent time coding and debugging.",
        "Reviewed algorithms and data structures.",
        "Watched some online tech tutorials.",
        "Worked on group project for class.",
        "Attended an AI seminar."
    ]
    reflection_pool = [
        "Feeling more confident about upcoming exams.",
        "Need better time management.",
        "Next goal: practice more coding exercises.",
        "Want to explore new frameworks.",
        "Should try pair programming."
    ]
    
    from mainpage.models import ActivityMapping

    activity_queryset = ActivityMapping.objects.filter(user_id=user_id)
    activity_ids = [a.id for a in activity_queryset]

    if not activity_ids:
        raise Exception(f"No activities found for user_id={user_id}. Add some via the activity config page first.")


    def time_str(t: time):
        """Convert a time object to HHMM string (e.g. 22:30 => '2230')."""
        return f"{t.hour:02d}{t.minute:02d}"

    for day_num in range(1, end_day + 1):
        current_date = date(year, month, day_num)

        # Create or update DailyData
        daily_obj, _ = DailyData.objects.get_or_create(
            user_id=user_id,
            date=current_date
        )

        # Mood & Productivity in [3..8]
        daily_obj.mood_rating = random.randint(3, 8)
        daily_obj.productivity_score = random.randint(3, 8)

        # Random bed/wake/alarm times
        bed_hour = random.randint(22, 23)
        bed_min = random.choice([0, 30])
        bed_time = time(bed_hour, bed_min)

        wake_hour = random.randint(6, 9)
        wake_min = random.choice([0, 30])
        wake_time = time(wake_hour, wake_min)

        alarm_hour = random.randint(5, 7)
        alarm_min = random.choice([0, 30])
        alarm_time = time(alarm_hour, alarm_min)

        daily_obj.sleep = f"{time_str(bed_time)},{time_str(wake_time)},{time_str(alarm_time)},"

        # Random 10-bit habits_completed
        habit_bits = "".join(str(random.randint(0, 1)) for _ in range(10))
        daily_obj.habits_completed = habit_bits

        # Thoughts & reflection
        daily_obj.thoughts = random.choice(thoughts_pool)
        daily_obj.self_reflection = random.choice(reflection_pool)

        # Hourly activity logging: random activity for each of 24 hours
        hour_list = []
        for h in range(24):
            act_id = random.choice(activity_ids)
            # act_id = 3 if h % 2 == 0 else 13
            hour_list.append({
                "hour": h,
                "activity": act_id
            })
        daily_obj.hourly_activity_logging = json.dumps(hour_list)

        daily_obj.save()

    print(f"Generated data from {year}-{month:02d}-01 to {year}-{month:02d}-{end_day:02d} for user_id={user_id}.")


seed_data_for_user(USER_ID, YEAR, MONTH, END_DAY)
