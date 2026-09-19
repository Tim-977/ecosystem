import calendar
import json
from datetime import date, datetime, time, timedelta

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.timezone import now
from .models import ActivityMapping, DailyData, MonthlyHabits, UserTodo
from . import services
# The helpers below live in services.py (shared with the mobile API); the
# underscored names are kept for existing imports.
from .services import (ServiceError, is_valid_hex_color,
                       day_summary as _day_summary, hourly_ids as _hourly_ids,
                       latest_alarm as _latest_alarm, normalize_task as _normalize_task,
                       parse_time_str as _parse_time_str, readd_colon as _readd_colon,
                       sleep_hours as _sleep_hours, sort_tasks as _sort_tasks)
from tracker.utils.socket_client import send_render_request
from landing.views import landing_page


def main_page_view(request):
    # Visitors who aren't signed in get the public homepage at the root.
    if not request.user.is_authenticated:
        return landing_page(request)

    server_time = now()
    today = date.today()

    monthly_obj = MonthlyHabits.objects.filter(
        user_id=request.user.id, year=today.year, month=today.month
    ).first()
    all_data, summary_logs, today_log = services.overview_logs(request.user.id, today)

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
        # keyed by ISO date so the browser can pick "today" by its own local
        # date rather than trusting the server's, which can be a day off
        # across timezones (see recent_hourly_grid)
        "today_hourly_grid": services.recent_hourly_grid(request.user.id, today),
    }
    return render(request, 'mainpage/main.html', context)


@login_required
def tasks_view(request):
    """Full-page home for the TODO list; all data comes from the /api/todo/ endpoints."""
    return render(request, 'mainpage/tasks.html', {"current_view": "tasks"})


@login_required
def day_view(request, year, month, day):
    current_date = date(year, month, day)

    try:
        services.check_day_allowed(current_date)
    except ServiceError as e:
        messages.error(request, e.message)
        return redirect('main_page')

    daily_obj, monthly_obj = services.open_day(request.user.id, current_date)

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
        if len(thoughts_input) > services.THOUGHTS_MAX:
            messages.error(request, "Thoughts cannot exceed 115 characters.")
            return redirect('day_view', year=year, month=month, day=day)

        daily_obj.mood_rating = request.POST.get('mood_rating') or None
        daily_obj.productivity_score = request.POST.get('productivity_score') or None

        daily_obj.sleep = services.sleep_string(
            request.POST.get('bed_time', ''),
            request.POST.get('wake_up_time', ''),
            request.POST.get('first_alarm_time', ''),
        )

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

    bed_time_form, wake_up_time_form, first_alarm_time_form, alarm_is_default = \
        services.sleep_form_values(daily_obj, request.user.id, current_date)

    habits_binary = services.habit_bits(daily_obj)
    habits_status = list(zip(habits, habits_binary))

    # Which days of this month already hold any entry (for the date strip)
    logged_days = services.logged_days(request.user.id, year, month)

    context = {
        "daily_obj": daily_obj,
        "date": current_date,
        "bed_time_form": bed_time_form,
        "wake_up_time_form": wake_up_time_form,
        "first_alarm_time_form": first_alarm_time_form,
        "alarm_is_default": alarm_is_default,
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
                    # Also resets that bit in the month's daily logs
                    services.clear_habit(request.user.id, year, month, clear_index)
                    messages.success(request, f"Habit {clear_index} cleared.")
            except ValueError:
                messages.error(request, "Invalid habit index.")
            return redirect('set_habits', year=year, month=month)

        # --- Save/update all habits ---
        services.save_month_habits(
            request.user.id, year, month,
            request.POST.get('goal_text', ''),
            [request.POST.get(f"habit_{i}", '') for i in range(1, 11)],
        )
        messages.success(request, "Monthly habits updated!")
        return redirect('set_habits', year=year, month=month)

    # --- Regular GET request ---
    habit_days = services.habit_days(request.user.id, year, month)
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
        name = request.POST.get('name', '')
        color = request.POST.get('color', '')

        # The rules (15 a month, name ≤ 15, unique name and colour, #rrggbb)
        # live in services, shared with the mobile API.
        try:
            if action == 'create':
                services.create_activity(request.user.id, year, month, name, color)
            elif action == 'update' and activity_id:
                services.update_activity(request.user.id, int(activity_id), name, color, year, month)
            elif action == 'delete' and activity_id:
                services.delete_activity(request.user.id, int(activity_id), year, month)
        except ValueError:
            pass  # a non-numeric id matches nothing
        except ServiceError as e:
            if e.status != 404:  # someone else's or a vanished activity: nothing to do
                messages.error(request, e.message)

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
# Validation, limits and sorting live in services (shared with the mobile API).

def _json_body(request):
    try:
        body = json.loads(request.body.decode('utf-8') or '{}')
    except (ValueError, UnicodeDecodeError):
        return None
    return body if isinstance(body, dict) else None


@login_required
def get_todo_tasks(request):
    pending, done = services.list_tasks(request.user)
    return JsonResponse({
        "pending": pending,
        "done": done,
    })


@login_required
def add_todo_task(request):
    if request.method == 'POST':
        body = _json_body(request)
        if body is None:
            return JsonResponse({"error": "Invalid request."}, status=400)
        try:
            new_task = services.add_task(
                request.user,
                body.get('text', ''),
                due_type=body.get('due_type', 'none'),
                due_date=body.get('due_date'),
                due_time=body.get('due_time'),
                priority=body.get('priority', 'medium'),
            )
        except ServiceError as e:
            return JsonResponse({"error": e.message}, status=e.status)
        return JsonResponse({"success": True, "task": new_task})

    return JsonResponse({"error": "POST required"}, status=405)


@login_required
def update_todo_task(request, task_id):
    if request.method == 'PUT':
        body = _json_body(request)
        if body is None:
            return JsonResponse({"error": "Invalid request."}, status=400)
        try:
            task = services.update_task(request.user, task_id, body)
        except ServiceError as e:
            return JsonResponse({"error": e.message}, status=e.status)
        return JsonResponse({"success": True, "task": task})

    return JsonResponse({"error": "PUT required"}, status=405)


@login_required
def delete_todo_task(request, task_id):
    if request.method == 'DELETE':
        try:
            services.delete_task(request.user, task_id)
        except ServiceError as e:
            return JsonResponse({"error": e.message}, status=e.status)
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

    # --- Activity data: hours per activity ("Name (ID: n)" -> hours) ---
    activity_lookup = {
        a.id: a.name for a in ActivityMapping.objects.filter(
            user_id=request.user.id, year=year, month=month
        )
    }
    for act_id, hours in services.month_activity_hours(request.user.id, year, month, daily_logs).items():
        if act_id in activity_lookup:
            monthly_activity_aggregate[f"{activity_lookup[act_id]} (ID: {act_id})"] = hours

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
    year_min, year_max = services.year_bounds(user_id)

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
    daily_logs = services.journal_logs(request.user.id, year, month)

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


