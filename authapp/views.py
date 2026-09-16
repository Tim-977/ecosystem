import json
import re
from datetime import date, datetime, timedelta
import logging

from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.http import require_GET
from mainpage.models import ActivityMapping, DailyData, MonthlyHabits, UserTodo

from .forms import GeneralSettingsForm, PersonalizationForm
from .models import LoginAttempt, SignupAttempt
from django.db import OperationalError, ProgrammingError
from .utils.ip_utils import get_client_ip

from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent / "security_logs"
LOG_DIR.mkdir(exist_ok=True)
_log_file = LOG_DIR / "suspicious_activity.log"
security_logger = logging.getLogger("security")
if not security_logger.handlers:
    handler = logging.FileHandler(_log_file)
    formatter = logging.Formatter("%(asctime)s %(message)s")
    handler.setFormatter(formatter)
    security_logger.addHandler(handler)
    security_logger.setLevel(logging.INFO)

User = get_user_model()


class EnhancedJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return super().default(obj)


def collect_onboarding(request):
    """Read pre-signup onboarding answers before login() cycles the session.

    Prefers the session copy the onboarding flow wrote; falls back to the
    hidden field the signup page fills from the visitor's own browser, for
    people whose session was dropped between the two pages.
    """
    from landing.views import SESSION_KEY, clean_answers

    answers = request.session.get(SESSION_KEY) or {}
    if not answers:
        try:
            answers = clean_answers(json.loads(request.POST.get('onboarding') or '{}'))
        except (ValueError, TypeError):
            answers = {}
    return {'answers': answers, 'session_key': request.session.session_key or ''}


def attach_onboarding(user, data):
    """Link onboarding answers to the new account. Nothing reads them yet."""
    from landing.models import OnboardingResponse

    answers = data.get('answers') or {}
    if not answers:
        return
    try:
        OnboardingResponse.objects.filter(session_key=data.get('session_key') or '', user=None).delete()
        OnboardingResponse.objects.update_or_create(
            user=user,
            defaults={
                'answers': answers,
                'session_key': data.get('session_key') or '',
                'completed': bool(answers.get('completed')),
            },
        )
    except (ProgrammingError, OperationalError):
        pass


@require_GET
def logout_view(request):
    logout(request)
    request.session.flush()
    return redirect('/auth/login/')


def login_page(request):
    if request.user.is_authenticated:
        return redirect('/')

    error_message = None
    requires_captcha = False  # TODO: integrate reCAPTCHA when this is True

    if request.method == 'POST':
        ip = get_client_ip(request)
        next_url = request.POST.get('next', '/')
        username = request.POST.get('username')
        password = request.POST.get('password')

        one_hour_ago = timezone.now() - timedelta(hours=1)
        try:
            failed_count = LoginAttempt.objects.filter(
                ip_address=ip,
                was_success=False,
                timestamp__gte=one_hour_ago,
            ).count()
        except (ProgrammingError, OperationalError):
            failed_count = 0

        if failed_count >= 10:
            requires_captcha = True
            security_logger.warning('Excessive failed logins from %s', ip)
            error_message = 'Too many failed login attempts. Please try again later.'
        else:
            user = authenticate(request, username=username, password=password)
            if user is not None:
                try:
                    LoginAttempt.objects.create(ip_address=ip, was_success=True)
                except (ProgrammingError, OperationalError):
                    pass
                login(request, user)
                return redirect(next_url)
            else:
                try:
                    LoginAttempt.objects.create(ip_address=ip, was_success=False)
                except (ProgrammingError, OperationalError):
                    pass
                error_message = 'Invalid username or password. Please try again.'

    else:
        next_url = request.GET.get('next', '/')

    return render(
        request,
        'authapp/login.html',
        {
            'next': next_url,
            'error_message': error_message,
            'requires_captcha': requires_captcha,
        },
    )


def signup_page(request):
    if request.user.is_authenticated:
        return redirect('/')

    error_message = None
    requires_captcha = False  # TODO: integrate reCAPTCHA when this is True

    if request.method == 'POST':
        ip = get_client_ip(request)
        username = request.POST.get('username', '').strip()
        email = request.POST.get('email')
        password = request.POST.get('password')
        confirm_password = request.POST.get('confirm_password')

        one_hour_ago = timezone.now() - timedelta(hours=1)
        try:
            recent_count = SignupAttempt.objects.filter(
                ip_address=ip,
                timestamp__gte=one_hour_ago,
            ).count()
        except (ProgrammingError, OperationalError):
            recent_count = 0

        if recent_count >= 3:
            requires_captcha = True
            security_logger.warning('Exceeded signup rate from %s', ip)
            error_message = 'Too many accounts created from this IP. Please try later.'

        # 1) Password match
        if password != confirm_password:
            error_message = "Passwords do not match. Please try again."
        
        # 2) Letters/digits only + length check
        elif not re.match(r'^[A-Za-z0-9]{3,12}$', username):
            error_message = "Username must be 3–12 characters and contain only letters/digits."
        
        # 3) Already taken?
        elif User.objects.filter(username=username).exists():
            error_message = "Username already taken. Choose another."

        # 4) Email check
        elif User.objects.filter(email=email).exists():
            error_message = "An account with this email already exists."

        elif not error_message:
            user = User.objects.create_user(username=username, email=email, password=password)
            try:
                SignupAttempt.objects.create(ip_address=ip)
            except (ProgrammingError, OperationalError):
                pass
            onboarding = collect_onboarding(request)
            login(request, user)
            attach_onboarding(user, onboarding)
            return redirect('welcome')

    return render(
        request,
        'authapp/signup.html',
        {
            'error_message': error_message,
            'requires_captcha': requires_captcha,
        },
    )


@login_required
def settings_view(request):
    user = request.user

    if request.method == 'POST':
        if 'save_general' in request.POST:
            general_form = GeneralSettingsForm(request.POST, user_instance=user)
            personalization_form = PersonalizationForm(user_instance=user)  # unbound

            if general_form.is_valid():
                general_form.save()
                return redirect('settings')
            else:
                # Reset username and email to previous valid values
                general_form.fields['username'].initial = user.username
                general_form.fields['email'].initial = user.email

                general_form.data = general_form.data.copy()
                general_form.data['username'] = user.username
                general_form.data['email'] = user.email


        elif 'save_personalization' in request.POST:
            personalization_form = PersonalizationForm(request.POST, user_instance=user)
            general_form = GeneralSettingsForm(user_instance=user)  # unbound

            if personalization_form.is_valid():
                personalization_form.save()
                return redirect('settings')
            # Same idea: if invalid, let the code continue so errors show.

        else:
            # If neither button is recognized, just reload with existing data
            general_form = GeneralSettingsForm(user_instance=user)
            personalization_form = PersonalizationForm(user_instance=user)

    else:
        # GET request: display forms with current user data
        general_form = GeneralSettingsForm(user_instance=user)
        personalization_form = PersonalizationForm(user_instance=user)

    return render(request, 'authapp/settings.html', {
        'general_form': general_form,
        'personalization_form': personalization_form,
        'now': date.today(),
        })

@login_required
def clear_logs_view(request):
    if request.method == 'POST':
        # Delete from each model where user = request.user
        # ActivityMapping uses user_id
        ActivityMapping.objects.filter(user_id=request.user.id).delete()

        # UserTodo is a OneToOne with 'user'
        UserTodo.objects.filter(user=request.user).delete()

        # DailyData uses user_id
        DailyData.objects.filter(user_id=request.user.id).delete()

        # MonthlyHabits uses user_id
        MonthlyHabits.objects.filter(user_id=request.user.id).delete()

        messages.success(request, "Your logs have been cleared.")
    return redirect('settings')


@login_required
def welcome_page(request):
    return render(request, 'authapp/welcome.html')


@login_required
def delete_account_view(request):
    if request.method == 'POST':
        user = request.user

        # Delete user data from 'mainpage' tables
        ActivityMapping.objects.filter(user_id=user.id).delete()
        UserTodo.objects.filter(user=user).delete()
        DailyData.objects.filter(user_id=user.id).delete()
        MonthlyHabits.objects.filter(user_id=user.id).delete()

        # Delete the actual user account
        user.delete()

        # Log the user out, just to be sure
        logout(request)

        return redirect('/')
    else:
        # If someone GETs this URL, just redirect them to the settings page
        return redirect('settings')


@login_required
def download_user_data_view(request):
    user = request.user

    activity_mappings = ActivityMapping.objects.filter(user_id=user.id).values()
    user_todo = UserTodo.objects.filter(user=user).values()
    daily_data = DailyData.objects.filter(user_id=user.id).values()
    monthly_habits = MonthlyHabits.objects.filter(user_id=user.id).values()

    data = {
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
        },
        "activity_mappings": list(activity_mappings),
        "user_todo": list(user_todo),
        "daily_data": list(daily_data),
        "monthly_habits": list(monthly_habits),
    }

    json_data = json.dumps(data, indent=2, cls=EnhancedJSONEncoder)

    response = HttpResponse(json_data, content_type='application/json')
    response['Content-Disposition'] = 'attachment; filename="user_data.json"'
    return response


@login_required
def confirm_password_before_download_view(request):
    error = None

    if request.method == 'POST':
        password = request.POST.get('password')

        user = authenticate(request, username=request.user.username, password=password)
        
        if user:
            return download_user_data_view(request)
        else:
            error = "Incorrect password. Please try again."

    return render(request, 'authapp/confirm_download.html', {'error': error})


@login_required
def developer_info_view(request):
    return render(request, 'authapp/developer_info.html')

    
@login_required
def changelog_view(request):
    return render(request, 'authapp/changelog.html')


@login_required
def license_view(request):
    return render(request, 'authapp/license.html')


@login_required
def feedback_view(request):
    return render(request, 'authapp/feedback.html')
