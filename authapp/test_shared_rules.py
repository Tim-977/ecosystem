"""The website's sign-in, sign-up and data pages behave as before now that
their rules live in authapp/services.py (shared with the mobile API)."""
import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from landing.models import OnboardingResponse
from mainpage.models import DailyData

from .models import LoginAttempt, SignupAttempt

User = get_user_model()


class WebAccountTests(TestCase):
    def signup(self, **overrides):
        data = {'username': 'new1', 'email': 'new1@example.invalid',
                'password': 'pw-12345-long', 'confirm_password': 'pw-12345-long'}
        data.update(overrides)
        return self.client.post(reverse('signup'), data)

    def test_login_lockout_and_attempts(self):
        User.objects.create_user(username='web1', password='pw-12345')
        bad = self.client.post(reverse('login'), {'username': 'web1', 'password': 'nope'})
        self.assertContains(bad, 'Invalid username or password. Please try again.')
        self.assertEqual(LoginAttempt.objects.filter(was_success=False).count(), 1)
        for _ in range(9):
            LoginAttempt.objects.create(ip_address='127.0.0.1', was_success=False)
        blocked = self.client.post(reverse('login'), {'username': 'web1', 'password': 'pw-12345'})
        self.assertContains(blocked, 'Too many failed login attempts. Please try again later.')
        LoginAttempt.objects.all().delete()
        ok = self.client.post(reverse('login'), {'username': 'web1', 'password': 'pw-12345'})
        self.assertEqual(ok.status_code, 302)

    def test_signup_checks_in_order(self):
        User.objects.create_user(username='taken', email='taken@example.invalid', password='pw')
        self.assertContains(self.signup(confirm_password='other'), 'Passwords do not match. Please try again.')
        self.assertContains(self.signup(username='x!'), 'Username must be 3–12 characters')
        self.assertContains(self.signup(username='taken'), 'Username already taken. Choose another.')
        self.assertContains(self.signup(email='taken@example.invalid'), 'An account with this email already exists.')
        for _ in range(3):
            SignupAttempt.objects.create(ip_address='127.0.0.1')
        self.assertContains(self.signup(), 'Too many accounts created from this IP. Please try later.')
        # the mismatch message still wins over the rate limit, as before
        self.assertContains(self.signup(confirm_password='other'), 'Passwords do not match. Please try again.')
        self.assertFalse(User.objects.filter(username='new1').exists())
        SignupAttempt.objects.all().delete()
        self.assertEqual(self.signup().status_code, 302)
        self.assertEqual(SignupAttempt.objects.count(), 1)

    def test_signup_links_session_onboarding(self):
        session = self.client.session
        session['onboarding'] = {'name': 'Ada', 'scale': 'words'}
        session.save()
        OnboardingResponse.objects.create(session_key=session.session_key, answers={'name': 'Ada'})
        self.signup()
        user = User.objects.get(username='new1')
        self.assertEqual(OnboardingResponse.objects.get(user=user).answers, {'name': 'Ada', 'scale': 'words'})
        self.assertFalse(OnboardingResponse.objects.filter(user=None).exists())

    def test_export_clear_and_delete(self):
        user = User.objects.create_user(username='web1', password='pw-12345', email='w@example.invalid')
        self.client.force_login(user)
        DailyData.objects.create(user_id=user.id, date=date(2025, 3, 4), mood_rating=7)
        wrong = self.client.post(reverse('confirm_password_download'), {'password': 'nope'})
        self.assertContains(wrong, 'Incorrect password. Please try again.')
        export = self.client.post(reverse('confirm_password_download'), {'password': 'pw-12345'})
        self.assertEqual(export['Content-Disposition'], 'attachment; filename="user_data.json"')
        data = json.loads(export.content)
        self.assertEqual(data['user'], {'id': user.id, 'username': 'web1', 'email': 'w@example.invalid'})
        self.assertEqual(data['daily_data'][0]['date'], '2025-03-04')

        self.client.post(reverse('clear_logs'))
        self.assertFalse(DailyData.objects.exists())
        self.assertTrue(User.objects.filter(pk=user.pk).exists())
        self.client.post(reverse('delete_account'))
        self.assertFalse(User.objects.filter(pk=user.pk).exists())
