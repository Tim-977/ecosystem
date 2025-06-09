#!/usr/bin/env python
"""Simulate repeated signups and logins to trigger security logging.

Run with:
    USE_POSTGRES=False python security_test.py

Ensure database migrations are applied first:
    USE_POSTGRES=False python manage.py migrate --noinput
"""
import os
import django
from django.test import Client
from django.contrib.auth import get_user_model

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ecosystem.settings")
django.setup()

from authapp.models import SignupAttempt, LoginAttempt

User = get_user_model()
client = Client()

# clean previous data
SignupAttempt.objects.all().delete()
LoginAttempt.objects.all().delete()
User.objects.filter(username__startswith="demo").delete()
User.objects.filter(username="tester").delete()

# create a user for login attempts
User.objects.create_user(username="tester", password="goodpass")

print("\n>>> Simulating signup abuse")
for i in range(3):
    client.post(
        "/auth/signup/",
        {
            "username": f"demo{i}",
            "email": f"demo{i}@example.com",
            "password": "pw123456",
            "confirm_password": "pw123456",
        },
        REMOTE_ADDR="5.5.5.5",
    )
    client.get("/auth/logout/")

response = client.post(
    "/auth/signup/",
    {
        "username": "demo_final",
        "email": "demo_final@example.com",
        "password": "pw123456",
        "confirm_password": "pw123456",
    },
    REMOTE_ADDR="5.5.5.5",
)
print("Requires CAPTCHA:", response.context.get("requires_captcha"))
print("Message:", response.context.get("error_message"))

print("\n>>> Simulating login abuse")
for _ in range(10):
    client.post(
        "/auth/login/",
        {"username": "tester", "password": "wrongpass"},
        REMOTE_ADDR="6.6.6.6",
    )

response = client.post(
    "/auth/login/",
    {"username": "tester", "password": "wrongpass"},
    REMOTE_ADDR="6.6.6.6",
)
print("Requires CAPTCHA:", response.context.get("requires_captcha"))
print("Message:", response.context.get("error_message"))

print("\nSecurity log -> authapp/security_logs/suspicious_activity.log")
