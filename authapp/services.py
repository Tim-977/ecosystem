"""Account rules shared by the web auth pages (authapp.views) and the mobile
API (api.views): sign-in/sign-up rate limits, sign-up checks, the data export
and deleting a person's data."""
import json
import logging
import re
from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.db import OperationalError, ProgrammingError, transaction
from django.utils import timezone

from mainpage.models import ActivityMapping, DailyData, MonthlyHabits, UserTodo

from .models import LoginAttempt, SignupAttempt

security_logger = logging.getLogger("security")

LOGIN_FAILURES_PER_HOUR = 10
SIGNUPS_PER_HOUR = 3

LOGIN_BLOCKED_MESSAGE = 'Too many failed login attempts. Please try again later.'
SIGNUP_BLOCKED_MESSAGE = 'Too many accounts created from this IP. Please try later.'
LOGIN_FAILED_MESSAGE = 'Invalid username or password. Please try again.'


def login_blocked(ip):
    """True after 10 failed sign-ins from this address within the hour."""
    one_hour_ago = timezone.now() - timedelta(hours=1)
    try:
        failed_count = LoginAttempt.objects.filter(
            ip_address=ip,
            was_success=False,
            timestamp__gte=one_hour_ago,
        ).count()
    except (ProgrammingError, OperationalError):
        failed_count = 0
    if failed_count >= LOGIN_FAILURES_PER_HOUR:
        security_logger.warning('Excessive failed logins from %s', ip)
        return True
    return False


def record_login_attempt(ip, success):
    try:
        LoginAttempt.objects.create(ip_address=ip, was_success=success)
    except (ProgrammingError, OperationalError):
        pass


def signup_blocked(ip):
    """True after 3 accounts were created from this address within the hour."""
    one_hour_ago = timezone.now() - timedelta(hours=1)
    try:
        recent_count = SignupAttempt.objects.filter(
            ip_address=ip,
            timestamp__gte=one_hour_ago,
        ).count()
    except (ProgrammingError, OperationalError):
        recent_count = 0
    if recent_count >= SIGNUPS_PER_HOUR:
        security_logger.warning('Exceeded signup rate from %s', ip)
        return True
    return False


def record_signup(ip):
    try:
        SignupAttempt.objects.create(ip_address=ip)
    except (ProgrammingError, OperationalError):
        pass


def signup_error(username, email, password, confirm_password, blocked=False):
    """The first reason a sign-up can't go ahead, in the order the sign-up page
    checks them, or None if the account can be created. `blocked` is
    signup_blocked() for the visitor's address."""
    User = get_user_model()
    if password != confirm_password:
        return "Passwords do not match. Please try again."
    if not re.match(r'^[A-Za-z0-9]{3,12}$', username or ''):
        return "Username must be 3–12 characters and contain only letters/digits."
    if User.objects.filter(username=username).exists():
        return "Username already taken. Choose another."
    if User.objects.filter(email=email).exists():
        return "An account with this email already exists."
    return SIGNUP_BLOCKED_MESSAGE if blocked else None


class EnhancedJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return super().default(obj)


def export_data(user):
    """Everything the "Export all data" download contains."""
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
        },
        "activity_mappings": list(ActivityMapping.objects.filter(user_id=user.id).values()),
        "user_todo": list(UserTodo.objects.filter(user=user).values()),
        "daily_data": list(DailyData.objects.filter(user_id=user.id).values()),
        "monthly_habits": list(MonthlyHabits.objects.filter(user_id=user.id).values()),
    }


def export_json(user):
    return json.dumps(export_data(user), indent=2, cls=EnhancedJSONEncoder)


def clear_logs(user):
    """Delete every day, monthly habit, activity and task. The account stays."""
    with transaction.atomic():
        ActivityMapping.objects.filter(user_id=user.id).delete()
        UserTodo.objects.filter(user=user).delete()
        DailyData.objects.filter(user_id=user.id).delete()
        MonthlyHabits.objects.filter(user_id=user.id).delete()


def delete_account(user):
    """Remove the account and all of its data."""
    with transaction.atomic():
        clear_logs(user)
        user.delete()
