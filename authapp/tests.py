from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse

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


class RatingFormatTests(TestCase):
    """The onboarding format reaches the account, and Settings can change it."""

    def _signup(self, answers):
        session = self.client.session
        session['onboarding'] = answers
        session.save()
        return self.client.post(reverse('signup'), {
            'username': 'fmt1', 'email': 'fmt1@example.invalid',
            'password': 'pw-12345-long', 'confirm_password': 'pw-12345-long',
        })

    def test_signup_applies_words_and_goes_straight_in(self):
        response = self._signup({'name': 'Ada', 'scale': 'words'})
        self.assertRedirects(response, reverse('main_page'), fetch_redirect_response=False)
        user = User.objects.get(username='fmt1')
        self.assertEqual(user.rating_format, 'words')
        self.assertEqual(user.preferred_name, 'Ada')
        self.assertFalse(user.has_seen_tour)

    def test_signup_without_answers_keeps_numbers(self):
        self._signup({})
        self.assertEqual(User.objects.get(username='fmt1').rating_format, 'numbers')

    def test_settings_switches_format(self):
        user = User.objects.create_user(username='fmt2', password='pw-12345')
        self.client.force_login(user)
        url = reverse('rating_format')
        ok = self.client.post(url, data='{"format": "words"}', content_type='application/json')
        self.assertEqual(ok.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.rating_format, 'words')
        bad = self.client.post(url, data='{"format": "emoji"}', content_type='application/json')
        self.assertEqual(bad.status_code, 400)

    def test_word_mode_pages_render_words(self):
        from datetime import date
        from mainpage.models import DailyData
        user = User.objects.create_user(username='fmt3', password='pw-12345', rating_format='words')
        self.client.force_login(user)
        DailyData.objects.create(user_id=user.id, date=date(2025, 3, 4), mood_rating=7, productivity_score=3)
        month = self.client.get(reverse('month_view', args=[2025, 3])).content.decode()
        self.assertIn('Good', month)
        self.assertIn('Slow', month)
        day = self.client.get(reverse('day_view', args=[2025, 3, 4])).content.decode()
        self.assertIn('data-words="mood"', day)
        self.assertIn('data-rating="words"', day)


class NearestWordTests(TestCase):
    def test_mapping_and_nearest(self):
        from mainpage.ratings import nearest_word
        self.assertEqual([nearest_word('mood', v) for v in (1, 3, 6, 8, 10)], ['Terrible', 'Rough', 'Okay', 'Good', 'Excellent!'])
        self.assertEqual(nearest_word('mood', 7), 'Good')  # ties round up
        self.assertEqual(nearest_word('productivity', 5.2), 'Steady')
        self.assertEqual(nearest_word('mood', None), '')
