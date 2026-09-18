import json

from django.db import OperationalError, ProgrammingError
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from .models import OnboardingResponse

# Only these answers are kept, and only in these shapes. Everything else in a
# posted payload is dropped, so a stray or hostile body can't grow a row.
CHOICES = {
    'scale': {'numbers', 'words'},
    'diary': {'keep', 'used_to', 'tried', 'curious', 'no'},
    'focus': {'time', 'mood', 'habits', 'story'},
}
SLIPS = {'alarms', 'deadlines', 'hours', 'unfinished', 'consistency', 'blur'}
SESSION_KEY = 'onboarding'


def clean_answers(raw):
    """Whitelist a posted payload down to the answers the flow actually asks for."""
    if not isinstance(raw, dict):
        return {}
    out = {}

    name = raw.get('name')
    if isinstance(name, str) and name.strip():
        out['name'] = name.strip()[:40]

    for key, allowed in CHOICES.items():
        value = raw.get(key)
        if value in allowed:
            out[key] = value

    slip = raw.get('slip')
    if isinstance(slip, list):
        picked = [s for s in slip if s in SLIPS][:3]
        if picked:
            out['slip'] = picked

    if raw.get('completed') is True:
        out['completed'] = True

    return out


def landing_page(request):
    """Public homepage. Served at / for visitors who aren't signed in (see
    mainpage.views.main_page_view) and at /landing/ for everyone."""
    return render(request, 'landing/landing.html')


def onboarding_view(request):
    """The pre-signup flow the landing CTA leads to."""
    return render(request, 'landing/onboarding.html', {
        'saved': request.session.get(SESSION_KEY) or {},
    })


@require_POST
def onboarding_save(request):
    """Persist onboarding answers for a visitor who hasn't signed up yet.

    Kept in the session (so signup can pick them up) and mirrored to a row
    keyed by session, so the choices survive to the account once it exists.
    """
    try:
        answers = clean_answers(json.loads(request.body or '{}'))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False}, status=400)

    request.session[SESSION_KEY] = answers
    request.session.modified = True

    if not request.session.session_key:
        request.session.save()

    try:
        OnboardingResponse.objects.update_or_create(
            session_key=request.session.session_key or '',
            user=None,
            defaults={'answers': answers, 'completed': bool(answers.get('completed'))},
        )
    except (ProgrammingError, OperationalError):
        pass  # migrations not applied yet — the session copy still carries it

    return JsonResponse({'ok': True, 'saved': answers})
