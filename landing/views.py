from django.shortcuts import render


def landing_page(request):
    """Public homepage. Served at / for visitors who aren't signed in (see
    mainpage.views.main_page_view) and at /landing/ for everyone."""
    return render(request, 'landing/landing.html')


def onboarding_view(request):
    """Placeholder for the onboarding flow the landing CTA leads to."""
    return render(request, 'landing/onboarding.html')
