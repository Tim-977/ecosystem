"""The website's forms and JSON endpoints behave as before now that their rules
live in mainpage/services.py (shared with the mobile API)."""
import json
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.messages import get_messages
from django.test import TestCase
from django.urls import reverse

from . import services
from .models import ActivityMapping, DailyData, MonthlyHabits, UserTodo


class RecentHourlyGridTests(TestCase):
    """recent_hourly_grid backs the overview page's "today" ribbon, which
    must find the right day even when the server's own `today` is a day off
    from the browser's (different timezone, or a midnight-boundary request)."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(username='grid1', password='pw-12345')

    def test_window_keyed_by_iso_date(self):
        center = date(2025, 6, 15)
        for offset in (-3, -2, -1, 0, 1, 2, 3):
            DailyData.objects.create(
                user_id=self.user.id, date=center + timedelta(days=offset),
                hourly_activity_logging=json.dumps([{"hour": 0, "activity": offset}]),
            )
        grid = services.recent_hourly_grid(self.user.id, center)
        self.assertEqual(set(grid), {(center + timedelta(days=o)).isoformat() for o in (-2, -1, 0, 1, 2)})
        self.assertEqual(grid[center.isoformat()][0], 0)
        self.assertEqual(grid[(center - timedelta(days=1)).isoformat()][0], -1)

    def test_someone_elses_days_are_not_included(self):
        other = get_user_model().objects.create_user(username='grid2', password='pw-12345')
        DailyData.objects.create(user_id=other.id, date=date(2025, 6, 15))
        self.assertEqual(services.recent_hourly_grid(self.user.id, date(2025, 6, 15)), {})


class WebRulesTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='web1', password='pw-12345')
        self.client.force_login(self.user)

    def messages(self, response):
        return [str(m) for m in get_messages(response.wsgi_request)]

    def post_activity(self, **data):
        return self.client.post(reverse('activity_config_view', args=[2025, 3]), data)

    def test_activity_form_rules_and_messages(self):
        self.post_activity(action='create', name='Work', color='#112233')
        self.assertEqual(ActivityMapping.objects.count(), 1)
        cases = [
            ({'name': 'Work', 'color': '#000001'}, 'You already have an activity with that name this month.'),
            ({'name': 'Other', 'color': '#112233'}, 'You already have an activity with that color this month.'),
            ({'name': 'x' * 16, 'color': '#000002'}, 'Activity name must be 15 characters or fewer.'),
            ({'name': 'Other', 'color': 'blue'}, 'Please enter a valid hex color (e.g. #00ff00).'),
        ]
        for data, message in cases:
            with self.subTest(message=message):
                r = self.post_activity(action='create', **data)
                self.assertRedirects(r, reverse('activity_config_view', args=[2025, 3]), fetch_redirect_response=False)
                self.assertIn(message, self.messages(r))
        for i in range(14):
            self.post_activity(action='create', name=f'A{i}', color=f'#0000{i + 10:02d}')
        r = self.post_activity(action='create', name='Late', color='#ffffff')
        self.assertIn('You can only have up to 15 activities per month.', self.messages(r))
        self.assertEqual(ActivityMapping.objects.count(), 15)

    def test_activity_update_and_delete(self):
        act = ActivityMapping.objects.create(user_id=self.user.id, year=2025, month=3, name='Work', color='#112233')
        self.post_activity(action='update', activity_id=act.id, name='Deep', color='#445566')
        act.refresh_from_db()
        self.assertEqual((act.name, act.color), ('Deep', '#445566'))
        # another month's URL can't reach it, and a bad id is ignored
        self.client.post(reverse('activity_config_view', args=[2025, 4]), {'action': 'delete', 'activity_id': act.id})
        self.post_activity(action='delete', activity_id='abc')
        self.assertTrue(ActivityMapping.objects.filter(pk=act.pk).exists())
        self.post_activity(action='delete', activity_id=act.id)
        self.assertFalse(ActivityMapping.objects.exists())

    def test_someone_elses_activity_is_untouched(self):
        other = get_user_model().objects.create_user(username='web2', password='pw-12345')
        act = ActivityMapping.objects.create(user_id=other.id, year=2025, month=3, name='Theirs', color='#112233')
        r = self.post_activity(action='update', activity_id=act.id, name='Mine', color='#445566')
        self.assertEqual(self.messages(r), [])
        self.post_activity(action='delete', activity_id=act.id)
        act.refresh_from_db()
        self.assertEqual(act.name, 'Theirs')

    def test_habit_save_and_clear(self):
        url = reverse('set_habits', args=[2025, 3])
        r = self.client.post(url, {'goal_text': 'Goal', 'habit_1': 'Run', 'habit_2': 'Read'})
        self.assertIn('Monthly habits updated!', self.messages(r))
        monthly = MonthlyHabits.objects.get(user_id=self.user.id, year=2025, month=3)
        self.assertEqual((monthly.goal_text, monthly.habit_1, monthly.habit_2, monthly.habit_3), ('Goal', 'Run', 'Read', ''))

        DailyData.objects.create(user_id=self.user.id, date=date(2025, 3, 4), habits_completed='11')
        r = self.client.post(url, {'clear_habit_index': '1'})
        self.assertIn('Habit 1 cleared.', self.messages(r))
        self.assertEqual(DailyData.objects.get(date=date(2025, 3, 4)).habits_completed, '0100000000')
        r = self.client.post(url, {'clear_habit_index': 'x'})
        self.assertIn('Invalid habit index.', self.messages(r))

    def test_task_json_endpoints(self):
        add = lambda body: self.client.post(reverse('add_todo_task'), json.dumps(body), content_type='application/json')
        self.assertEqual(add({'text': ''}).json(), {'error': 'Task description cannot be empty.'})
        self.assertEqual(add({'text': 't', 'due_type': 'until'}).status_code, 400)
        r = add({'text': 'Report', 'priority': 'urgent'})
        self.assertEqual(r.json()['task'], {'id': 1, 'text': 'Report', 'status': 'pending', 'due_type': 'none',
                                            'due_date': None, 'due_time': None, 'priority': 'medium'})
        put = self.client.put(reverse('update_todo_task', args=[1]), json.dumps({'status': 'done'}),
                              content_type='application/json')
        self.assertEqual(put.json()['task']['status'], 'done')
        self.assertEqual(self.client.put(reverse('update_todo_task', args=[9]), '{}', content_type='application/json').status_code, 404)
        self.assertEqual(self.client.get(reverse('get_todo_tasks')).json()['done'][0]['text'], 'Report')
        self.assertEqual(self.client.delete(reverse('delete_todo_task', args=[1])).json(), {'success': True})
        self.assertEqual(self.client.delete(reverse('delete_todo_task', args=[1])).status_code, 404)
        self.assertEqual(self.client.get(reverse('add_todo_task')).status_code, 405)

        UserTodo.objects.filter(user=self.user).update(tasks=[{'id': i, 'text': 'x', 'status': 'done'} for i in range(30)])
        self.assertIn('at most 30 tasks', add({'text': 'one more'}).json()['error'])

    def test_future_day_redirects_with_message(self):
        r = self.client.get(reverse('day_view', args=[2099, 1, 1]))
        self.assertRedirects(r, reverse('main_page'), fetch_redirect_response=False)
        self.assertIn('You cannot create or edit logs for dates more than 24h in the future.', self.messages(r))

    def test_opening_a_day_fills_the_gap(self):
        DailyData.objects.create(user_id=self.user.id, date=date(2025, 3, 1))
        self.client.get(reverse('day_view', args=[2025, 3, 5]))
        self.assertEqual(DailyData.objects.filter(user_id=self.user.id).count(), 5)
        self.assertTrue(MonthlyHabits.objects.filter(user_id=self.user.id, year=2025, month=3).exists())
