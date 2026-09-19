from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from api.views import issue_tokens

User = get_user_model()

PASSWORD = 'quiet-River-8421'


class ApiTestCase(APITestCase):
    def setUp(self):
        super().setUp()
        cache.clear()  # throttle counters

    def make_user(self, username, **extra):
        extra.setdefault('email', f'{username.lower()}@example.invalid')
        return User.objects.create_user(username=username, password=PASSWORD, **extra)

    def auth(self, user):
        tokens = issue_tokens(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        return tokens

    def assertError(self, response, status, code=None):
        self.assertEqual(response.status_code, status, response.content)
        body = response.json()
        self.assertIn('error', body)
        self.assertTrue(body['error']['message'])
        if code:
            self.assertEqual(body['error']['code'], code)
        return body['error']
