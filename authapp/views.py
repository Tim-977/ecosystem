from datetime import date

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET

from .forms import GeneralSettingsForm, PersonalizationForm

User = get_user_model()


@require_GET  # Ensure only GET requests are allowed
def logout_view(request):
    logout(request)
    request.session.flush()  # Clear session data
    return redirect('/auth/login/')


def login_page(request): # Already logged in check
    if request.user.is_authenticated:
        return redirect('/') 

    error_message = None

    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        next_url = request.POST.get('next', '/')  # Default to gome page

        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect(next_url)  # Redirect if login is successful
        else:
            error_message = "Invalid username or password. Please try again."

    else:
        next_url = request.GET.get('next', '/')  # For GET requests

    return render(request, 'authapp/login.html', {'next': next_url, 'error_message': error_message})


def signup_page(request):
    if request.user.is_authenticated:
        return redirect('/')  # Redirect if already logged in

    error_message = None

    if request.method == 'POST':
        username = request.POST.get('username')
        email = request.POST.get('email')
        password = request.POST.get('password')
        confirm_password = request.POST.get('confirm_password')

        if password != confirm_password:
            error_message = "Passwords do not match. Please try again."
        elif User.objects.filter(username=username).exists():
            error_message = "Username already taken. Choose another."
        elif User.objects.filter(email=email).exists():
            error_message = "An account with this email already exists."
        else:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password
            )
            login(request, user)
            return redirect('personal_data')

    return render(request, 'authapp/signup.html', {'error_message': error_message})


@login_required
def settings_view(request):
    user = request.user

    if request.method == 'POST':
        # Check which button was pressed:
        if 'save_general' in request.POST:
            # The user clicked "Save" in the General Settings section
            general_form = GeneralSettingsForm(request.POST, user_instance=user)
            personalization_form = PersonalizationForm(user_instance=user)  # unbound
            if general_form.is_valid():
                general_form.save()
                return redirect('settings')

        elif 'save_personalization' in request.POST:
            # The user clicked "Save" in the Personalization section
            personalization_form = PersonalizationForm(request.POST, user_instance=user)
            general_form = GeneralSettingsForm(user_instance=user)  # unbound
            if personalization_form.is_valid():
                personalization_form.save()
                return redirect('settings')

        else:
            # If neither button is recognized (or Cancel was clicked), just reload
            general_form = GeneralSettingsForm(user_instance=user)
            personalization_form = PersonalizationForm(user_instance=user)
    else:
        # GET request: display forms with current user data
        general_form = GeneralSettingsForm(user_instance=user)
        personalization_form = PersonalizationForm(user_instance=user)

    return render(request, 'authapp/settings.html', {
        'general_form': general_form,
        'personalization_form': personalization_form,
    })
