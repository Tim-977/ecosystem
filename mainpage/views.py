from datetime import timedelta, date
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect
from django.utils.timezone import now

from .models import DailyData, Streak


@login_required
def main_page_view(request):
    # Fetch all logs for the current user
    all_data = DailyData.objects.filter(user_id=request.user.id).order_by('-date')

    # Fetch or create the user's streak data
    streak_obj, _ = Streak.objects.get_or_create(user_id=request.user.id)
    streak_data = streak_obj.streak_data or {}

    # Get server time (UTC by default if USE_TZ=True in settings)
    server_time = now()

    context = {
        "all_data": all_data,
        "username": request.user.username,
        "current_streak": streak_data.get("current_streak", 0),
        "longest_streak": streak_data.get("longest_streak", 0),
        "server_time": server_time,
    }
    return render(request, 'mainpage/main.html', context)


@login_required
def day_view(request, year, month, day):
    # Convert the URL path into a Python date
    current_date = date(year, month, day)

    # Prevent logging future dates
    today = date.today()
    if current_date > today:
        messages.error(request, "You cannot create or edit logs for future dates.")
        return redirect('main_page')

    # Get or create a daily log for that date
    daily_obj, _ = DailyData.objects.get_or_create(
        user_id=request.user.id,
        date=current_date
    )

    if request.method == 'POST':
        daily_obj.mood_rating = request.POST.get('mood_rating') or None
        daily_obj.productivity_score = request.POST.get('productivity_score') or None
        
        # Retrieve the three time inputs
        bed_time_input = request.POST.get('bed_time', '')       # e.g. "21:50"
        wake_up_time_input = request.POST.get('wake_up_time', '')  # e.g. "06:45"
        first_alarm_time_input = request.POST.get('first_alarm_time', '')  # e.g. "06:30"

        # Remove the colon to match your desired format (e.g. "2150")
        bed_time_str = bed_time_input.replace(':', '')
        wake_up_time_str = wake_up_time_input.replace(':', '')
        first_alarm_time_str = first_alarm_time_input.replace(':', '')

        # Store them comma-separated in the same field, with a trailing comma
        daily_obj.sleep = f"{bed_time_str},{wake_up_time_str},{first_alarm_time_str},"

        # The rest of the fields remain as before
        daily_obj.habits_completed = request.POST.get('habits_completed')
        daily_obj.thoughts = request.POST.get('thoughts')
        daily_obj.self_reflection = request.POST.get('self_reflection')
        daily_obj.hourly_activity_logging = request.POST.get('hourly_activity_logging')
        daily_obj.todo = request.POST.get('todo')
        daily_obj.save()

        # Update the streak
        _update_streak(request.user.id, current_date)

        return redirect('day_view', year=year, month=month, day=day)

    # If GET request, parse existing sleep data so we can show it in the form
    # The format is "HHMM,HHMM,HHMM," -> e.g. "2150,0645,0630,"
    sleep_data = daily_obj.sleep or ""
    splitted = sleep_data.split(',')

    def readd_colon(t):
        """
        Insert a colon to convert '2150' -> '21:50' or '0645' -> '06:45'.
        Returns the original string if it's not exactly 4 digits.
        """
        t = t.strip()
        if len(t) == 4:
            return t[:2] + ":" + t[2:]
        elif len(t) == 3:
            # e.g. '630' -> '06:30'
            return "0" + t[0] + ":" + t[1:]
        return t  # If blank or unexpected length, leave as-is

    bed_time_form = readd_colon(splitted[0]) if len(splitted) > 0 else ''
    wake_up_time_form = readd_colon(splitted[1]) if len(splitted) > 1 else ''
    first_alarm_time_form = readd_colon(splitted[2]) if len(splitted) > 2 else ''

    context = {
        "daily_obj": daily_obj,
        "date": current_date,
        "bed_time_form": bed_time_form,
        "wake_up_time_form": wake_up_time_form,
        "first_alarm_time_form": first_alarm_time_form,
    }
    return render(request, 'mainpage/day.html', context)


def _update_streak(user_id, logged_date):
    """
    Updates the user's streak in the Streak model:
    1. If this is the user's first daily log ever, set streak to 1.
    2. If logged_date == last_activity_date (same day) -> do nothing.
    3. If logged_date == last_activity_date + 1 day -> increment current streak.
    4. Otherwise (more than 1 day gap) -> reset current streak to 1.
    5. If current_streak > longest_streak, update it.
    6. Always update last_activity_date = logged_date.
    """

    streak_obj, created = Streak.objects.get_or_create(user_id=user_id)
    streak_data = streak_obj.streak_data or {}

    current_streak = streak_data.get("current_streak", 0)
    longest_streak = streak_data.get("longest_streak", 0)
    last_date_str = streak_data.get("last_activity_date", None)

    # Parse last_activity_date if it exists
    if last_date_str:
        y, m, d = map(int, last_date_str.split("-"))
        last_activity_date = date(y, m, d)
    else:
        last_activity_date = None

    if not last_activity_date:
        # First log ever: streak starts at 1
        current_streak = 1
    else:
        if logged_date == last_activity_date:
            # Already updated streak for this day -> do nothing
            return
        elif logged_date == last_activity_date + timedelta(days=1):
            # Consecutive day -> increment
            current_streak += 1
        else:
            # Missed at least one day -> reset
            current_streak = 1

    # Check if we need to update longest_streak
    if current_streak > longest_streak:
        longest_streak = current_streak

    # Save changes back to streak_data
    streak_data["current_streak"] = current_streak
    streak_data["longest_streak"] = longest_streak
    streak_data["last_activity_date"] = logged_date.isoformat()

    streak_obj.streak_data = streak_data
    streak_obj.save()
