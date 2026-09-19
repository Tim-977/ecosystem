from datetime import timedelta

from django.urls import reverse
from rest_framework_simplejwt.tokens import AccessToken

from authapp.models import LoginAttempt, SignupAttempt
from landing.models import OnboardingResponse

from .base import PASSWORD, ApiTestCase, User


class LoginTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user('ada')

    def login(self, username='ada', password=PASSWORD):
        return self.client.post(reverse('api:login'), {'username': username, 'password': password}, format='json')

    def test_login_returns_tokens_and_profile(self):
        r = self.login()
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body['access'] and body['refresh'])
        self.assertEqual(body['user']['username'], 'ada')
        self.assertIn('rating_scales', body['user'])
        self.assertTrue(LoginAttempt.objects.filter(was_success=True).exists())

    def test_wrong_password_is_rejected_and_recorded(self):
        err = self.assertError(self.login(password='nope'), 401, 'invalid_credentials')
        self.assertEqual(err['message'], 'Invalid username or password. Please try again.')
        self.assertTrue(LoginAttempt.objects.filter(was_success=False).exists())

    def test_same_lockout_as_the_website(self):
        for _ in range(10):
            LoginAttempt.objects.create(ip_address='127.0.0.1', was_success=False)
        self.assertError(self.login(), 429, 'login_blocked')

    def test_inactive_account_cannot_log_in(self):
        self.user.is_active = False
        self.user.save()
        self.assertError(self.login(), 401, 'invalid_credentials')

    def test_missing_fields(self):
        r = self.client.post(reverse('api:login'), {}, format='json')
        err = self.assertError(r, 400, 'invalid')
        self.assertIn('username', err['fields'])


class TokenTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user('ada')

    def test_private_endpoints_need_a_token(self):
        self.assertError(self.client.get(reverse('api:me')), 401, 'not_authenticated')
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-token')
        self.assertError(self.client.get(reverse('api:me')), 401, 'token_not_valid')

    def test_website_session_does_not_open_the_api(self):
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(reverse('api:me')).status_code, 401)

    def test_expired_access_token_then_refresh(self):
        tokens = self.auth(self.user)
        expired = AccessToken.for_user(self.user)
        expired.set_exp(lifetime=-timedelta(seconds=1))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {expired}')
        self.assertError(self.client.get(reverse('api:me')), 401, 'token_not_valid')

        r = self.client.post(reverse('api:refresh'), {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(r.status_code, 200)
        fresh = r.json()
        self.assertNotEqual(fresh['refresh'], tokens['refresh'])  # rotated
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {fresh['access']}")
        self.assertEqual(self.client.get(reverse('api:me')).status_code, 200)

    def test_used_refresh_token_is_blacklisted(self):
        tokens = self.auth(self.user)
        first = self.client.post(reverse('api:refresh'), {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(first.status_code, 200)
        reuse = self.client.post(reverse('api:refresh'), {'refresh': tokens['refresh']}, format='json')
        self.assertError(reuse, 401, 'token_not_valid')

    def test_logout_blacklists_refresh(self):
        tokens = self.auth(self.user)
        self.client.credentials()  # works without an access token
        r = self.client.post(reverse('api:logout'), {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(r.status_code, 204)
        again = self.client.post(reverse('api:refresh'), {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(again.status_code, 401)
        # logging out twice is harmless
        self.assertEqual(self.client.post(reverse('api:logout'), {'refresh': tokens['refresh']}, format='json').status_code, 204)

    def test_refresh_for_deleted_account_is_401_not_500(self):
        tokens = self.auth(self.user)
        self.user.delete()
        r = self.client.post(reverse('api:refresh'), {'refresh': tokens['refresh']}, format='json')
        self.assertError(r, 401)

    def test_refresh_for_inactive_account(self):
        tokens = self.auth(self.user)
        self.user.is_active = False
        self.user.save()
        r = self.client.post(reverse('api:refresh'), {'refresh': tokens['refresh']}, format='json')
        self.assertError(r, 401)

    def test_health_is_public(self):
        self.assertEqual(self.client.get(reverse('api:health')).json(), {'ok': True, 'api': 'v1'})


class SignupTests(ApiTestCase):
    def signup(self, **overrides):
        body = {'username': 'grace1', 'email': 'grace@example.invalid',
                'password': PASSWORD, 'confirm_password': PASSWORD}
        body.update(overrides)
        return self.client.post(reverse('api:signup'), body, format='json')

    def test_signup_creates_account_and_signs_in(self):
        r = self.signup()
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertTrue(body['access'] and body['refresh'])
        user = User.objects.get(username='grace1')
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.has_seen_tour)
        self.assertEqual(SignupAttempt.objects.count(), 1)

    def test_onboarding_answers_shape_the_account(self):
        r = self.signup(onboarding={'name': 'Grace', 'scale': 'words', 'slip': ['hours', 'bogus'],
                                    'focus': 'mood', 'completed': True, 'evil': 'x' * 5000})
        self.assertEqual(r.status_code, 201, r.content)
        user = User.objects.get(username='grace1')
        self.assertEqual(user.rating_format, 'words')
        self.assertEqual(user.preferred_name, 'Grace')
        row = OnboardingResponse.objects.get(user=user)
        self.assertEqual(row.answers, {'name': 'Grace', 'scale': 'words', 'slip': ['hours'],
                                       'focus': 'mood', 'completed': True})
        self.assertTrue(row.completed)
        self.assertEqual(r.json()['user']['display_name'], 'Grace')

    def test_signup_does_not_touch_anonymous_onboarding_rows(self):
        OnboardingResponse.objects.create(session_key='', answers={'name': 'Visitor'})
        self.signup(onboarding={'name': 'Grace'})
        self.assertTrue(OnboardingResponse.objects.filter(user=None, answers={'name': 'Visitor'}).exists())

    def test_website_rules(self):
        self.make_user('taken1', email='taken@example.invalid')
        cases = [
            ({'confirm_password': 'different-Pass-1'}, 'confirm_password', 'Passwords do not match'),
            ({'username': 'no'}, 'username', 'Username must be 3–12'),
            ({'username': 'bad name!'}, 'username', 'Username must be 3–12'),
            ({'username': 'taken1'}, 'username', 'Username already taken'),
            ({'email': 'taken@example.invalid'}, 'email', 'An account with this email already exists'),
        ]
        for overrides, field, message in cases:
            with self.subTest(field=field, message=message):
                err = self.assertError(self.signup(**overrides), 400, 'invalid')
                self.assertIn(message, err['message'])
                self.assertIn(field, err['fields'])

    def test_email_is_required_and_checked(self):
        self.assertIn('email', self.assertError(self.signup(email=''), 400)['fields'])
        self.assertIn('email', self.assertError(self.signup(email='not-an-email'), 400)['fields'])

    def test_weak_passwords_are_refused(self):
        err = self.assertError(self.signup(password='12345678', confirm_password='12345678'), 400)
        self.assertIn('password', err['fields'])
        self.assertFalse(User.objects.filter(username='grace1').exists())

    def test_signup_rate_limit_matches_website(self):
        for _ in range(3):
            SignupAttempt.objects.create(ip_address='127.0.0.1')
        self.assertError(self.signup(), 429, 'signup_blocked')
        self.assertFalse(User.objects.filter(username='grace1').exists())
