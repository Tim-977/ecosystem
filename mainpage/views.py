import calendar
import json
import re
from datetime import date, datetime, time, timedelta

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Min
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.timezone import now
from .models import ActivityMapping, DailyData, MonthlyHabits, UserTodo
from tracker.utils.socket_client import send_render_request


def _parse_time_str(t_str):
    """Parse "HHMM" / "HMM" / "HH:MM" into a time, or None if blank/invalid."""
    t_str = (t_str or "").strip().replace(':', '')
    if len(t_str) == 3:
        h, m = t_str[0], t_str[1:]
    elif len(t_str) == 4:
        h, m = t_str[:2], t_str[2:]
    else:
        return None
    try:
        h, m = int(h), int(m)
    except ValueError:
        return None
    if h < 0 or h > 23 or m < 0 or m > 59:
        return None
    return time(h, m)


def _sleep_hours(log):
    """Hours slept from a DailyData "bed,wake,alarm," string (0 if unknown).
    A wake time earlier than the bed time is treated as crossing midnight."""
    if not log.sleep:
        return 0
    parts = log.sleep.split(',')
    bed = _parse_time_str(parts[0]) if len(parts) > 0 else None
    wake = _parse_time_str(parts[1]) if len(parts) > 1 else None
    if not (bed and wake):
        return 0
    duration = datetime.combine(log.date, wake) - datetime.combine(log.date, bed)
    if duration.total_seconds() < 0:
        duration += timedelta(hours=24)
    return duration.total_seconds() / 3600.0


def _hourly_ids(log):
    """The day's 24 hourly activity ids (None where nothing was logged)."""
    try:
        hour_list = json.loads(log.hourly_activity_logging or "[]")
    except (TypeError, ValueError):
        return [None] * 24
    hours = [None] * 24
    for item in hour_list if isinstance(hour_list, list) else []:
        h = item.get("hour") if isinstance(item, dict) else None
        if isinstance(h, int) and 0 <= h < 24:
            hours[h] = item.get("activity")
    return hours


def _day_summary(log):
    """Read-only, JSON-friendly summary of one DailyData row for charts."""
    return {
        "date": log.date.isoformat(),
        "mood": log.mood_rating,
        "productivity": log.productivity_score,
        "sleep": round(_sleep_hours(log), 2),
        "habits": (log.habits_completed or "").ljust(10, '0')[:10],
        "thoughts": log.thoughts or "",
        "has_reflection": bool(log.self_reflection),
    }


@login_required
def main_page_view(request):
    all_data = DailyData.objects.filter(user_id=request.user.id).order_by('-date')
    server_time = now()
    today = date.today()

    monthly_obj = MonthlyHabits.objects.filter(
        user_id=request.user.id, year=today.year, month=today.month
    ).first()
    today_log = next((log for log in all_data if log.date == today), None)

    # The recent calendar window, plus the latest days that actually hold
    # something (so a long gap doesn't hide the most recent entries).
    window_start = today - timedelta(days=120)
    summary_logs, with_content = [], 0
    for log in all_data:
        has_content = (log.mood_rating is not None or log.productivity_score is not None
                       or log.thoughts or log.self_reflection
                       or (log.habits_completed and '1' in log.habits_completed))
        if log.date >= window_start or (has_content and with_content < 40):
            summary_logs.append(log)
        if has_content:
            with_content += 1
        if log.date < window_start and with_content >= 40:
            break

    context = {
        "all_data": all_data,
        "username": request.user.username,
        "server_time": server_time,
        "year": today.year,
        "month": today.month,
        # Chart-ready views of the data above (read-only, for the dashboard)
        "monthly_obj": monthly_obj,
        "habit_names": [getattr(monthly_obj, f"habit_{i}") for i in range(1, 11)] if monthly_obj else [""] * 10,
        "day_summaries": [_day_summary(log) for log in summary_logs],
        "today_hourly": _hourly_ids(today_log) if today_log else None,
    }
    return render(request, 'mainpage/main.html', context)


@login_required
def tasks_view(request):
    """Full-page home for the TODO list; all data comes from the /api/todo/ endpoints."""
    return render(request, 'mainpage/tasks.html', {"current_view": "tasks"})


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

    daily_obj, _ = DailyData.objects.get_or_create(
        user_id=request.user.id,
        date=current_date
    )

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

    if request.method == 'POST':
        # ── Tiny-reflection limit (115 chars) ──
        thoughts_input = request.POST.get('thoughts', '') or ''
        if len(thoughts_input) > 115:
            messages.error(request, "Thoughts cannot exceed 115 characters.")
            return redirect('day_view', year=year, month=month, day=day)

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

        daily_obj.thoughts = thoughts_input
        daily_obj.self_reflection = request.POST.get('self_reflection')
        daily_obj.hourly_activity_logging = request.POST.get('hourly_activity_logging')
        daily_obj.save()

        return redirect('day_view', year=year, month=month, day=day)

    try:
        hourly_data = json.loads(daily_obj.hourly_activity_logging) if daily_obj.hourly_activity_logging else []
    except:
        hourly_data = []

    hourly_data.sort(key=lambda x: x.get('hour', 0))
    if not hourly_data:
        hourly_data = [{"hour": h, "activity": None} for h in range(24)]
    else:
        existing_hours = {item["hour"] for item in hourly_data}
        for h in range(24):
            if h not in existing_hours:
                hourly_data.append({"hour": h, "activity": None})
        hourly_data.sort(key=lambda x: x["hour"])

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

    # Which days of this month already hold any entry (for the date strip)
    logged_days = [
        log.date.day for log in DailyData.objects.filter(
            user_id=request.user.id, date__year=year, date__month=month
        )
        if log.mood_rating is not None or log.productivity_score is not None
        or (log.habits_completed and '1' in log.habits_completed)
        or log.thoughts or log.self_reflection
        or any(a is not None for a in _hourly_ids(log))
    ]

    context = {
        "daily_obj": daily_obj,
        "date": current_date,
        "bed_time_form": bed_time_form,
        "wake_up_time_form": wake_up_time_form,
        "first_alarm_time_form": first_alarm_time_form,
        "habits_status": habits_status,
        "monthly_obj": monthly_obj,
        "hourly_data": hourly_data,
        "logged_days": logged_days,
        "days_in_month": calendar.monthrange(year, month)[1],
    }
    return render(request, 'mainpage/day.html', context)


@login_required
def set_habits_view(request, year, month):
    from .models import DailyData

    # Load or create the MonthlyHabits object for the given year and month
    monthly_obj, _ = MonthlyHabits.objects.get_or_create(
        user_id=request.user.id,
        year=year,
        month=month
    )

    # Preload habits into index list for the form
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
        # --- Clear one habit ---
        clear_index_str = request.POST.get('clear_habit_index')
        if clear_index_str is not None:
            try:
                clear_index = int(clear_index_str)
                if 1 <= clear_index <= 10:
                    habit_fields = [
                        "habit_1", "habit_2", "habit_3", "habit_4", "habit_5",
                        "habit_6", "habit_7", "habit_8", "habit_9", "habit_10"
                    ]
                    setattr(monthly_obj, habit_fields[clear_index - 1], "")
                    monthly_obj.save()

                    # Also reset that bit in daily logs
                    daily_logs = DailyData.objects.filter(
                        user_id=request.user.id,
                        date__year=year,
                        date__month=month
                    )
                    for log in daily_logs:
                        hc = log.habits_completed or ""
                        hc = hc.ljust(10, '0')[:10]
                        hc_list = list(hc)
                        hc_list[clear_index - 1] = '0'
                        log.habits_completed = "".join(hc_list)
                        log.save()

                    messages.success(request, f"Habit {clear_index} cleared.")
            except ValueError:
                messages.error(request, "Invalid habit index.")
            return redirect('set_habits', year=year, month=month)

        # --- Save/update all habits ---
        monthly_obj.goal_text = request.POST.get('goal_text', '')
        for i in range(1, 11):
            setattr(monthly_obj, f"habit_{i}", request.POST.get(f"habit_{i}", ''))
        monthly_obj.save()
        messages.success(request, "Monthly habits updated!")
        return redirect('set_habits', year=year, month=month)

    # --- Regular GET request ---
    habit_days = [
        {"day": log.date.day, "habits": (log.habits_completed or "").ljust(10, '0')[:10]}
        for log in DailyData.objects.filter(
            user_id=request.user.id, date__year=year, date__month=month
        ).order_by('date')
    ]
    context = {
        "monthly_obj": monthly_obj,
        "habits_with_index": habits_with_index,
        "year": year,
        "month": month,
        "current_view": "set_habits",
        "habit_days": habit_days,
        "days_in_month": calendar.monthrange(year, month)[1],
    }
    return render(request, "mainpage/set_habits.html", context)



def is_valid_hex_color(color):
    return bool(re.fullmatch(r'#([0-9a-fA-F]{6})', color))


@login_required
def activity_config_view(request, year, month):
    edit_activity = None

    if request.method == 'GET':
        edit_id = request.GET.get('edit_id')
        if edit_id:
            edit_activity = ActivityMapping.objects.filter(
                user_id=request.user.id, id=edit_id, year=year, month=month
            ).first()

    elif request.method == 'POST':
        activity_id = request.POST.get('activity_id')
        action = request.POST.get('action')

        if action in ['create', 'update']:
            name = request.POST.get('name', '').strip()
            color = request.POST.get('color', '').strip()

            if len(name) > 15:
                messages.error(request, "Activity name must be 15 characters or fewer.")
                return redirect('activity_config_view', year=year, month=month)

            if not is_valid_hex_color(color):
                messages.error(request, "Please enter a valid hex color (e.g. #00ff00).")
                return redirect('activity_config_view', year=year, month=month)

        if action == 'create':
            # ── Enforce max 15 activities/month ──
            existing_count = ActivityMapping.objects.filter(
                user_id=request.user.id, year=year, month=month
            ).count()
            if existing_count >= 15:
                messages.error(
                    request,
                    "You can only have up to 15 activities per month."
                )
                return redirect('activity_config_view', year=year, month=month)

            if ActivityMapping.objects.filter(
                user_id=request.user.id, name=name, year=year, month=month
            ).exists():
                messages.error(request, "You already have an activity with that name this month.")
            elif ActivityMapping.objects.filter(
                user_id=request.user.id, color=color, year=year, month=month
            ).exists():
                messages.error(request, "You already have an activity with that color this month.")
            else:
                ActivityMapping.objects.create(
                    user_id=request.user.id, name=name, color=color, year=year, month=month
                )

        elif action == 'update' and activity_id:
            activity = ActivityMapping.objects.filter(
                user_id=request.user.id, id=activity_id, year=year, month=month
            ).first()
            if activity:
                if ActivityMapping.objects.filter(
                    user_id=request.user.id, name=name, year=year, month=month
                ).exclude(id=activity_id).exists():
                    messages.error(request, "You already have an activity with that name this month.")
                elif ActivityMapping.objects.filter(
                    user_id=request.user.id, color=color, year=year, month=month
                ).exclude(id=activity_id).exists():
                    messages.error(request, "You already have an activity with that color this month.")
                else:
                    activity.name = name
                    activity.color = color
                    activity.save()

        elif action == 'delete' and activity_id:
            ActivityMapping.objects.filter(
                user_id=request.user.id, id=activity_id, year=year, month=month
            ).delete()

        return redirect('activity_config_view', year=year, month=month)

    activities = ActivityMapping.objects.filter(
        user_id=request.user.id, year=year, month=month
    ).order_by('id')

    return render(request, 'mainpage/activity_config.html', {
        'activities': activities,
        'edit_activity': edit_activity,
        'year': year,
        'month': month,
        "current_view": "activity_config_view",
    })


@login_required
def get_activities(request):
    """
    Return the user's activities for the requested month, e.g.

      /get_activities/?year=2025&month=4
    """
    try:
        year  = int(request.GET.get("year"))
        month = int(request.GET.get("month"))
    except (TypeError, ValueError):
        # If year/month missing ⇒ fallback to *all* activities (old behaviour)
        qs = ActivityMapping.objects.filter(user_id=request.user.id)
    else:
        qs = ActivityMapping.objects.filter(
            user_id=request.user.id,
            year=year,
            month=month,
        )

    data = list(qs.values("id", "name", "color"))
    return JsonResponse(data, safe=False)


#########################
#  DEADLINE-BASED TODO  #
#########################
def _normalize_task(task):
    if 'due_type' not in task:
        task['due_type'] = 'none'
    if 'due_date' not in task:
        task['due_date'] = None
    if 'due_time' not in task:
        task['due_time'] = None
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
            return JsonResponse({"error": "Task description cannot be empty."}, status=400)

        due_type = body.get('due_type', 'none').lower()
        due_date = body.get('due_date')
        due_time = body.get('due_time')
        priority = body.get('priority', 'medium').lower()

        if priority not in ['critical', 'high', 'medium', 'low']:
            priority = 'medium'

        if due_type == 'until' and not due_date:
            return JsonResponse({"error": "Due date is required for 'Until'."}, status=400)
        if due_type == 'exact' and (not due_date or not due_time):
            return JsonResponse({"error": "Both date and time are required for 'Exact'."}, status=400)

        usertodo, _ = UserTodo.objects.get_or_create(user=request.user)
        tasks = usertodo.tasks or []

        # ── Enforce max 30 total tasks ──
        if len(tasks) >= 30:
            return JsonResponse({
                "error": "You can have at most 30 tasks. Delete some old ones to add more."
            }, status=400)

        new_id = max([t.get('id', 0) for t in tasks], default=0) + 1

        new_task = {
            "id": new_id,
            "text": text,
            "status": "pending",
            "due_type": due_type,
            "due_date": due_date if due_type in ['until', 'exact'] else None,
            "due_time": due_time if due_type == 'exact' else None,
            "priority": priority
        }

        tasks.append(new_task)
        usertodo.tasks = tasks
        usertodo.save()
        return JsonResponse({"success": True, "task": new_task})
    
    return JsonResponse({"error": "POST required"}, status=405)


@login_required
def update_todo_task(request, task_id):
    if request.method == 'PUT':
        body = json.loads(request.body.decode('utf-8'))
        usertodo, _ = UserTodo.objects.get_or_create(user=request.user)
        tasks = usertodo.tasks or []

        for t in tasks:
            if t.get('id') == task_id:
                if 'due_type' in body:
                    dt = body['due_type'].lower()
                    if dt in ['none', 'until', 'exact']:
                        t['due_type'] = dt
                        if dt == 'none':
                            t['due_date'] = None
                            t['due_time'] = None
                        elif dt == 'until':
                            if not body.get('due_date'):
                                return JsonResponse({"error": "Due date is required for 'Until'."}, status=400)
                            t['due_date'] = body.get('due_date')
                            t['due_time'] = None
                        elif dt == 'exact':
                            if not body.get('due_date') or not body.get('due_time'):
                                return JsonResponse({"error": "Both date and time are required for 'Exact'."}, status=400)
                            t['due_date'] = body.get('due_date')
                            t['due_time'] = body.get('due_time')

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
    
    return JsonResponse({"error": "PUT required"}, status=405)


@login_required
def delete_todo_task(request, task_id):
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


###############################
#         MONTH VIEW          #
###############################
@login_required
def month_view(request, year, month):
    reverse = request.GET.get("reverse") == "1"
    order = '-date' if reverse else 'date'

    daily_logs = DailyData.objects.filter(
        user_id=request.user.id,
        date__year=year,
        date__month=month
    ).order_by(order)

    # Retrieve the monthly-habits record (if any) for that year/month
    try:
        monthly_obj = MonthlyHabits.objects.get(
            user_id=request.user.id,
            year=year,
            month=month
        )
    except MonthlyHabits.DoesNotExist:
        monthly_obj = None

    # Prepare data for each day, including color gradients for mood/productivity
    days_data = []
    for log in daily_logs:
        mood_val = log.mood_rating if log.mood_rating is not None else 0
        prod_val = log.productivity_score if log.productivity_score is not None else 0
        mood_val = int(mood_val)
        prod_val = int(prod_val)

        mood_color = interpolate_color(mood_val,  # 0=red, 5=yellow, 10=green
                                       (0, '#ff0000'),   # red
                                       (5, '#ffff00'),   # yellow
                                       (10, '#00ff00'))  # green

        prod_color = interpolate_color(prod_val, # 0=blue, 5=white, 10=pink
                                       (0, '#0000ff'),   # blue
                                       (5, '#ffffff'),   # white
                                       (10, '#ffc0cb'))  # pink

        habits_str = log.habits_completed or ''
        habits_str = habits_str.ljust(10, '0')[:10]

        habit_labels = []
        if monthly_obj:
            habit_labels = [
                monthly_obj.habit_1, monthly_obj.habit_2, monthly_obj.habit_3,
                monthly_obj.habit_4, monthly_obj.habit_5, monthly_obj.habit_6,
                monthly_obj.habit_7, monthly_obj.habit_8, monthly_obj.habit_9,
                monthly_obj.habit_10
            ]
        else:
            habit_labels = [""] * 10

        habit_statuses = []
        for i, hname in enumerate(habit_labels):
            is_complete = (habits_str[i] == '1')
            habit_statuses.append((hname, is_complete))

        days_data.append({
            "date_obj": log.date,
            "mood_val": mood_val,
            "mood_color": mood_color,
            "prod_val": prod_val,
            "prod_color": prod_color,
            "habit_statuses": habit_statuses,
            "thoughts": log.thoughts or "",
            "self_reflection": log.self_reflection or "",
        })

    ###############################
    # NEW CODE FOR SLEEP & ACTIVITY
    ###############################
    
    # I store a day-by-day list for sleep hours, plus a monthly aggregator for activities.
    monthly_sleep_data = []
    monthly_activity_aggregate = {}  # { activity_name -> total hours }

    # Helper function to parse "HHMM" or "HH:MM" into a Python time object
    def parse_time_str(t_str):
        t_str = t_str.strip()
        # If user left it blank, return None
        if not t_str:
            return None
        # Remove any colon
        t_str = t_str.replace(':', '')
        # Must be 3 or 4 digits:
        if len(t_str) == 3:
            # '730' => '07:30'
            h = int(t_str[0])
            m = int(t_str[1:])
        elif len(t_str) == 4:
            h = int(t_str[:2])
            m = int(t_str[2:])
        else:
            return None
        # clamp in [0..23], [0..59] for safety
        if h < 0 or h > 23 or m < 0 or m > 59:
            return None
        return time(h, m)

    for log in daily_logs:
        # --- Sleep data ---
        if log.sleep:
            parts = log.sleep.split(',')
            bed_str = parts[0].strip() if len(parts) > 0 else ''
            wake_str = parts[1].strip() if len(parts) > 1 else ''

            bed_time_obj = parse_time_str(bed_str)
            wake_time_obj = parse_time_str(wake_str)

            # if both times are valid, compute difference
            # if wake_time < bed_time, assume it crossed midnight by +1 day
            if bed_time_obj and wake_time_obj:
                sleep_duration = (datetime.combine(log.date, wake_time_obj)
                                  - datetime.combine(log.date, bed_time_obj))
                if sleep_duration.total_seconds() < 0:
                    # Crossed midnight => add 24h
                    sleep_duration += timedelta(hours=24)
                sleep_hours = sleep_duration.total_seconds() / 3600.0
            else:
                sleep_hours = 0
        else:
            sleep_hours = 0

        monthly_sleep_data.append({
            "date_obj": log.date,
            "sleep_hours": sleep_hours
        })

        # --- Activity data ---
        # hourly_activity_logging is JSON of [{"hour": 0, "activity": "Sleeping"}, ...]
        if log.hourly_activity_logging:
            try:
                hour_list = json.loads(log.hourly_activity_logging)
            except:
                hour_list = []
        else:
            hour_list = []

        activity_lookup = {
            a.id: a.name for a in ActivityMapping.objects.filter(
                user_id=request.user.id, year=year, month=month
            )
        }


        for hour_item in hour_list:
            act_id = hour_item.get('activity')
            if act_id in activity_lookup:
                key = f"{activity_lookup[act_id]} (ID: {act_id})"
                monthly_activity_aggregate[key] = monthly_activity_aggregate.get(key, 0) + 1


    # Build an ID -> Color mapping
    color_lookup = {
        a.id: a.color for a in ActivityMapping.objects.filter(
            user_id=request.user.id, year=year, month=month
        )
    }


    # Create an empty 31×24 grid of white cells so missing days
    # are preserved in the monthly activity diagram
    day_hour_colors = [["#ffffff" for _ in range(24)] for _ in range(31)]


    # Fill day_hour_colors from each day's JSON
    for log in daily_logs:
        day_idx = log.date.day - 1
        if log.hourly_activity_logging:
            try:
                hour_list = json.loads(log.hourly_activity_logging)
            except:
                hour_list = []
            for hour_item in hour_list:
                h = hour_item.get('hour', 0)
                act_id = hour_item.get('activity')
                if act_id in color_lookup:
                    day_hour_colors[day_idx][h] = color_lookup[act_id]
                else:
                    day_hour_colors[day_idx][h] = "#000000"

    image_path = None
    try:
        payload = {
            "user_id": request.user.id,
            "year": year,
            "month": month,
            "mode": "month",
            "activity_log": day_hour_colors,
            "color_map": color_lookup,
        }
        response = send_render_request(payload)
        if isinstance(response, dict):
            image_path = response.get("image_path")
    except Exception:
        image_path = None

    context = {
        "year": year,
        "month": month,
        "monthly_obj": monthly_obj,
        "days_data": days_data,
        "current_view": "month_view",
        "reverse": reverse,
        "monthly_sleep_data": monthly_sleep_data,
        "monthly_activity_aggregate": monthly_activity_aggregate,
        "image_path": image_path,
        # Chart-ready views of the same logs (read-only, for native charts)
        "day_summaries": [_day_summary(log) for log in daily_logs.order_by('date')],
        "hourly_grid": {log.date.day: _hourly_ids(log) for log in daily_logs},
        "activity_legend": list(ActivityMapping.objects.filter(
            user_id=request.user.id, year=year, month=month
        ).order_by('id').values("id", "name", "color")),
        "habit_names": [getattr(monthly_obj, f"habit_{i}") for i in range(1, 11)] if monthly_obj else [""] * 10,
        "days_in_month": calendar.monthrange(year, month)[1],
    }
    return render(request, 'mainpage/month_statistics.html', context)


@login_required
def year_view(request, year):
    user_id = request.user.id

    # 1) Min/Max year for user interface
    oldest_data = DailyData.objects.filter(user_id=user_id).aggregate(Min('date'))
    if oldest_data['date__min']:
        year_min = oldest_data['date__min'].year
    else:
        year_min = datetime.now().year
    year_max = datetime.now().year

    # 2) All logs for requested year
    all_logs = DailyData.objects.filter(user_id=user_id, date__year=year)

    # 3) Build color mapping for each activity (ID -> color), 
    #    plus gather (name, color) pairs for the legend.
    #    We'll fetch the user's Activities for *all months* of that year.
    #    Then we remove exact duplicates if name+color match.
    full_mapping = {}
    legend_list  = []

    # Order by "id" so we preserve the creation order
    mapping_qs = ActivityMapping.objects.filter(
        user_id=user_id,
        year=year
    ).order_by('id')  # user created them in ascending ID

    seen = set()  # keep track of (name, color) we’ve already added
    for m in mapping_qs:
        full_mapping[m.id] = m.color
        # Only add to the legend if we haven't seen this exact (name, color) yet
        pair = (m.name, m.color)
        if pair not in seen:
            seen.add(pair)
            legend_list.append(pair)  # preserves creation order

    # 4) Prepare a 367×24 matrix of color codes (#RRGGBB). 
    #    We only fill days [0..364], last 2 are “white filler.”
    day_hour_colors = [["#ffffff" for _ in range(24)] for _ in range(367)]

    # Fill from the daily logs
    for log in all_logs:
        day_idx = log.date.timetuple().tm_yday - 1  # 0..364
        if 0 <= day_idx < 365:
            try:
                hour_data = json.loads(log.hourly_activity_logging or "[]")
            except:
                hour_data = []
            for hour_item in hour_data:
                h = hour_item.get("hour", 0)
                act_id = hour_item.get("activity")
                color = full_mapping.get(act_id, "#ffffff")
                if 0 <= h < 24:
                    day_hour_colors[day_idx][h] = color

    image_path = None
    try:
        payload = {
            "user_id": user_id,
            "year": year,
            "mode": "year",
            "activity_log": day_hour_colors,
            "username": request.user.username,
            "color_map": full_mapping,
            "legend": legend_list,
        }
        response = send_render_request(payload)
        if isinstance(response, dict):
            image_path = response.get("image_path")
    except Exception:
        image_path = None

    # 11) Render the response
    year_logs = list(all_logs.order_by('date'))
    context = {
        "year": year,
        "year_min": year_min,
        "year_max": year_max,
        "image_path": image_path,
        # Chart-ready views of the same logs (read-only, for native charts)
        "day_summaries": [_day_summary(log) for log in year_logs],
        "hourly_grid": {log.date.isoformat(): _hourly_ids(log) for log in year_logs},
        "activity_legend": list(mapping_qs.values("id", "name", "color", "month")),
    }
    return render(request, "mainpage/year_view.html", context)




def interpolate_color(value, low_tuple, mid_tuple, high_tuple):
    lv, lc = low_tuple
    mv, mc = mid_tuple
    hv, hc = high_tuple

    if value <= lv:
        return lc
    elif value >= hv:
        return hc
    elif value <= mv:
        ratio = (value - lv) / (mv - lv)
        return blend_hex_colors(lc, mc, ratio)
    else:
        ratio = (value - mv) / (hv - mv)
        return blend_hex_colors(mc, hc, ratio)


def blend_hex_colors(colorA, colorB, t):
    cA = colorA.lstrip('#')
    cB = colorB.lstrip('#')
    rA, gA, bA = int(cA[0:2], 16), int(cA[2:4], 16), int(cA[4:6], 16)
    rB, gB, bB = int(cB[0:2], 16), int(cB[2:4], 16), int(cB[4:6], 16)

    r = int(rA + (rB - rA) * t)
    g = int(gA + (gB - gA) * t)
    b = int(bA + (bB - bA) * t)

    return f"#{r:02x}{g:02x}{b:02x}"


@login_required
def diary_view(request, year, month):
    daily_logs = DailyData.objects.filter(
        user_id=request.user.id,
        date__year=year,
        date__month=month
    ).order_by('date')

    days_data = []
    for log in daily_logs:
        days_data.append({
            "date_obj": log.date,
            "thoughts": log.thoughts or "",
            "self_reflection": log.self_reflection or "",
        })

    context = {
        "year": year,
        "month": month,
        "days_data": days_data,
        "current_view": "diary_view",
    }
    return render(request, 'mainpage/month_diary.html', context)


