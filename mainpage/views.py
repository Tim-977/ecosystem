import json
from datetime import date, datetime, time, timedelta

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.timezone import now

from .models import ActivityMapping
from .models import DailyData, MonthlyHabits, Streak, UserTodo


@login_required
def main_page_view(request):
    all_data = DailyData.objects.filter(user_id=request.user.id).order_by('-date')

    streak_obj, _ = Streak.objects.get_or_create(user_id=request.user.id)
    streak_data = streak_obj.streak_data or {}
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
    current_date = date(year, month, day)
    today = date.today()

    allowable_date = today + timedelta(days=1)
    if current_date > allowable_date:
        messages.error(request, "You cannot create or edit logs for dates more than 24h in the future.")
        return redirect('main_page')

    last_log = DailyData.objects.filter(
        user_id=request.user.id,
        date__lt=current_date
    ).order_by('-date').first()

    if last_log:
        day_to_fill = last_log.date + timedelta(days=1)
        while day_to_fill < current_date:
            DailyData.objects.get_or_create(
                user_id=request.user.id,
                date=day_to_fill
            )
            day_to_fill += timedelta(days=1)

    # Get or create today's DailyData
    daily_obj, _ = DailyData.objects.get_or_create(
        user_id=request.user.id,
        date=current_date
    )

    # Get or create the MonthlyHabits
    monthly_obj, _ = MonthlyHabits.objects.get_or_create(
        user_id=request.user.id,
        year=year,
        month=month
    )

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

    # Handle form submission
    if request.method == 'POST':
        daily_obj.mood_rating = request.POST.get('mood_rating') or None
        daily_obj.productivity_score = request.POST.get('productivity_score') or None

        bed_time_input = request.POST.get('bed_time', '')
        wake_up_time_input = request.POST.get('wake_up_time', '')
        first_alarm_time_input = request.POST.get('first_alarm_time', '')

        bed_time_str = bed_time_input.replace(':', '')
        wake_up_time_str = wake_up_time_input.replace(':', '')
        first_alarm_time_str = first_alarm_time_input.replace(':', '')

        daily_obj.sleep = f"{bed_time_str},{wake_up_time_str},{first_alarm_time_str},"

        habit_completion_string = ""
        for i in range(10):
            checkbox_val = request.POST.get(f"habit_{i}", None)
            habit_completion_string += "1" if checkbox_val == "on" else "0"
        daily_obj.habits_completed = habit_completion_string

        # Save the raw text from the hourly logging <textarea> or hidden input
        daily_obj.thoughts = request.POST.get('thoughts')
        daily_obj.self_reflection = request.POST.get('self_reflection')
        daily_obj.hourly_activity_logging = request.POST.get('hourly_activity_logging')
        daily_obj.save()

        # Update streak info
        _update_streak(request.user.id, current_date)

        return redirect('day_view', year=year, month=month, day=day)

    # On GET, parse the JSON for hourly activity
    try:
        hourly_data = json.loads(daily_obj.hourly_activity_logging) if daily_obj.hourly_activity_logging else []
    except:
        hourly_data = []

    # Optionally sort by hour (if not already sorted)
    hourly_data.sort(key=lambda x: x.get('hour', 0))

    if not hourly_data:
        hourly_data = [{"hour": h, "activity": None} for h in range(24)]
    else:
        # If you want to ensure it's always 24 hours in length, fill in missing hours:
        existing_hours = {item["hour"] for item in hourly_data}
        for h in range(24):
            if h not in existing_hours:
                hourly_data.append({"hour": h, "activity": None})
        # Sort by hour
        hourly_data.sort(key=lambda x: x["hour"])

    # Prepare context
    sleep_data = daily_obj.sleep or ""
    splitted = sleep_data.split(',')

    def readd_colon(t):
        t = t.strip()
        if len(t) == 4:
            return t[:2] + ":" + t[2:]
        elif len(t) == 3:
            return "0" + t[0] + ":" + t[1:]
        return t

    bed_time_form = readd_colon(splitted[0]) if len(splitted) > 0 else ''
    wake_up_time_form = readd_colon(splitted[1]) if len(splitted) > 1 else ''
    first_alarm_time_form = readd_colon(splitted[2]) if len(splitted) > 2 else ''

    habits_binary = daily_obj.habits_completed or ""
    habits_binary = habits_binary.ljust(10, '0')[:10]
    habits_status = list(zip(habits, habits_binary))

    context = {
        "daily_obj": daily_obj,
        "date": current_date,
        "bed_time_form": bed_time_form,
        "wake_up_time_form": wake_up_time_form,
        "first_alarm_time_form": first_alarm_time_form,
        "habits_status": habits_status,
        "monthly_obj": monthly_obj,
        "hourly_data": hourly_data,
    }
    return render(request, 'mainpage/day.html', context)


def _update_streak(user_id, logged_date):
    streak_obj, created = Streak.objects.get_or_create(user_id=user_id)
    streak_data = streak_obj.streak_data or {}

    current_streak = streak_data.get("current_streak", 0)
    longest_streak = streak_data.get("longest_streak", 0)
    last_date_str = streak_data.get("last_activity_date", None)

    if last_date_str:
        y, m, d = map(int, last_date_str.split("-"))
        last_activity_date = date(y, m, d)
    else:
        last_activity_date = None

    if not last_activity_date:
        current_streak = 1
    else:
        if logged_date == last_activity_date:
            # Same day was already logged, do nothing
            return
        elif logged_date == last_activity_date + timedelta(days=1):
            current_streak += 1
        else:
            current_streak = 1

    if current_streak > longest_streak:
        longest_streak = current_streak

    streak_data["current_streak"] = current_streak
    streak_data["longest_streak"] = longest_streak
    streak_data["last_activity_date"] = logged_date.isoformat()

    streak_obj.streak_data = streak_data
    streak_obj.save()


@login_required
def set_habits_view(request):
    from datetime import date
    today = date.today()
    this_year = today.year
    this_month = today.month

    monthly_obj, _ = MonthlyHabits.objects.get_or_create(
        user_id=request.user.id,
        year=this_year,
        month=this_month
    )
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
        clear_index_str = request.POST.get('clear_habit_index')
        if clear_index_str is not None:
            try:
                clear_index = int(clear_index_str)
            except ValueError:
                messages.error(request, "Invalid habit index.")
                return redirect('set_habits')

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

            from .models import DailyData
            daily_logs = DailyData.objects.filter(
                user_id=request.user.id,
                date__year=this_year,
                date__month=this_month
            )
            position = clear_index - 1
            for log in daily_logs:
                hc = log.habits_completed or ""
                hc = hc.ljust(10, '0')[:10]
                hc_list = list(hc)
                hc_list[position] = '0'
                new_hc = "".join(hc_list)
                log.habits_completed = new_hc
                log.save()

            messages.success(request, f"Habit {clear_index} cleared, bits set to 0.")
            return redirect('set_habits')

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
    from datetime import date
    today = date.today()
    this_year = today.year
    this_month = today.month

    try:
        monthly_obj = MonthlyHabits.objects.get(
            user_id=request.user.id,
            year=this_year,
            month=this_month
        )
    except MonthlyHabits.DoesNotExist:
        monthly_obj = None

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

    daily_logs = DailyData.objects.filter(
        user_id=request.user.id,
        date__year=this_year,
        date__month=this_month
    ).order_by('date')

    habit_completions = [0]*10
    total_days = daily_logs.count()

    for log in daily_logs:
        completions = log.habits_completed or ""
        completions = completions.ljust(10, '0')[:10]
        for i, ch in enumerate(completions):
            if ch == '1':
                habit_completions[i] += 1

    habits_stats = []
    for i, name in enumerate(habit_names):
        if not name.strip():
            continue
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


################################
#          ACTIVITY CONFIG      #
################################
@login_required
def activity_config_view(request):
    """
    View for managing user activity mappings (create, update, delete).
    """
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'create':
            name = request.POST.get('name', '').strip()
            color = request.POST.get('color', '#000000').strip()
            if name:
                ActivityMapping.objects.create(
                    user_id=request.user.id,
                    name=name,
                    color=color
                )
        elif action == 'delete':
            activity_id = request.POST.get('activity_id')
            if activity_id:
                ActivityMapping.objects.filter(
                    user_id=request.user.id,
                    id=activity_id
                ).delete()
        return redirect('activity_config_view')

    activities = ActivityMapping.objects.filter(user_id=request.user.id).order_by('id')
    return render(request, 'mainpage/activity_config.html', {'activities': activities})


@login_required
def get_activities(request):
    """
    Return a JSON list of the user's activities:
    [
      {"id": 1, "name": "Studying", "color": "red"},
      {"id": 2, "name": "Sleeping", "color": "blue"},
      ...
    ]
    """
    activities_qs = ActivityMapping.objects.filter(user_id=request.user.id)
    # Convert QuerySet to list of dict
    data = list(activities_qs.values('id', 'name', 'color'))
    return JsonResponse(data, safe=False)


#########################
#  DEADLINE-BASED TODO  #
#########################
def _normalize_task(task):
    """
    Ensure each task has:
      - due_type: "none", "today", "until", or "exact"
      - due_date: string or None (YYYY-MM-DD)
      - due_time: string or None (HH:MM)
      - priority: "critical", "high", "medium", or "low"
    """
    if 'due_type' not in task:
        task['due_type'] = 'none'
    if 'due_date' not in task:
        task['due_date'] = None
    if 'due_time' not in task:
        task['due_time'] = None

    # If old code used 'someday', treat as no deadline
    if isinstance(task.get('due_time'), str) and task['due_time'].lower() == 'someday':
        task['due_type'] = 'none'
        task['due_date'] = None
        task['due_time'] = None

    if 'priority' not in task:
        task['priority'] = 'medium'

    return task


def _sort_tasks(tasks):
    from datetime import date, datetime, time

    priority_map = {
        'critical': 0,
        'high': 1,
        'medium': 2,
        'low': 3
    }
    due_type_map = {
        'exact': 0,
        'until': 1,
        'today': 2,
        'none': 3
    }

    def parse_date_time(due_date, due_time):
        try:
            d = datetime.strptime(due_date, "%Y-%m-%d").date() if due_date else None
            t = datetime.strptime(due_time, "%H:%M").time() if due_time else None
            return d, t
        except:
            return None, None

    def sort_key(task):
        p_val = priority_map.get(task.get('priority', 'medium'), 2)
        dt = task.get('due_type', 'none')
        dt_val = due_type_map.get(dt, 3)

        if dt == 'exact':
            d, t = parse_date_time(task['due_date'], task['due_time'])
            if d is None:
                d, t = date.max, time.max
            elif t is None:
                t = time.min
            return (p_val, dt_val, d, t)

        elif dt == 'until':
            d, _ = parse_date_time(task['due_date'], None)
            if d is None:
                d = date.max
            return (p_val, dt_val, d, time.min)

        elif dt == 'today':
            return (p_val, dt_val, date.max, time.max)

        else:
            return (p_val, dt_val, date.max, time.max)

    return sorted(tasks, key=sort_key)


@login_required
def get_todo_tasks(request):
    """
    Return the user's tasks as JSON (split into "pending" vs "done").
    If the user doesn't have a UserTodo row yet, create it.
    We'll also apply sorting by due_type, date, time.
    """
    usertodo, _ = UserTodo.objects.get_or_create(user=request.user)
    tasks = usertodo.tasks

    normalized = [_normalize_task(t) for t in tasks]
    sorted_tasks = _sort_tasks(normalized)

    pending = [t for t in sorted_tasks if t.get('status') == 'pending']
    done = [t for t in sorted_tasks if t.get('status') == 'done']

    usertodo.tasks = normalized
    usertodo.save()

    return JsonResponse({
        "pending": pending,
        "done": done,
    })


@login_required
def add_todo_task(request):
    if request.method == 'POST':
        body = json.loads(request.body.decode('utf-8'))
        text = body.get('text', '').strip()
        if not text:
            return JsonResponse({"error": "No task text provided."}, status=400)

        due_type = body.get('due_type', 'none').lower()
        due_date = body.get('due_date')
        due_time = body.get('due_time')
        priority = body.get('priority', 'medium').lower()
        if priority not in ['critical', 'high', 'medium', 'low']:
            priority = 'medium'

        if due_type == 'today':
            due_type = 'until'
            due_date = datetime.now().strftime('%Y-%m-%d')
            due_time = None

        usertodo, _ = UserTodo.objects.get_or_create(user=request.user)
        tasks = usertodo.tasks or []

        new_id = 1
        if tasks:
            new_id = max(t.get('id', 0) for t in tasks) + 1

        new_task = {
            "id": new_id,
            "text": text,
            "status": "pending",
            "due_type": due_type,
            "due_date": due_date if due_type in ('until', 'exact') else None,
            "due_time": due_time if due_type == 'exact' else None,
            "priority": priority
        }

        tasks.append(new_task)
        usertodo.tasks = tasks
        usertodo.save()
        return JsonResponse({"success": True, "task": new_task})
    else:
        return JsonResponse({"error": "POST required"}, status=405)


@login_required
def update_todo_task(request, task_id):
    if request.method == 'PUT':
        body = json.loads(request.body.decode('utf-8'))
        usertodo, _ = UserTodo.objects.get_or_create(user=request.user)
        tasks = usertodo.tasks or []

        for t in tasks:
            if t.get('id') == task_id:
                # If the user sets a new 'due_type', validate and update it
                if 'due_type' in body:
                    dt = body['due_type'].lower()
                    if dt in ['none', 'until', 'exact']:  # 'today' is now removed
                        t['due_type'] = dt
                        if dt == 'none':
                            t['due_date'] = None
                            t['due_time'] = None
                        elif dt == 'until':
                            t['due_date'] = body.get('due_date')
                            t['due_time'] = None  # Ensure time is reset
                        elif dt == 'exact':
                            t['due_date'] = body.get('due_date')
                            t['due_time'] = body.get('due_time')

                if 'due_date' in body and t['due_type'] in ['until', 'exact']:
                    t['due_date'] = body['due_date']
                if 'due_time' in body and t['due_type'] == 'exact':
                    t['due_time'] = body['due_time']
                if 'priority' in body:
                    pr = body['priority'].lower()
                    if pr in ['critical', 'high', 'medium', 'low']:
                        t['priority'] = pr
                if 'status' in body and body['status'] in ['pending', 'done']:
                    t['status'] = body['status']

                usertodo.tasks = tasks
                usertodo.save()
                return JsonResponse({"success": True, "task": t})

        return JsonResponse({"error": "Task not found."}, status=404)
    else:
        return JsonResponse({"error": "PUT required"}, status=405)



@login_required
def delete_todo_task(request, task_id):
    """
    Delete a task by ID.
    """
    if request.method == 'DELETE':
        usertodo, _ = UserTodo.objects.get_or_create(user=request.user)
        tasks = usertodo.tasks
        new_tasks = [t for t in tasks if t.get('id') != task_id]
        if len(new_tasks) == len(tasks):
            return JsonResponse({"error": "Task not found."}, status=404)

        usertodo.tasks = new_tasks
        usertodo.save()
        return JsonResponse({"success": True})
    else:
        return JsonResponse({"error": "DELETE required"}, status=405)
