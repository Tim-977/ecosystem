"""Business rules shared by the web pages (mainpage.views) and the mobile API
(api.views).

Both clients read and write the same rows in the same formats, so the rules
live here once: how a day is stored, how tasks are validated and sorted, the
limits on activities and habits, and the data the insight pages are built from.
"""
import calendar
import json
import re
from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.db.models import Min

from .models import ActivityMapping, DailyData, MonthlyHabits, UserTodo

HABIT_SLOTS = 10
THOUGHTS_MAX = 115
TASK_LIMIT = 30
TASK_TEXT_MAX = 200
TASK_PRIORITIES = ('critical', 'high', 'medium', 'low')
TASK_DUE_TYPES = ('none', 'today', 'until', 'exact')
ACTIVITY_LIMIT = 15
ACTIVITY_NAME_MAX = 15
HABIT_NAME_MAX = 100


class ServiceError(Exception):
    """A rule the request broke. `message` is written for the person using the app."""

    def __init__(self, message, status=400, field=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.field = field


# ---------------------------------------------------------------------------
# Day storage formats
# ---------------------------------------------------------------------------

def parse_time_str(t_str):
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


def sleep_hours(log):
    """Hours slept from a DailyData "bed,wake,alarm," string (0 if unknown).
    A wake time earlier than the bed time is treated as crossing midnight."""
    if not log.sleep:
        return 0
    parts = log.sleep.split(',')
    bed = parse_time_str(parts[0]) if len(parts) > 0 else None
    wake = parse_time_str(parts[1]) if len(parts) > 1 else None
    if not (bed and wake):
        return 0
    duration = datetime.combine(log.date, wake) - datetime.combine(log.date, bed)
    if duration.total_seconds() < 0:
        duration += timedelta(hours=24)
    return duration.total_seconds() / 3600.0


def hourly_ids(log):
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


def hourly_json(hours):
    """24 activity ids (or None) in the format the Day page stores."""
    return json.dumps([{"hour": h, "activity": a} for h, a in enumerate(hours)])


def readd_colon(t):
    """'715' / '0715' as stored in DailyData.sleep -> '07:15'."""
    t = t.strip()
    if len(t) == 4:
        return t[:2] + ":" + t[2:]
    elif len(t) == 3:
        return "0" + t[0] + ":" + t[1:]
    return t


def sleep_string(bed, wake, alarm):
    """The stored "bed,wake,alarm," string from "HH:MM" (or blank) inputs."""
    return f"{(bed or '').replace(':', '')},{(wake or '').replace(':', '')},{(alarm or '').replace(':', '')},"


def latest_alarm(user_id, exclude_date):
    """The first alarm from the most recent night that has one, as 'HH:MM'."""
    sleep = (
        DailyData.objects
        .filter(user_id=user_id, sleep__regex=r'^[^,]*,[^,]*,[0-9]{3,4}')
        .exclude(date=exclude_date)
        .order_by('-date')
        .values_list('sleep', flat=True)
        .first()
    )
    return readd_colon(sleep.split(',')[2]) if sleep else ''


def sleep_form_values(daily_obj, user_id, current_date):
    """Bed, wake and first alarm as the Day page shows them ("HH:MM" or '').

    People mostly keep one alarm, so an untouched night starts from the last
    one they entered. A night with bed/wake but no alarm is left alone —
    that's a deliberate "no alarm today". Returns (bed, wake, alarm, alarm_is_default).
    """
    splitted = ((daily_obj.sleep if daily_obj else None) or "").split(',')
    bed = readd_colon(splitted[0]) if len(splitted) > 0 else ''
    wake = readd_colon(splitted[1]) if len(splitted) > 1 else ''
    alarm = readd_colon(splitted[2]) if len(splitted) > 2 else ''
    alarm_is_default = False
    if not (bed or wake or alarm):
        alarm = latest_alarm(user_id, current_date)
        alarm_is_default = bool(alarm)
    return bed, wake, alarm, alarm_is_default


def habit_bits(log):
    return ((log.habits_completed if log else None) or "").ljust(HABIT_SLOTS, '0')[:HABIT_SLOTS]


def habit_names(monthly_obj):
    """The month's ten habit slots ('' where a slot is empty)."""
    if not monthly_obj:
        return [""] * HABIT_SLOTS
    return [getattr(monthly_obj, f"habit_{i}") or "" for i in range(1, HABIT_SLOTS + 1)]


def has_content(log):
    """Whether a day holds anything a person wrote or rated."""
    return (log.mood_rating is not None or log.productivity_score is not None
            or bool(log.thoughts) or bool(log.self_reflection)
            or bool(log.habits_completed and '1' in log.habits_completed))


def day_summary(log):
    """Read-only, JSON-friendly summary of one DailyData row for charts."""
    return {
        "date": log.date.isoformat(),
        "mood": log.mood_rating,
        "productivity": log.productivity_score,
        "sleep": round(sleep_hours(log), 2),
        "habits": (log.habits_completed or "").ljust(10, '0')[:10],
        "thoughts": log.thoughts or "",
        "has_reflection": bool(log.self_reflection),
    }


def logged_days(user_id, year, month):
    """Which days of a month already hold any entry (for the date strip)."""
    return [
        log.date.day for log in DailyData.objects.filter(
            user_id=user_id, date__year=year, date__month=month
        )
        if has_content(log) or any(a is not None for a in hourly_ids(log))
    ]


# ---------------------------------------------------------------------------
# Days
# ---------------------------------------------------------------------------

def check_day_allowed(day, today=None):
    """Logs can be written up to 24h ahead, never further."""
    today = today or date.today()
    if day > today + timedelta(days=1):
        raise ServiceError("You cannot create or edit logs for dates more than 24h in the future.")


def open_day(user_id, day):
    """What opening a day does on the Day page: fill in empty rows for the days
    between the last logged day and this one, then get or create this day and
    its month's habits."""
    last_log = DailyData.objects.filter(user_id=user_id, date__lt=day).order_by('-date').first()
    if last_log:
        day_to_fill = last_log.date + timedelta(days=1)
        while day_to_fill < day:
            DailyData.objects.get_or_create(user_id=user_id, date=day_to_fill)
            day_to_fill += timedelta(days=1)

    daily_obj, _ = DailyData.objects.get_or_create(user_id=user_id, date=day)
    monthly_obj, _ = MonthlyHabits.objects.get_or_create(user_id=user_id, year=day.year, month=day.month)
    return daily_obj, monthly_obj


def update_day(user_id, day, changes):
    """Apply a partial update to one day in the Day page's storage formats.

    `changes` holds already-validated values under the keys mood, productivity,
    sleep (bed/wake/alarm "HH:MM" or ''), habits (10-char bit string), thoughts,
    self_reflection and hourly (24 activity ids or None). Only keys present are
    written, so edits made elsewhere to the other fields are kept.
    """
    check_day_allowed(day)
    if 'thoughts' in changes and len(changes['thoughts'] or '') > THOUGHTS_MAX:
        raise ServiceError(f"Thoughts cannot exceed {THOUGHTS_MAX} characters.", field='thoughts')

    with transaction.atomic():
        daily_obj, monthly_obj = open_day(user_id, day)
        daily_obj = DailyData.objects.select_for_update().get(pk=daily_obj.pk)

        if 'hourly' in changes:
            allowed = set(ActivityMapping.objects.filter(
                user_id=user_id, year=day.year, month=day.month
            ).values_list('id', flat=True))
            # ids already on this day stay valid (e.g. an activity deleted since)
            allowed.update(a for a in hourly_ids(daily_obj) if a is not None)
            unknown = [a for a in changes['hourly'] if a is not None and a not in allowed]
            if unknown:
                raise ServiceError("One of those activities doesn't belong to this month.", field='hourly')
            daily_obj.hourly_activity_logging = hourly_json(changes['hourly'])

        if 'mood' in changes:
            daily_obj.mood_rating = changes['mood']
        if 'productivity' in changes:
            daily_obj.productivity_score = changes['productivity']
        if 'sleep' in changes:
            s = changes['sleep']
            daily_obj.sleep = sleep_string(s.get('bed'), s.get('wake'), s.get('alarm'))
        if 'habits' in changes:
            daily_obj.habits_completed = changes['habits']
        if 'thoughts' in changes:
            daily_obj.thoughts = changes['thoughts']
        if 'self_reflection' in changes:
            daily_obj.self_reflection = changes['self_reflection']
        daily_obj.save()
    return daily_obj, monthly_obj


# ---------------------------------------------------------------------------
# Monthly habits
# ---------------------------------------------------------------------------

def habit_days(user_id, year, month):
    """Each logged day of the month with its 10 habit bits."""
    return [
        {"day": log.date.day, "habits": habit_bits(log)}
        for log in DailyData.objects.filter(
            user_id=user_id, date__year=year, date__month=month
        ).order_by('date')
    ]


def save_month_habits(user_id, year, month, goal_text, habits):
    """Save the month's goal and all ten habit slots (the Routines "Save")."""
    habits = list(habits)[:HABIT_SLOTS]
    habits += [''] * (HABIT_SLOTS - len(habits))
    monthly_obj, _ = MonthlyHabits.objects.get_or_create(user_id=user_id, year=year, month=month)
    monthly_obj.goal_text = goal_text or ''
    for i, name in enumerate(habits, start=1):
        setattr(monthly_obj, f"habit_{i}", name or '')
    monthly_obj.save()
    return monthly_obj


def clear_habit(user_id, year, month, index):
    """Empty one habit slot (1–10) and erase its check-offs on every day of the month."""
    if not 1 <= index <= HABIT_SLOTS:
        raise ServiceError("Invalid habit index.")
    with transaction.atomic():
        monthly_obj, _ = MonthlyHabits.objects.get_or_create(user_id=user_id, year=year, month=month)
        setattr(monthly_obj, f"habit_{index}", "")
        monthly_obj.save()

        daily_logs = DailyData.objects.select_for_update().filter(
            user_id=user_id, date__year=year, date__month=month
        )
        for log in daily_logs:
            hc_list = list(habit_bits(log))
            hc_list[index - 1] = '0'
            log.habits_completed = "".join(hc_list)
            log.save()
    return monthly_obj


# ---------------------------------------------------------------------------
# Activities (per month)
# ---------------------------------------------------------------------------

def is_valid_hex_color(color):
    return bool(re.fullmatch(r'#([0-9a-fA-F]{6})', color))


def _check_activity_fields(name, color):
    if not name:
        raise ServiceError("Give the activity a name.", field='name')
    if len(name) > ACTIVITY_NAME_MAX:
        raise ServiceError("Activity name must be 15 characters or fewer.", field='name')
    if not is_valid_hex_color(color):
        raise ServiceError("Please enter a valid hex color (e.g. #00ff00).", field='color')


def create_activity(user_id, year, month, name, color):
    name, color = (name or '').strip(), (color or '').strip()
    _check_activity_fields(name, color)
    with transaction.atomic():
        month_qs = ActivityMapping.objects.select_for_update().filter(user_id=user_id, year=year, month=month)
        if month_qs.count() >= ACTIVITY_LIMIT:
            raise ServiceError("You can only have up to 15 activities per month.")
        if month_qs.filter(name=name).exists():
            raise ServiceError("You already have an activity with that name this month.", field='name')
        if month_qs.filter(color__iexact=color).exists():
            raise ServiceError("You already have an activity with that color this month.", field='color')
        return ActivityMapping.objects.create(user_id=user_id, name=name, color=color, year=year, month=month)


def get_activity(user_id, activity_id, year=None, month=None):
    qs = ActivityMapping.objects.filter(user_id=user_id, id=activity_id)
    if year is not None and month is not None:
        qs = qs.filter(year=year, month=month)
    activity = qs.first()
    if activity is None:
        raise ServiceError("Activity not found.", status=404)
    return activity


def update_activity(user_id, activity_id, name, color, year=None, month=None):
    name, color = (name or '').strip(), (color or '').strip()
    _check_activity_fields(name, color)
    activity = get_activity(user_id, activity_id, year, month)
    others = ActivityMapping.objects.filter(
        user_id=user_id, year=activity.year, month=activity.month
    ).exclude(id=activity.id)
    if others.filter(name=name).exists():
        raise ServiceError("You already have an activity with that name this month.", field='name')
    if others.filter(color__iexact=color).exists():
        raise ServiceError("You already have an activity with that color this month.", field='color')
    activity.name = name
    activity.color = color
    activity.save()
    return activity


def delete_activity(user_id, activity_id, year=None, month=None):
    """Hours already logged with it stay on their days as an unknown activity."""
    get_activity(user_id, activity_id, year, month).delete()


def month_activities(user_id, year, month):
    return ActivityMapping.objects.filter(user_id=user_id, year=year, month=month).order_by('id')


# ---------------------------------------------------------------------------
# Tasks (one JSON list per person)
# ---------------------------------------------------------------------------

def normalize_task(task):
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


def sort_tasks(tasks):
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
        except (TypeError, ValueError):
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
        else:
            return (p_val, dt_val, date.max, time.max)

    return sorted(tasks, key=sort_key)


def list_tasks(user):
    """(pending, done), each sorted by priority then deadline. Saves the
    normalized list back, as the web endpoint always has."""
    usertodo, _ = UserTodo.objects.get_or_create(user=user)
    normalized = [normalize_task(t) for t in usertodo.tasks]
    sorted_tasks = sort_tasks(normalized)
    usertodo.tasks = normalized
    usertodo.save()
    pending = [t for t in sorted_tasks if t.get('status') == 'pending']
    done = [t for t in sorted_tasks if t.get('status') == 'done']
    return pending, done


def _lower(value, default):
    return value.lower() if isinstance(value, str) and value else default


def _locked_todo(user):
    UserTodo.objects.get_or_create(user=user)
    return UserTodo.objects.select_for_update().get(user=user)


def add_task(user, text, due_type='none', due_date=None, due_time=None, priority='medium'):
    text = (text or '').strip() if isinstance(text, str) else ''
    if not text:
        raise ServiceError("Task description cannot be empty.", field='text')
    if len(text) > TASK_TEXT_MAX:
        raise ServiceError(f"Keep the task to {TASK_TEXT_MAX} characters or fewer.", field='text')

    due_type = _lower(due_type, 'none')
    if due_type not in TASK_DUE_TYPES:
        due_type = 'none'
    priority = _lower(priority, 'medium')
    if priority not in TASK_PRIORITIES:
        priority = 'medium'

    if due_type == 'until' and not due_date:
        raise ServiceError("Due date is required for 'Until'.", field='due_date')
    if due_type == 'exact' and (not due_date or not due_time):
        raise ServiceError("Both date and time are required for 'Exact'.", field='due_date')

    with transaction.atomic():
        usertodo = _locked_todo(user)
        tasks = usertodo.tasks or []

        if len(tasks) >= TASK_LIMIT:
            raise ServiceError("You can have at most 30 tasks. Delete some old ones to add more.")

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
    return new_task


def update_task(user, task_id, body):
    """Change a task's deadline, priority or status (text is fixed once created)."""
    with transaction.atomic():
        usertodo = _locked_todo(user)
        tasks = usertodo.tasks or []

        for t in tasks:
            if t.get('id') == task_id:
                if 'due_type' in body:
                    dt = _lower(body['due_type'], '')
                    if dt in ['none', 'until', 'exact']:
                        t['due_type'] = dt
                        if dt == 'none':
                            t['due_date'] = None
                            t['due_time'] = None
                        elif dt == 'until':
                            if not body.get('due_date'):
                                raise ServiceError("Due date is required for 'Until'.", field='due_date')
                            t['due_date'] = body.get('due_date')
                            t['due_time'] = None
                        elif dt == 'exact':
                            if not body.get('due_date') or not body.get('due_time'):
                                raise ServiceError("Both date and time are required for 'Exact'.", field='due_date')
                            t['due_date'] = body.get('due_date')
                            t['due_time'] = body.get('due_time')

                if 'priority' in body:
                    pr = _lower(body['priority'], '')
                    if pr in TASK_PRIORITIES:
                        t['priority'] = pr
                if 'status' in body and body['status'] in ['pending', 'done']:
                    t['status'] = body['status']

                usertodo.tasks = tasks
                usertodo.save()
                return t

    raise ServiceError("Task not found.", status=404)


def delete_task(user, task_id):
    with transaction.atomic():
        usertodo = _locked_todo(user)
        tasks = usertodo.tasks or []
        new_tasks = [t for t in tasks if t.get('id') != task_id]
        if len(new_tasks) == len(tasks):
            raise ServiceError("Task not found.", status=404)
        usertodo.tasks = new_tasks
        usertodo.save()


# ---------------------------------------------------------------------------
# Overview, journal and insights data
# ---------------------------------------------------------------------------

def recent_hourly_grid(user_id, center, days_before=2, days_after=2):
    """Hourly ids for a few days around `center`, keyed by ISO date.

    The overview page's "today" ribbon needs the browser's own local date to
    pick the right day — the server's `today` (its OS clock, or the UTC
    template tag, whichever rendered it) can be a day off from the visitor's
    if they're in a different timezone, or simply near a midnight boundary.
    A small window covers any such gap without needing the server to guess
    the visitor's timezone."""
    start = center - timedelta(days=days_before)
    end = center + timedelta(days=days_after)
    logs = DailyData.objects.filter(user_id=user_id, date__gte=start, date__lte=end)
    return {log.date.isoformat(): hourly_ids(log) for log in logs}


def overview_logs(user_id, today, window_days=120, latest_with_content=40):
    """The recent calendar window, plus the latest days that actually hold
    something (so a long gap doesn't hide the most recent entries).
    Returns (all_data queryset, summary_logs newest first, today's log)."""
    all_data = DailyData.objects.filter(user_id=user_id).order_by('-date')
    today_log = next((log for log in all_data if log.date == today), None)

    window_start = today - timedelta(days=window_days)
    summary_logs, with_content = [], 0
    for log in all_data:
        content = has_content(log)
        if log.date >= window_start or (content and with_content < latest_with_content):
            summary_logs.append(log)
        if content:
            with_content += 1
        if log.date < window_start and with_content >= latest_with_content:
            break
    return all_data, summary_logs, today_log


def journal_logs(user_id, year, month):
    return DailyData.objects.filter(user_id=user_id, date__year=year, date__month=month).order_by('date')


def month_activity_hours(user_id, year, month, daily_logs):
    """Hours logged per activity id over a month, counting only this month's
    activities — the totals behind "Where the hours went"."""
    activity_ids = set(ActivityMapping.objects.filter(
        user_id=user_id, year=year, month=month
    ).values_list('id', flat=True))
    totals = {}
    for log in daily_logs:
        try:
            hour_list = json.loads(log.hourly_activity_logging or "[]")
        except (TypeError, ValueError):
            hour_list = []
        for hour_item in hour_list if isinstance(hour_list, list) else []:
            act_id = hour_item.get('activity') if isinstance(hour_item, dict) else None
            if act_id in activity_ids:
                totals[act_id] = totals.get(act_id, 0) + 1
    return totals


def month_insights(user_id, year, month):
    """The data the month Insights page is drawn from."""
    daily_logs = DailyData.objects.filter(user_id=user_id, date__year=year, date__month=month).order_by('date')
    monthly_obj = MonthlyHabits.objects.filter(user_id=user_id, year=year, month=month).first()
    activities = list(month_activities(user_id, year, month).values("id", "name", "color"))
    by_id = {a["id"]: a for a in activities}
    hours = month_activity_hours(user_id, year, month, daily_logs)
    return {
        "year": year,
        "month": month,
        "days_in_month": calendar.monthrange(year, month)[1],
        "goal_text": monthly_obj.goal_text if monthly_obj else "",
        "habit_names": habit_names(monthly_obj),
        "day_summaries": [day_summary(log) for log in daily_logs],
        "hourly_grid": {log.date.day: hourly_ids(log) for log in daily_logs},
        "activity_legend": activities,
        "activity_hours": [
            {"id": act_id, "name": by_id[act_id]["name"], "color": by_id[act_id]["color"], "hours": n}
            for act_id, n in sorted(hours.items(), key=lambda kv: -kv[1])
        ],
    }


def year_bounds(user_id):
    """(first year with data, this year) for year navigation."""
    oldest = DailyData.objects.filter(user_id=user_id).aggregate(Min('date'))['date__min']
    this_year = datetime.now().year
    return (oldest.year if oldest else this_year), this_year


def year_insights(user_id, year):
    """The data the year Insights page is drawn from."""
    year_min, year_max = year_bounds(user_id)
    year_logs = list(DailyData.objects.filter(user_id=user_id, date__year=year).order_by('date'))
    return {
        "year": year,
        "year_min": year_min,
        "year_max": year_max,
        "day_summaries": [day_summary(log) for log in year_logs],
        "hourly_grid": {log.date.isoformat(): hourly_ids(log) for log in year_logs},
        "activity_legend": list(ActivityMapping.objects.filter(
            user_id=user_id, year=year
        ).order_by('id').values("id", "name", "color", "month")),
    }
