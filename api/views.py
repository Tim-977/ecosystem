"""Mobile API views (/api/v1/).

Every private resource is looked up through the authenticated user's id; no
endpoint takes an owner from the request. The rules come from the same
services the website uses (mainpage.services, authapp.services).
"""
import calendar
from datetime import date

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import update_last_login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from authapp import services as account
from authapp.forms import GeneralSettingsForm, PersonalizationForm
from authapp.utils.ip_utils import get_client_ip
from authapp.views import attach_onboarding
from landing.models import OnboardingResponse
from landing.views import clean_answers
from mainpage import services
from mainpage.models import DailyData, MonthlyHabits
from mainpage.ratings import SCALES

from . import serializers as s
from .exceptions import error_response

User = get_user_model()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def user_payload(user):
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email or '',
        'preferred_name': user.preferred_name or '',
        'display_name': user.preferred_name or user.username,
        'b_day': user.b_day.isoformat() if user.b_day else None,
        'gender': user.gender,
        'rating_format': user.rating_format,
        'has_seen_tour': user.has_seen_tour,
        'date_joined': user.date_joined.isoformat() if user.date_joined else None,
        # the words mood/productivity are rated with in word mode (stored 1–10)
        'rating_scales': {kind: [{'value': v, 'word': w} for v, w in pairs] for kind, pairs in SCALES.items()},
        'limits': {
            'thoughts': services.THOUGHTS_MAX,
            'tasks': services.TASK_LIMIT,
            'task_text': services.TASK_TEXT_MAX,
            'activities_per_month': services.ACTIVITY_LIMIT,
            'activity_name': services.ACTIVITY_NAME_MAX,
            'habit_slots': services.HABIT_SLOTS,
            'habit_name': services.HABIT_NAME_MAX,
        },
    }


def issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def check_month(year, month):
    if not (1900 <= year <= 2100 and 1 <= month <= 12):
        raise NotFound('No such month.')


def form_error(form):
    fields = {field: [str(e) for e in errors] for field, errors in form.errors.items()}
    first = next((m for ms in fields.values() for m in ms), 'Check the highlighted fields.')
    return error_response(400, 'invalid', first, fields)


def stored_sleep(user_id, day):
    """Bed, wake and alarm as stored for a day (no carried-over alarm)."""
    row = DailyData.objects.filter(user_id=user_id, date=day).values_list('sleep', flat=True).first()
    parts = (row or '').split(',')
    return {key: services.readd_colon(parts[i]) if len(parts) > i else ''
            for i, key in enumerate(('bed', 'wake', 'alarm'))}


def day_payload(user_id, day):
    daily = DailyData.objects.filter(user_id=user_id, date=day).first()
    monthly = MonthlyHabits.objects.filter(user_id=user_id, year=day.year, month=day.month).first()
    bed, wake, alarm, alarm_is_default = services.sleep_form_values(daily, user_id, day)
    return {
        'date': day.isoformat(),
        'mood': daily.mood_rating if daily else None,
        'productivity': daily.productivity_score if daily else None,
        'sleep': {
            'bed': bed, 'wake': wake, 'alarm': alarm,
            # an untouched night shows the last alarm entered; it is saved with the day
            'alarm_is_default': alarm_is_default,
            'hours': round(services.sleep_hours(daily), 2) if daily else 0,
        },
        'habits': services.habit_bits(daily),
        'habit_names': services.habit_names(monthly),
        'goal_text': monthly.goal_text if monthly else '',
        'thoughts': (daily.thoughts or '') if daily else '',
        'self_reflection': (daily.self_reflection or '') if daily else '',
        'hourly': services.hourly_ids(daily) if daily else [None] * 24,
        'activities': list(services.month_activities(user_id, day.year, day.month).values('id', 'name', 'color')),
        'logged_days': services.logged_days(user_id, day.year, day.month),
        'days_in_month': calendar.monthrange(day.year, day.month)[1],
    }


def activity_payload(activity):
    return {'id': activity.id, 'name': activity.name, 'color': activity.color,
            'year': activity.year, 'month': activity.month}


def habits_payload(user_id, year, month):
    monthly = MonthlyHabits.objects.filter(user_id=user_id, year=year, month=month).first()
    return {
        'year': year,
        'month': month,
        'days_in_month': calendar.monthrange(year, month)[1],
        'goal_text': monthly.goal_text if monthly else '',
        'habits': services.habit_names(monthly),
        'habit_days': services.habit_days(user_id, year, month),
    }


def tasks_payload(user):
    pending, done = services.list_tasks(user)
    return {'pending': pending, 'done': done, 'limit': services.TASK_LIMIT}


def confirm_password(request):
    ser = s.PasswordSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    if not request.user.check_password(ser.validated_data['password']):
        message = 'Incorrect password. Please try again.'
        return error_response(400, 'invalid_password', message, {'password': [message]})
    return None


class AuthView(APIView):
    """Sign-in endpoints: no credentials needed, throttled per address."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'


class SensitiveView(APIView):
    """Password-confirmed account actions, throttled per person."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'sensitive'


# ---------------------------------------------------------------------------
# health + auth
# ---------------------------------------------------------------------------

class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'ok': True, 'api': 'v1'})


class LoginView(AuthView):
    def post(self, request):
        ser = s.LoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ip = get_client_ip(request)

        # same lockout as the website: 10 failures per address per hour
        if account.login_blocked(ip):
            return error_response(429, 'login_blocked', account.LOGIN_BLOCKED_MESSAGE)

        user = authenticate(request, username=ser.validated_data['username'].strip(),
                            password=ser.validated_data['password'])
        if user is None:
            account.record_login_attempt(ip, False)
            return error_response(401, 'invalid_credentials', account.LOGIN_FAILED_MESSAGE)

        account.record_login_attempt(ip, True)
        update_last_login(None, user)
        return Response({**issue_tokens(user), 'user': user_payload(user)})


class SignupView(AuthView):
    def post(self, request):
        ser = s.SignupSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        username = data['username'].strip()
        email = data['email'].strip()
        ip = get_client_ip(request)

        blocked = account.signup_blocked(ip)
        problem = account.signup_error(username, email, data['password'], data['confirm_password'], blocked)
        if problem:
            if problem == account.SIGNUP_BLOCKED_MESSAGE:
                return error_response(429, 'signup_blocked', problem)
            field = 'confirm_password' if 'match' in problem else 'email' if 'email' in problem else 'username'
            return error_response(400, 'invalid', problem, {field: [problem]})

        # The website doesn't check password strength yet; the API applies the
        # validators configured in AUTH_PASSWORD_VALIDATORS.
        try:
            validate_password(data['password'], user=User(username=username, email=email))
        except DjangoValidationError as e:
            return error_response(400, 'invalid', e.messages[0], {'password': list(e.messages)})

        try:
            with transaction.atomic():
                user = User.objects.create_user(username=username, email=email, password=data['password'])
        except IntegrityError:
            message = 'Username already taken. Choose another.'
            return error_response(400, 'invalid', message, {'username': [message]})

        account.record_signup(ip)
        # answers from the pre-signup onboarding: rating format + preferred name
        attach_onboarding(user, {'answers': clean_answers(data.get('onboarding') or {}), 'session_key': ''})
        user.refresh_from_db()
        update_last_login(None, user)
        return Response({**issue_tokens(user), 'user': user_payload(user)}, status=status.HTTP_201_CREATED)


class RefreshView(TokenRefreshView):
    """Exchange a refresh token for a new access token and a new refresh
    token; the old refresh token is blacklisted."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'


class LogoutView(APIView):
    """Blacklist a refresh token. Works without an access token, so a phone
    whose access token already expired can still sign out properly."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get('refresh') if isinstance(request.data, dict) else None
        if isinstance(token, str) and token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass  # already invalid, expired or blacklisted
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# account
# ---------------------------------------------------------------------------

class MeView(APIView):
    def get(self, request):
        return Response(user_payload(request.user))

    def patch(self, request):
        ser = s.MeUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        user = request.user

        # Profile and personal details go through the Settings page's own forms.
        forms = []
        if 'username' in data or 'email' in data:
            forms.append(GeneralSettingsForm({
                'username': data.get('username', user.username),
                'email': data.get('email', user.email or ''),
            }, user_instance=user))
        if any(k in data for k in ('preferred_name', 'gender', 'b_day')):
            gender = data['gender'] if 'gender' in data else user.gender
            b_day = data['b_day'] if 'b_day' in data else user.b_day
            forms.append(PersonalizationForm({
                'preferred_name': data.get('preferred_name', user.preferred_name or ''),
                'gender': str(gender) if gender else '',
                'b_day': b_day.isoformat() if b_day else '',
            }, user_instance=user))
        for form in forms:
            if not form.is_valid():
                return form_error(form)

        with transaction.atomic():
            for form in forms:
                form.save()
            fields = [k for k in ('rating_format', 'has_seen_tour') if k in data]
            for k in fields:
                setattr(user, k, data[k])
            if fields:
                user.save(update_fields=fields)
        user.refresh_from_db()
        return Response(user_payload(user))


class OnboardingView(APIView):
    def get(self, request):
        row = OnboardingResponse.objects.filter(user=request.user).first()
        return Response({'answers': row.answers if row else {}, 'completed': bool(row and row.completed)})


class ExportView(SensitiveView):
    """The same JSON file as Settings → Export all data."""

    def post(self, request):
        problem = confirm_password(request)
        if problem:
            return problem
        response = HttpResponse(account.export_json(request.user), content_type='application/json')
        response['Content-Disposition'] = 'attachment; filename="user_data.json"'
        return response


class ClearLogsView(SensitiveView):
    def post(self, request):
        problem = confirm_password(request)
        if problem:
            return problem
        account.clear_logs(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeleteAccountView(SensitiveView):
    def post(self, request):
        problem = confirm_password(request)
        if problem:
            return problem
        user = request.user
        with transaction.atomic():
            # sign out every device before the account goes
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)
            account.delete_account(user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# days
# ---------------------------------------------------------------------------

class DayView(APIView):
    def get(self, request, day):
        services.check_day_allowed(day)
        return Response(day_payload(request.user.id, day))

    def patch(self, request, day):
        ser = s.DayUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        changes = {k: data[k] for k in ('mood', 'productivity', 'habits', 'thoughts', 'self_reflection', 'hourly')
                   if k in data}
        if 'sleep' in data:
            # bed, wake and alarm are stored together; keep whichever weren't sent
            current = stored_sleep(request.user.id, day)
            changes['sleep'] = {k: data['sleep'].get(k, current[k]) for k in ('bed', 'wake', 'alarm')}
        if changes:
            services.update_day(request.user.id, day, changes)
        else:
            services.check_day_allowed(day)
        return Response(day_payload(request.user.id, day))


class CalendarView(APIView):
    """Which days of a month hold entries (for date pickers)."""

    def get(self, request, year, month):
        check_month(year, month)
        return Response({
            'year': year,
            'month': month,
            'days_in_month': calendar.monthrange(year, month)[1],
            'logged_days': services.logged_days(request.user.id, year, month),
        })


# ---------------------------------------------------------------------------
# activities
# ---------------------------------------------------------------------------

class ActivityListView(APIView):
    def get(self, request):
        try:
            year, month = int(request.query_params.get('year')), int(request.query_params.get('month'))
        except (TypeError, ValueError):
            return error_response(400, 'invalid', 'Pass year and month.')
        check_month(year, month)
        return Response([activity_payload(a) for a in services.month_activities(request.user.id, year, month)])

    def post(self, request):
        ser = s.ActivityCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        activity = services.create_activity(request.user.id, d['year'], d['month'], d['name'], d['color'])
        return Response(activity_payload(activity), status=status.HTTP_201_CREATED)


class ActivityDetailView(APIView):
    def patch(self, request, pk):
        ser = s.ActivityUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        current = services.get_activity(request.user.id, pk)
        activity = services.update_activity(
            request.user.id, pk,
            ser.validated_data.get('name', current.name),
            ser.validated_data.get('color', current.color),
        )
        return Response(activity_payload(activity))

    def delete(self, request, pk):
        services.delete_activity(request.user.id, pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# tasks
# ---------------------------------------------------------------------------

class TaskListView(APIView):
    def get(self, request):
        return Response(tasks_payload(request.user))

    def post(self, request):
        ser = s.TaskCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        task = services.add_task(
            request.user, d['text'],
            due_type=d['due_type'],
            due_date=d['due_date'].isoformat() if d.get('due_date') else None,
            due_time=d.get('due_time') or None,
            priority=d['priority'],
        )
        return Response(task, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    def patch(self, request, pk):
        ser = s.TaskUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        body = dict(ser.validated_data)
        if body.get('due_date'):
            body['due_date'] = body['due_date'].isoformat()
        task = services.update_task(request.user, pk, body)
        return Response(task)

    def delete(self, request, pk):
        services.delete_task(request.user, pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# habits (per month)
# ---------------------------------------------------------------------------

class HabitsView(APIView):
    def get(self, request, year, month):
        check_month(year, month)
        return Response(habits_payload(request.user.id, year, month))

    def put(self, request, year, month):
        check_month(year, month)
        ser = s.HabitsUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        current = MonthlyHabits.objects.filter(user_id=request.user.id, year=year, month=month).first()
        goal = ser.validated_data.get('goal_text', current.goal_text if current else '')
        services.save_month_habits(request.user.id, year, month, goal,
                                   [h.strip() for h in ser.validated_data['habits']])
        return Response(habits_payload(request.user.id, year, month))


class HabitClearView(APIView):
    def post(self, request, year, month):
        check_month(year, month)
        ser = s.HabitClearSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        services.clear_habit(request.user.id, year, month, ser.validated_data['index'])
        return Response(habits_payload(request.user.id, year, month))


# ---------------------------------------------------------------------------
# journal + insights
# ---------------------------------------------------------------------------

class JournalView(APIView):
    def get(self, request, year, month):
        check_month(year, month)
        entries = [
            {'date': log.date.isoformat(), 'thoughts': log.thoughts or '', 'self_reflection': log.self_reflection or ''}
            for log in services.journal_logs(request.user.id, year, month)
            if log.thoughts or log.self_reflection
        ]
        return Response({
            'year': year,
            'month': month,
            'days_in_month': calendar.monthrange(year, month)[1],
            'entries': entries,
        })


class OverviewView(APIView):
    """What the website's overview page is drawn from."""

    def get(self, request):
        today = date.today()
        # the phone may be a timezone ahead of or behind this machine
        asked = request.query_params.get('today')
        if asked:
            try:
                asked_date = date.fromisoformat(asked)
            except ValueError:
                asked_date = None
            if asked_date and abs((asked_date - today).days) <= 1:
                today = asked_date

        user_id = request.user.id
        monthly = MonthlyHabits.objects.filter(user_id=user_id, year=today.year, month=today.month).first()
        _, summary_logs, today_log = services.overview_logs(user_id, today)
        return Response({
            'today': today.isoformat(),
            'habit_names': services.habit_names(monthly),
            'day_summaries': [services.day_summary(log) for log in summary_logs],
            'today_hourly': services.hourly_ids(today_log) if today_log else None,
            'activities': list(services.month_activities(user_id, today.year, today.month).values('id', 'name', 'color')),
        })


class MonthInsightsView(APIView):
    def get(self, request, year, month):
        check_month(year, month)
        return Response(services.month_insights(request.user.id, year, month))


class YearInsightsView(APIView):
    def get(self, request, year):
        check_month(year, 1)
        return Response(services.year_insights(request.user.id, year))

