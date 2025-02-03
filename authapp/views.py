from django.contrib.auth import authenticate, login
from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import login

from django.contrib.auth.hashers import make_password
from django.contrib.auth import get_user_model



def login_page(request):
    error_message = None  # Initialize the error message

    # Check if the request is a POST or GET
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        next_url = request.POST.get('next', '/')  # Default to home page if not provided

        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect(next_url)  # Redirect if login is successful
        else:
            error_message = "Invalid username or password. Please try again."  # Set the error message

    else:
        next_url = request.GET.get('next', '/')  # For GET requests, initialize next_url with the query parameter

    return render(request, 'authapp/login.html', {'next': next_url, 'error_message': error_message})


User = get_user_model()  # Use the custom user model

def signup_page(request):
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

