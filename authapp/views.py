from datetime import date  # Import date

from django.contrib.auth import authenticate, get_user_model, login, logout
# authapp/views.py
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET

from .forms import PersonalDataForm, SettingsForm
from .models import PersonalData

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
def personal_data_view(request):
    today = date.today()  # Get the current date

    try:
        personal_data = PersonalData.objects.get(user=request.user)
    except PersonalData.DoesNotExist:
        personal_data = None

    if request.method == 'POST':
        form = PersonalDataForm(request.POST, instance=personal_data)
        if form.is_valid():
            obj = form.save(commit=False)
            obj.user = request.user
            obj.save()
            return redirect('main_page')  # Redirect to main page after saving

    else:
        form = PersonalDataForm(instance=personal_data)

    return render(request, 'authapp/personal_data.html', {
        'form': form,
        'date': today  # Pass the current date to the template
    })


@login_required
def settings_view(request):
    # Get the user
    user = request.user

    # Get or create the PersonalData object for this user
    personal_data, created = PersonalData.objects.get_or_create(user=user)

    if request.method == 'POST':
        form = SettingsForm(
            request.POST,
            user_instance=user,
            personal_data_instance=personal_data
        )
        if form.is_valid():
            form.save()  # This updates both user + personal_data
            return redirect('settings')  # or wherever you want to go
    else:
        form = SettingsForm(
            user_instance=user,
            personal_data_instance=personal_data
        )

    return render(request, 'authapp/settings.html', {'form': form})
