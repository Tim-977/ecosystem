from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from .forms import GeneralSettingsForm

User = get_user_model()

class GeneralSettingsFormTests(TestCase):
    """Tests for the profile settings form."""

    def setUp(self):
        self.user1 = User.objects.create_user(username='user1', password='pw')
        self.user2 = User.objects.create_user(username='user2', password='pw')

    def test_invalid_username_fails_validation(self):
        """Usernames must match the allowed regex pattern."""
        form = GeneralSettingsForm({'username': 'bad!', 'email': ''}, user_instance=self.user1)
        self.assertFalse(form.is_valid())
        self.assertIn('username', form.errors)

    def test_duplicate_username_fails_validation(self):
        """Trying to use another user's username should raise a validation error."""
        form = GeneralSettingsForm({'username': 'user2', 'email': ''}, user_instance=self.user1)
        self.assertFalse(form.is_valid())
        self.assertIn('username', form.errors)

    def test_same_username_allowed(self):
        """Submitting the current username is considered valid."""
        form = GeneralSettingsForm({'username': 'user1', 'email': ''}, user_instance=self.user1)
        self.assertTrue(form.is_valid())
