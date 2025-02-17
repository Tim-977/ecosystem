from datetime import date, timedelta

import pytz
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.utils.timezone import now

from .models import DailyData, Streak


@login_required
def main_page_view(request):
    server_time = now()  # Should be UTC if USE_TZ=True

    try:
        user_timezone = request.user.personaldata.timezone
    except PersonalData.DoesNotExist:
        user_timezone = 'UTC'  # Default if not set

    print(f"DEBUG: Retrieved user_timezone: {user_timezone}")
    print(f"DEBUG: Server Time (UTC): {server_time}")

    try:
        user_time = server_time.astimezone(pytz.timezone(user_timezone))
        print(f"DEBUG: Converted User Time ({user_timezone}): {user_time} | tzinfo: {user_time.tzinfo}")
    except Exception as e:
        print(f"ERROR: Timezone conversion failed - {e}")
        user_time = server_time  # Fallback to UTC if conversion fail

    context = {
        "all_data": DailyData.objects.filter(user_id=request.user.id).order_by('-date'),
        "username": request.user.username,
        "current_streak": Streak.objects.get_or_create(user_id=request.user.id)[0].streak_data.get("current_streak", 0),
        "longest_streak": Streak.objects.get_or_create(user_id=request.user.id)[0].streak_data.get("longest_streak", 0),
        "server_time": server_time,  # Keep it as a timezone-aware datetime
        "user_time": user_time,      # Keep it as a datetime, NOT a string
        "user_timezone": user_timezone,
    }
    return render(request, 'mainpage/main.html', context)




@login_required
def day_view(request, year, month, day):
    # Convert the URL path into a Python date
    current_date = date(year, month, day)

    # Removed future date check:
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
        daily_obj.sleep = request.POST.get('sleep')
        daily_obj.habits_completed = request.POST.get('habits_completed')
        daily_obj.thoughts = request.POST.get('thoughts')
        daily_obj.self_reflection = request.POST.get('self_reflection')
        daily_obj.hourly_activity_logging = request.POST.get('hourly_activity_logging')
        daily_obj.todo = request.POST.get('todo')
        daily_obj.save()

        # Update the streak
        _update_streak(request.user.id, current_date)

        return redirect('day_view', year=year, month=month, day=day)

    context = {
        "daily_obj": daily_obj,
        "date": current_date,
    }
    return render(request, 'mainpage/day.html', context)


def _update_streak(user_id, logged_date):
    """
    Updates the user's streak in the Streak model:
    1. If this is the user's first daily log ever, set streak to 1.
    2. If logged_date == last_activity_date (same day) -> do nothing (already updated once).
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
        year, month, day = map(int, last_date_str.split("-"))
        last_activity_date = date(year, month, day)
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
    # Store the logged_date as YYYY-MM-DD string
    streak_data["last_activity_date"] = logged_date.isoformat()

    # Save to DB
    streak_obj.streak_data = streak_data
    streak_obj.save()
