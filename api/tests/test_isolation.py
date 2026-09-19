"""One person can never read or change another person's data through the API."""
import json
from datetime import date

from django.urls import reverse

from landing.models import OnboardingResponse
from mainpage.models import ActivityMapping, DailyData, MonthlyHabits, UserTodo

from .base import PASSWORD, ApiTestCase

DAY = date(2025, 3, 4)


class CrossUserIsolationTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.alice = self.make_user('alice')
        self.bob = self.make_user('bob')
        self.alice_act = ActivityMapping.objects.create(user_id=self.alice.id, year=2025, month=3, name='Secret', color='#123456')
        MonthlyHabits.objects.create(user_id=self.alice.id, year=2025, month=3, habit_1='Alice habit', goal_text='Alice goal')
        DailyData.objects.create(
            user_id=self.alice.id, date=DAY, mood_rating=9, thoughts='Alice thought', self_reflection='Alice diary',
            habits_completed='1000000000', sleep='2300,0700,0600,',
            hourly_activity_logging=json.dumps([{'hour': h, 'activity': self.alice_act.id} for h in range(24)]),
        )
        UserTodo.objects.create(user=self.alice, tasks=[{'id': 1, 'text': 'Alice task', 'status': 'pending',
                                                          'due_type': 'none', 'due_date': None, 'due_time': None,
                                                          'priority': 'high'}])
        OnboardingResponse.objects.create(user=self.alice, answers={'name': 'Alice'}, completed=True)
        self.auth(self.bob)

    def test_days_are_per_person(self):
        body = self.client.get(reverse('api:day', args=[DAY])).json()
        self.assertIsNone(body['mood'])
        self.assertEqual(body['thoughts'], '')
        self.assertEqual(body['hourly'], [None] * 24)
        self.assertEqual(body['habit_names'], [''] * 10)
        self.assertEqual(body['activities'], [])
        self.assertEqual(body['sleep']['alarm'], '')  # Alice's alarm doesn't carry over to Bob
        self.assertEqual(self.client.get(reverse('api:calendar', args=[2025, 3])).json()['logged_days'], [])

        self.client.patch(reverse('api:day', args=[DAY]), {'mood': 2, 'thoughts': 'Bob'}, format='json')
        alice_day = DailyData.objects.get(user_id=self.alice.id, date=DAY)
        self.assertEqual((alice_day.mood_rating, alice_day.thoughts), (9, 'Alice thought'))

    def test_cannot_log_hours_with_someone_elses_activity(self):
        r = self.client.patch(reverse('api:day', args=[DAY]), {'hourly': [self.alice_act.id] + [None] * 23}, format='json')
        self.assertError(r, 400)

    def test_client_supplied_owner_is_ignored(self):
        self.client.patch(reverse('api:day', args=[DAY]), {'mood': 3, 'user_id': self.alice.id, 'user': self.alice.id},
                          format='json')
        self.assertEqual(DailyData.objects.get(user_id=self.alice.id, date=DAY).mood_rating, 9)
        self.assertEqual(DailyData.objects.get(user_id=self.bob.id, date=DAY).mood_rating, 3)
        r = self.client.post(reverse('api:activities'), {'year': 2025, 'month': 3, 'name': 'Mine', 'color': '#000000',
                                                         'user_id': self.alice.id}, format='json')
        self.assertEqual(ActivityMapping.objects.get(pk=r.json()['id']).user_id, self.bob.id)

    def test_activities(self):
        self.assertEqual(self.client.get(reverse('api:activities'), {'year': 2025, 'month': 3}).json(), [])
        url = reverse('api:activity', args=[self.alice_act.id])
        self.assertError(self.client.patch(url, {'name': 'Hacked'}, format='json'), 404, 'not_found')
        self.assertError(self.client.delete(url), 404, 'not_found')
        self.alice_act.refresh_from_db()
        self.assertEqual(self.alice_act.name, 'Secret')

    def test_tasks(self):
        self.assertEqual(self.client.get(reverse('api:tasks')).json()['pending'], [])
        self.assertError(self.client.patch(reverse('api:task', args=[1]), {'status': 'done'}, format='json'), 404)
        self.assertError(self.client.delete(reverse('api:task', args=[1])), 404)
        # Bob's own task 1 is a different task
        self.client.post(reverse('api:tasks'), {'text': 'Bob task'}, format='json')
        self.client.patch(reverse('api:task', args=[1]), {'status': 'done'}, format='json')
        self.assertEqual(UserTodo.objects.get(user=self.alice).tasks[0]['status'], 'pending')
        self.assertEqual(UserTodo.objects.get(user=self.bob).tasks[0]['status'], 'done')

    def test_habits(self):
        url = reverse('api:habits', args=[2025, 3])
        body = self.client.get(url).json()
        self.assertEqual(body['habits'], [''] * 10)
        self.assertEqual(body['goal_text'], '')
        self.assertEqual(body['habit_days'], [])
        self.client.put(url, {'goal_text': 'Bob goal', 'habits': ['Bob habit']}, format='json')
        self.client.post(reverse('api:habit_clear', args=[2025, 3]), {'index': 1}, format='json')
        alice = MonthlyHabits.objects.get(user_id=self.alice.id)
        self.assertEqual((alice.habit_1, alice.goal_text), ('Alice habit', 'Alice goal'))
        self.assertEqual(DailyData.objects.get(user_id=self.alice.id, date=DAY).habits_completed, '1000000000')

    def test_journal_and_insights(self):
        self.assertEqual(self.client.get(reverse('api:journal', args=[2025, 3])).json()['entries'], [])
        month = self.client.get(reverse('api:insights_month', args=[2025, 3])).json()
        self.assertEqual((month['day_summaries'], month['hourly_grid'], month['activity_legend'], month['activity_hours']),
                         ([], {}, [], []))
        year = self.client.get(reverse('api:insights_year', args=[2025])).json()
        self.assertEqual((year['day_summaries'], year['hourly_grid'], year['activity_legend']), ([], {}, []))
        overview = self.client.get(reverse('api:overview')).json()
        self.assertEqual(overview['day_summaries'], [])

    def test_profile_and_onboarding(self):
        self.assertEqual(self.client.get(reverse('api:me')).json()['username'], 'bob')
        self.assertEqual(self.client.get(reverse('api:onboarding')).json(), {'answers': {}, 'completed': False})

    def test_export_holds_only_own_data(self):
        data = json.loads(self.client.post(reverse('api:export'), {'password': PASSWORD}, format='json').content)
        self.assertEqual(data['user']['username'], 'bob')
        self.assertEqual((data['daily_data'], data['activity_mappings'], data['monthly_habits'], data['user_todo']),
                         ([], [], [], []))

    def test_account_actions_touch_only_own_data(self):
        self.assertEqual(self.client.post(reverse('api:clear_logs'), {'password': PASSWORD}, format='json').status_code, 204)
        self.assertTrue(DailyData.objects.filter(user_id=self.alice.id).exists())
        # Alice's password doesn't work for Bob's account
        self.assertError(self.client.post(reverse('api:delete_account'), {'password': 'nope'}, format='json'), 400)
        self.assertEqual(self.client.post(reverse('api:delete_account'), {'password': PASSWORD}, format='json').status_code, 204)
        self.assertTrue(DailyData.objects.filter(user_id=self.alice.id).exists())
        self.assertTrue(ActivityMapping.objects.filter(user_id=self.alice.id).exists())
        self.assertTrue(UserTodo.objects.filter(user=self.alice).exists())

    def test_every_private_endpoint_requires_auth(self):
        self.client.credentials()
        private = [
            ('get', reverse('api:me')), ('patch', reverse('api:me')), ('get', reverse('api:onboarding')),
            ('get', reverse('api:day', args=[DAY])), ('patch', reverse('api:day', args=[DAY])),
            ('get', reverse('api:calendar', args=[2025, 3])),
            ('get', reverse('api:activities')), ('post', reverse('api:activities')),
            ('patch', reverse('api:activity', args=[self.alice_act.id])), ('delete', reverse('api:activity', args=[self.alice_act.id])),
            ('get', reverse('api:tasks')), ('post', reverse('api:tasks')),
            ('patch', reverse('api:task', args=[1])), ('delete', reverse('api:task', args=[1])),
            ('get', reverse('api:habits', args=[2025, 3])), ('put', reverse('api:habits', args=[2025, 3])),
            ('post', reverse('api:habit_clear', args=[2025, 3])),
            ('get', reverse('api:journal', args=[2025, 3])),
            ('get', reverse('api:overview')), ('get', reverse('api:insights_month', args=[2025, 3])),
            ('get', reverse('api:insights_year', args=[2025])),
            ('post', reverse('api:export')), ('post', reverse('api:clear_logs')), ('post', reverse('api:delete_account')),
        ]
        for method, url in private:
            with self.subTest(method=method, url=url):
                self.assertEqual(getattr(self.client, method)(url, {}, format='json').status_code, 401)
        self.assertTrue(DailyData.objects.filter(user_id=self.alice.id).exists())
