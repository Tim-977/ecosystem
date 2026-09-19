import json
from datetime import date
import logging

from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_POST

from . import services
from .forms import GeneralSettingsForm, PersonalizationForm
from .services import EnhancedJSONEncoder  # noqa: F401 (kept importable from here)
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
    """Link onboarding answers to the new account and apply the ones that
    shape it: the rating format and the name they asked to be called."""
    from landing.models import OnboardingResponse

    answers = data.get('answers') or {}
    if not answers:
        return

    changed = []
    if answers.get('scale') in dict(User.RATING_FORMAT_CHOICES):
        user.rating_format = answers['scale']
        changed.append('rating_format')
    if answers.get('name') and not user.preferred_name:
        user.preferred_name = answers['name'][:100]
        changed.append('preferred_name')
    if changed:
        user.save(update_fields=changed)

    try:
        if data.get('session_key'):
            OnboardingResponse.objects.filter(session_key=data['session_key'], user=None).delete()
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

        if services.login_blocked(ip):
            requires_captcha = True
            error_message = services.LOGIN_BLOCKED_MESSAGE
        else:
            user = authenticate(request, username=username, password=password)
            if user is not None:
                services.record_login_attempt(ip, True)
                login(request, user)
                return redirect(next_url)
            else:
                services.record_login_attempt(ip, False)
                error_message = services.LOGIN_FAILED_MESSAGE

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

        requires_captcha = services.signup_blocked(ip)
        # passwords match, username rules, username/email free, then the rate limit
        error_message = services.signup_error(username, email, password, confirm_password, requires_captcha)

        if not error_message:
            user = User.objects.create_user(username=username, email=email, password=password)
            services.record_signup(ip)
            onboarding = collect_onboarding(request)
            login(request, user)
            attach_onboarding(user, onboarding)
            return redirect('main_page')

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
        # Every day, monthly habit, activity and task; the account stays
        services.clear_logs(request.user)

        messages.success(request, "Your logs have been cleared.")
    return redirect('settings')


@login_required
@require_POST
def tour_state_view(request):
    """Remember whether the guided tour still needs to run for this account.

    Posting {"seen": false} is what the Replay button uses, so the tour can be
    taken again from another device.
    """
    try:
        seen = bool(json.loads(request.body or '{}').get('seen', True))
    except (ValueError, TypeError):
        seen = True

    request.user.has_seen_tour = seen
    request.user.save(update_fields=['has_seen_tour'])
    return JsonResponse({'ok': True, 'seen': seen})


@login_required
@require_POST
def rating_format_view(request):
    """Switch how mood and productivity are entered and shown. Stored ratings
    are 1–10 in both formats, so nothing else changes."""
    try:
        value = json.loads(request.body or '{}').get('format')
    except (ValueError, TypeError, AttributeError):
        value = None
    if value not in dict(User.RATING_FORMAT_CHOICES):
        return JsonResponse({'ok': False}, status=400)

    request.user.rating_format = value
    request.user.save(update_fields=['rating_format'])
    return JsonResponse({'ok': True, 'format': value})


@login_required
def delete_account_view(request):
    if request.method == 'POST':
        # The account and all of its data
        services.delete_account(request.user)

        # Log the user out, just to be sure
        logout(request)

        return redirect('/')
    else:
        # If someone GETs this URL, just redirect them to the settings page
        return redirect('settings')


@login_required
def download_user_data_view(request):
    json_data = services.export_json(request.user)

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
