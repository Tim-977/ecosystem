from datetime import timedelta, date
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect
from django.utils.timezone import now

from .models import DailyData, Streak, MonthlyHabits


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

    # Also get or create MonthlyHabits for the current month
    monthly_obj, _ = MonthlyHabits.objects.get_or_create(
        user_id=request.user.id,
        year=year,
        month=month
    )

    # We'll gather habit names from monthly_obj
    habits = [
        monthly_obj.habit_1,
        monthly_obj.habit_2,
        monthly_obj.habit_3,
        monthly_obj.habit_4,
        monthly_obj.habit_5,
        monthly_obj.habit_6,
        monthly_obj.habit_7,
        monthly_obj.habit_8,
        monthly_obj.habit_9,
        monthly_obj.habit_10,
    ]
    # Filter out any blank habit names for display (or keep them so positions remain consistent).
    # For now, let's keep them if they're empty, so we always have 10 slots.

    # If POST, handle form submission
    if request.method == 'POST':
        # Update mood/productivity
        daily_obj.mood_rating = request.POST.get('mood_rating') or None
        daily_obj.productivity_score = request.POST.get('productivity_score') or None

        # Retrieve the three time inputs
        bed_time_input = request.POST.get('bed_time', '')
        wake_up_time_input = request.POST.get('wake_up_time', '')
        first_alarm_time_input = request.POST.get('first_alarm_time', '')

        # Remove the colon to match your desired format (e.g. "2150")
        bed_time_str = bed_time_input.replace(':', '')
        wake_up_time_str = wake_up_time_input.replace(':', '')
        first_alarm_time_str = first_alarm_time_input.replace(':', '')

        # Store them comma-separated in the same field, with a trailing comma
        daily_obj.sleep = f"{bed_time_str},{wake_up_time_str},{first_alarm_time_str},"

        # Build a binary string for habits (1 if checked, 0 if not)
        habit_completion_string = ""
        for i in range(10):
            checkbox_val = request.POST.get(f"habit_{i}", None)
            if checkbox_val == "on":
                habit_completion_string += "1"
            else:
                habit_completion_string += "0"
        daily_obj.habits_completed = habit_completion_string

        # The rest of the fields remain as before
        daily_obj.thoughts = request.POST.get('thoughts')
        daily_obj.self_reflection = request.POST.get('self_reflection')
        daily_obj.hourly_activity_logging = request.POST.get('hourly_activity_logging')
        daily_obj.todo = request.POST.get('todo')
        daily_obj.save()

        # Update the streak
        _update_streak(request.user.id, current_date)

        return redirect('day_view', year=year, month=month, day=day)

    # === If GET request ===
    # Parse existing sleep data so we can show it in the form
    sleep_data = daily_obj.sleep or ""
    splitted = sleep_data.split(',')

    def readd_colon(t):
        """ Insert a colon to convert '2150' -> '21:50' or '0645' -> '06:45'. """
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

    # Convert daily_obj.habits_completed (e.g. "1010") into a list of '0'/'1'
    habits_binary = daily_obj.habits_completed or ""
    # Ensure length at least 10 for indexing
    habits_binary = habits_binary.ljust(10, '0')[:10]
    # We'll zip this with the habit names to show checkboxes
    habits_status = list(zip(habits, habits_binary))

    context = {
        "daily_obj": daily_obj,
        "date": current_date,
        "bed_time_form": bed_time_form,
        "wake_up_time_form": wake_up_time_form,
        "first_alarm_time_form": first_alarm_time_form,
        "habits_status": habits_status,  # list of (habit_name, '0' or '1')
        "monthly_obj": monthly_obj,       # we can show monthly goals if we want
    }
    return render(request, 'mainpage/day.html', context)


def _update_streak(user_id, logged_date):
    """
    Updates the user's streak in the Streak model:
    1. If this is the user's first daily log ever, set streak to 1.
    2. If logged_date == last_activity_date (same day) -> do nothing.
    3. If logged_date == last_activity_date + timedelta(days=1) -> increment current streak.
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


@login_required
def set_habits_view(request):
    """
    Display or create MonthlyHabits for the user's current month.
    Add "Clear" functionality to remove a single habit and set its bits to 0.
    """
    today = date.today()
    this_year = today.year
    this_month = today.month

    monthly_obj, _ = MonthlyHabits.objects.get_or_create(
        user_id=request.user.id,
        year=this_year,
        month=this_month
    )

    # Build a list of (index, habit_value) so the template can iterate
    habits_with_index = [
        (1, monthly_obj.habit_1),
        (2, monthly_obj.habit_2),
        (3, monthly_obj.habit_3),
        (4, monthly_obj.habit_4),
        (5, monthly_obj.habit_5),
        (6, monthly_obj.habit_6),
        (7, monthly_obj.habit_7),
        (8, monthly_obj.habit_8),
        (9, monthly_obj.habit_9),
        (10, monthly_obj.habit_10),
    ]

    if request.method == 'POST':

        # 1) Check if user clicked "Clear" for a single habit
        clear_index_str = request.POST.get('clear_habit_index')
        if clear_index_str is not None:
            # The user pressed the "Clear Habit" button
            try:
                clear_index = int(clear_index_str)  # 1..10
            except ValueError:
                messages.error(request, "Invalid habit index.")
                return redirect('set_habits')

            # Adjust the monthly_obj (erase the habit name)
            if clear_index == 1:
                monthly_obj.habit_1 = ""
            elif clear_index == 2:
                monthly_obj.habit_2 = ""
            elif clear_index == 3:
                monthly_obj.habit_3 = ""
            elif clear_index == 4:
                monthly_obj.habit_4 = ""
            elif clear_index == 5:
                monthly_obj.habit_5 = ""
            elif clear_index == 6:
                monthly_obj.habit_6 = ""
            elif clear_index == 7:
                monthly_obj.habit_7 = ""
            elif clear_index == 8:
                monthly_obj.habit_8 = ""
            elif clear_index == 9:
                monthly_obj.habit_9 = ""
            elif clear_index == 10:
                monthly_obj.habit_10 = ""

            monthly_obj.save()

            # Now set all 1's to 0 for that column in daily logs for this month
            from .models import DailyData  # or put at top of file
            daily_logs = DailyData.objects.filter(
                user_id=request.user.id,
                date__year=this_year,
                date__month=this_month
            )
            position = clear_index - 1  # 0-based index in the "habits_completed" string

            for log in daily_logs:
                hc = log.habits_completed or ""
                # Pad/truncate to length 10
                hc = hc.ljust(10, '0')[:10]

                # Convert to list for easy manipulation
                hc_list = list(hc)
                hc_list[position] = '0'  # set that bit to '0'
                new_hc = "".join(hc_list)

                log.habits_completed = new_hc
                log.save()

            messages.success(request, f"Habit {clear_index} cleared, bits set to 0.")
            return redirect('set_habits')

        # 2) Otherwise, user submitted the main form -> Save all habits
        monthly_obj.goal_text = request.POST.get('goal_text', '')
        monthly_obj.habit_1 = request.POST.get('habit_1', '')
        monthly_obj.habit_2 = request.POST.get('habit_2', '')
        monthly_obj.habit_3 = request.POST.get('habit_3', '')
        monthly_obj.habit_4 = request.POST.get('habit_4', '')
        monthly_obj.habit_5 = request.POST.get('habit_5', '')
        monthly_obj.habit_6 = request.POST.get('habit_6', '')
        monthly_obj.habit_7 = request.POST.get('habit_7', '')
        monthly_obj.habit_8 = request.POST.get('habit_8', '')
        monthly_obj.habit_9 = request.POST.get('habit_9', '')
        monthly_obj.habit_10 = request.POST.get('habit_10', '')
        monthly_obj.save()

        messages.success(request, "Monthly habits updated!")
        return redirect('set_habits')

    context = {
        "monthly_obj": monthly_obj,
        "habits_with_index": habits_with_index,
    }
    return render(request, 'mainpage/set_habits.html', context)


@login_required
def monthly_stats_view(request):
    """
    Show the monthly stats for the user's habit completion.
    We'll get all DailyData for the current month, parse the habits_completed,
    and compute how often each was done.
    """
    today = date.today()
    this_year = today.year
    this_month = today.month

    # Get the monthly habits
    try:
        monthly_obj = MonthlyHabits.objects.get(
            user_id=request.user.id,
            year=this_year,
            month=this_month
        )
    except MonthlyHabits.DoesNotExist:
        monthly_obj = None

    # Gather up to 10 habit names
    habit_names = []
    if monthly_obj:
        habit_names = [
            monthly_obj.habit_1,
            monthly_obj.habit_2,
            monthly_obj.habit_3,
            monthly_obj.habit_4,
            monthly_obj.habit_5,
            monthly_obj.habit_6,
            monthly_obj.habit_7,
            monthly_obj.habit_8,
            monthly_obj.habit_9,
            monthly_obj.habit_10,
        ]

    # Get all daily logs for this user in this month
    # We'll collect how many days each habit was completed
    daily_logs = DailyData.objects.filter(
        user_id=request.user.id,
        date__year=this_year,
        date__month=this_month
    ).order_by('date')

    # Initialize counters
    habit_completions = [0]*10
    total_days = daily_logs.count()  # or track unique days

    for log in daily_logs:
        completions = log.habits_completed or ""
        completions = completions.ljust(10, '0')[:10]
        for i, ch in enumerate(completions):
            if ch == '1':
                habit_completions[i] += 1

    # Pair up (habit_name, number_of_days_completed, percentage)
    habits_stats = []
    for i, name in enumerate(habit_names):
        if not name.strip():
            continue  # skip blank habit names
        done_count = habit_completions[i]
        percent = 0
        if total_days > 0:
            percent = int((done_count / total_days) * 100)
        habits_stats.append({
            "habit_name": name,
            "completed_days": done_count,
            "percent": percent,
        })

    context = {
        "monthly_obj": monthly_obj,
        "habits_stats": habits_stats,
        "total_days": total_days,
    }
    return render(request, 'mainpage/monthly-stats.html', context)
