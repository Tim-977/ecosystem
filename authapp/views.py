import re
from datetime import date

from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET
from mainpage.models import ActivityMapping, DailyData, MonthlyHabits, UserTodo

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
        username = request.POST.get('username', '').strip()
        email = request.POST.get('email')
        password = request.POST.get('password')
        confirm_password = request.POST.get('confirm_password')

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

        else:
            user = User.objects.create_user(username=username, email=email, password=password)
            login(request, user)
            return redirect('settings')

    return render(request, 'authapp/signup.html', {'error_message': error_message})


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
