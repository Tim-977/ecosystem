from django.contrib.auth import authenticate, login, logout
from django.shortcuts import render, redirect
from django.contrib.auth import get_user_model
from django.views.decorators.http import require_GET

User = get_user_model()

#TODO:
# - clean urls.py imports
# - check hashing function
# - track cookies tail and check for conflicts


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
            # Create the user using create_user() to handle password hashing
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password
            )
            login(request, user)
            return redirect('/')  # Redirect to main page after registration

    return render(request, 'authapp/signup.html', {'error_message': error_message})
