import json
from datetime import date, timedelta

from django.urls import reverse
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from mainpage.models import ActivityMapping, DailyData, MonthlyHabits, UserTodo

from .base import PASSWORD, ApiTestCase, User

DAY = date(2025, 3, 4)


def day_url(d):
    return reverse('api:day', args=[d])


class MeTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user('ada')
        self.auth(self.user)

    def test_read_profile(self):
        body = self.client.get(reverse('api:me')).json()
        self.assertEqual(body['username'], 'ada')
        self.assertEqual(body['limits']['thoughts'], 115)
        self.assertEqual([w['word'] for w in body['rating_scales']['mood']],
                         ['Terrible', 'Rough', 'Okay', 'Good', 'Excellent!'])

    def test_update_profile_with_settings_rules(self):
        self.make_user('bob', email='bob@example.invalid')
        err = self.assertError(self.client.patch(reverse('api:me'), {'username': 'bob'}, format='json'), 400)
        self.assertIn('username', err['fields'])
        err = self.assertError(self.client.patch(reverse('api:me'), {'email': 'bob@example.invalid'}, format='json'), 400)
        self.assertIn('email', err['fields'])
        self.assertError(self.client.patch(reverse('api:me'), {'username': 'x!'}, format='json'), 400)

        r = self.client.patch(reverse('api:me'), {
            'username': 'ada2', 'preferred_name': 'Ada', 'gender': 2, 'b_day': '1990-12-10',
            'rating_format': 'words', 'has_seen_tour': True,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.user.refresh_from_db()
        self.assertEqual((self.user.username, self.user.preferred_name, self.user.gender, self.user.rating_format),
                         ('ada2', 'Ada', 2, 'words'))
        self.assertEqual(self.user.b_day, date(1990, 12, 10))
        self.assertTrue(self.user.has_seen_tour)
        self.assertEqual(self.user.email, 'ada@example.invalid')  # untouched

    def test_partial_personal_update_keeps_other_fields(self):
        self.client.patch(reverse('api:me'), {'preferred_name': 'Ada', 'gender': 1}, format='json')
        self.client.patch(reverse('api:me'), {'b_day': '2000-01-02'}, format='json')
        self.user.refresh_from_db()
        self.assertEqual((self.user.preferred_name, self.user.gender, self.user.b_day), ('Ada', 1, date(2000, 1, 2)))
        self.client.patch(reverse('api:me'), {'gender': None, 'b_day': None}, format='json')
        self.user.refresh_from_db()
        self.assertEqual((self.user.preferred_name, self.user.gender, self.user.b_day), ('Ada', None, None))

    def test_invalid_rating_format(self):
        self.assertError(self.client.patch(reverse('api:me'), {'rating_format': 'emoji'}, format='json'), 400)

    def test_onboarding_state(self):
        from landing.models import OnboardingResponse
        self.assertEqual(self.client.get(reverse('api:onboarding')).json(), {'answers': {}, 'completed': False})
        OnboardingResponse.objects.create(user=self.user, answers={'focus': 'time'}, completed=True)
        self.assertEqual(self.client.get(reverse('api:onboarding')).json(),
                         {'answers': {'focus': 'time'}, 'completed': True})


class DayTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user('ada')
        self.auth(self.user)
        self.act = ActivityMapping.objects.create(user_id=self.user.id, year=2025, month=3, name='Work', color='#112233')
        MonthlyHabits.objects.create(user_id=self.user.id, year=2025, month=3, habit_1='Run', goal_text='Goal')

    def test_empty_day_reads_without_writing(self):
        body = self.client.get(day_url(DAY)).json()
        self.assertIsNone(body['mood'])
        self.assertEqual(body['hourly'], [None] * 24)
        self.assertEqual(body['habit_names'][0], 'Run')
        self.assertEqual(body['activities'], [{'id': self.act.id, 'name': 'Work', 'color': '#112233'}])
        self.assertFalse(DailyData.objects.exists())

    def test_patch_writes_web_formats(self):
        hours = [self.act.id if h < 3 else None for h in range(24)]
        r = self.client.patch(day_url(DAY), {
            'mood': 7, 'productivity': 9, 'sleep': {'bed': '23:45', 'wake': '07:15', 'alarm': ''},
            'habits': '1000000000', 'thoughts': 'Saved', 'self_reflection': 'Long', 'hourly': hours,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        log = DailyData.objects.get(user_id=self.user.id, date=DAY)
        self.assertEqual((log.mood_rating, log.productivity_score), (7, 9))
        self.assertEqual(log.sleep, '2345,0715,,')
        self.assertEqual(log.habits_completed, '1000000000')
        self.assertEqual(json.loads(log.hourly_activity_logging)[0], {'hour': 0, 'activity': self.act.id})
        body = r.json()
        self.assertEqual(body['sleep']['hours'], 7.5)
        self.assertEqual(body['logged_days'], [4])

        # the website reads it back the same way
        self.client.force_login(self.user)
        page = self.client.get(reverse('day_view', args=[2025, 3, 4]))
        self.assertEqual(page.context['bed_time_form'], '23:45')
        self.assertEqual(page.context['habits_status'][0], ('Run', '1'))

    def test_partial_patch_keeps_other_fields(self):
        DailyData.objects.create(user_id=self.user.id, date=DAY, mood_rating=3, sleep='2300,0700,0650,', thoughts='Old')
        self.client.patch(day_url(DAY), {'productivity': 6, 'sleep': {'wake': '08:00'}}, format='json')
        log = DailyData.objects.get(user_id=self.user.id, date=DAY)
        self.assertEqual((log.mood_rating, log.productivity_score, log.thoughts), (3, 6, 'Old'))
        self.assertEqual(log.sleep, '2300,0800,0650,')
        self.client.patch(day_url(DAY), {'mood': None}, format='json')
        self.assertIsNone(DailyData.objects.get(user_id=self.user.id, date=DAY).mood_rating)

    def test_validation(self):
        cases = [
            {'mood': 0}, {'mood': 11}, {'productivity': 'high'},
            {'sleep': {'bed': '25:00'}}, {'habits': '101'}, {'thoughts': 'x' * 116},
            {'hourly': [None] * 23}, {'hourly': ['a'] * 24},
        ]
        for body in cases:
            with self.subTest(body=body):
                self.assertError(self.client.patch(day_url(DAY), body, format='json'), 400, 'invalid')
        self.assertFalse(DailyData.objects.exists())
        err = self.assertError(self.client.patch(day_url(DAY), {'thoughts': 'x' * 116}, format='json'), 400)
        self.assertEqual(err['message'], 'Thoughts cannot exceed 115 characters.')

    def test_future_days_are_refused(self):
        far = date.today() + timedelta(days=2)
        self.assertError(self.client.get(day_url(far)), 400)
        self.assertError(self.client.patch(day_url(far), {'mood': 5}, format='json'), 400)
        tomorrow = date.today() + timedelta(days=1)
        self.assertEqual(self.client.patch(day_url(tomorrow), {'mood': 5}, format='json').status_code, 200)

    def test_write_fills_the_gap_like_the_day_page(self):
        DailyData.objects.create(user_id=self.user.id, date=DAY)
        self.client.patch(day_url(DAY + timedelta(days=3)), {'mood': 5}, format='json')
        self.assertEqual(DailyData.objects.filter(user_id=self.user.id).count(), 4)

    def test_last_alarm_carries_over(self):
        DailyData.objects.create(user_id=self.user.id, date=DAY, sleep='2300,0700,0645,')
        body = self.client.get(day_url(DAY + timedelta(days=1))).json()
        self.assertEqual(body['sleep']['alarm'], '06:45')
        self.assertTrue(body['sleep']['alarm_is_default'])

    def test_hourly_only_accepts_this_months_activities(self):
        other_month = ActivityMapping.objects.create(user_id=self.user.id, year=2025, month=4, name='X', color='#ffffff')
        err = self.assertError(self.client.patch(day_url(DAY), {'hourly': [other_month.id] + [None] * 23}, format='json'), 400)
        self.assertIn('hourly', err['fields'])

    def test_deleted_activity_on_a_day_can_still_be_saved(self):
        gone = ActivityMapping.objects.create(user_id=self.user.id, year=2025, month=3, name='Gone', color='#abcdef')
        self.client.patch(day_url(DAY), {'hourly': [gone.id] + [None] * 23}, format='json')
        gone.delete()
        r = self.client.patch(day_url(DAY), {'hourly': [gone.id, self.act.id] + [None] * 22}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

    def test_calendar(self):
        DailyData.objects.create(user_id=self.user.id, date=DAY, mood_rating=5)
        DailyData.objects.create(user_id=self.user.id, date=DAY + timedelta(days=1))  # empty
        body = self.client.get(reverse('api:calendar', args=[2025, 3])).json()
        self.assertEqual(body['logged_days'], [4])
        self.assertEqual(body['days_in_month'], 31)
        self.assertEqual(self.client.get(reverse('api:calendar', args=[2025, 13])).status_code, 404)


class ActivityTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user('ada')
        self.auth(self.user)

    def create(self, name='Work', color='#112233', year=2025, month=3):
        return self.client.post(reverse('api:activities'), {'year': year, 'month': month, 'name': name, 'color': color},
                                format='json')

    def test_crud(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.content)
        act_id = r.json()['id']
        listed = self.client.get(reverse('api:activities'), {'year': 2025, 'month': 3}).json()
        self.assertEqual([a['name'] for a in listed], ['Work'])
        r = self.client.patch(reverse('api:activity', args=[act_id]), {'name': 'Deep work'}, format='json')
        self.assertEqual(r.json()['name'], 'Deep work')
        self.assertEqual(r.json()['color'], '#112233')
        self.assertEqual(self.client.delete(reverse('api:activity', args=[act_id])).status_code, 204)
        self.assertFalse(ActivityMapping.objects.exists())

    def test_website_rules(self):
        self.create()
        self.assertIn('name', self.assertError(self.create(color='#000001'), 400)['fields'])
        self.assertIn('color', self.assertError(self.create(name='Other', color='#112233'), 400)['fields'])
        self.assertIn('color', self.assertError(self.create(name='Other', color='#11223'), 400)['fields'])
        self.assertIn('name', self.assertError(self.create(name='x' * 16, color='#000002'), 400)['fields'])
        self.assertIn('name', self.assertError(self.create(name='  ', color='#000003'), 400)['fields'])
        for i in range(14):
            self.create(name=f'A{i}', color=f'#0000{i + 10:02d}')
        err = self.assertError(self.create(name='Sixteenth', color='#ffffff'), 400)
        self.assertEqual(err['message'], 'You can only have up to 15 activities per month.')
        # another month has its own 15
        self.assertEqual(self.create(month=4).status_code, 201)

    def test_list_needs_month(self):
        self.assertError(self.client.get(reverse('api:activities')), 400)


class TaskTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user('ada')
        self.auth(self.user)

    def add(self, **body):
        body.setdefault('text', 'Write report')
        return self.client.post(reverse('api:tasks'), body, format='json')

    def test_crud_and_sorting(self):
        self.assertEqual(self.add(text='low', priority='low').status_code, 201)
        r = self.add(text='critical', priority='critical', due_type='exact', due_date='2026-01-01', due_time='08:00')
        self.assertEqual(r.status_code, 201, r.content)
        crit = r.json()
        self.assertEqual(crit['due_time'], '08:00')
        tasks = self.client.get(reverse('api:tasks')).json()
        self.assertEqual([t['text'] for t in tasks['pending']], ['critical', 'low'])
        self.assertEqual(tasks['limit'], 30)

        r = self.client.patch(reverse('api:task', args=[crit['id']]), {'status': 'done'}, format='json')
        self.assertEqual(r.json()['status'], 'done')
        r = self.client.patch(reverse('api:task', args=[crit['id']]), {'status': 'pending', 'priority': 'low',
                                                                       'due_type': 'until', 'due_date': '2026-02-01'},
                              format='json')
        body = r.json()
        self.assertEqual((body['status'], body['priority'], body['due_type'], body['due_date'], body['due_time']),
                         ('pending', 'low', 'until', '2026-02-01', None))
        self.assertEqual(self.client.delete(reverse('api:task', args=[crit['id']])).status_code, 204)
        self.assertError(self.client.delete(reverse('api:task', args=[crit['id']])), 404, 'not_found')

        # the website's endpoint sees the same list
        self.client.force_login(self.user)
        web = self.client.get(reverse('get_todo_tasks')).json()
        self.assertEqual([t['text'] for t in web['pending']], ['low'])

    def test_rules(self):
        self.assertEqual(self.assertError(self.add(text='  '), 400)['message'], 'Task description cannot be empty.')
        self.assertError(self.add(text='x' * 201), 400)
        self.assertError(self.add(due_type='until'), 400)
        self.assertError(self.add(due_type='exact', due_date='2026-01-01'), 400)
        self.assertError(self.add(priority='urgent'), 400)
        self.assertEqual(self.add(due_type='today').json()['due_type'], 'today')

        task = self.add().json()
        # "Today" can only be picked when creating; text is fixed once created
        self.assertError(self.client.patch(reverse('api:task', args=[task['id']]), {'due_type': 'today'}, format='json'), 400)
        r = self.client.patch(reverse('api:task', args=[task['id']]), {'text': 'changed'}, format='json')
        self.assertEqual(r.json()['text'], 'Write report')

    def test_limit_of_thirty(self):
        UserTodo.objects.create(user=self.user, tasks=[{'id': i, 'text': f't{i}', 'status': 'done'} for i in range(1, 31)])
        err = self.assertError(self.add(), 400)
        self.assertIn('at most 30 tasks', err['message'])


class HabitTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user('ada')
        self.auth(self.user)

    def test_read_save_clear(self):
        url = reverse('api:habits', args=[2025, 3])
        body = self.client.get(url).json()
        self.assertEqual(body['habits'], [''] * 10)
        self.assertFalse(MonthlyHabits.objects.exists())

        r = self.client.put(url, {'goal_text': 'Get fit', 'habits': ['Run', ' Read ', '']}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['habits'][:3], ['Run', 'Read', ''])
        self.assertEqual(r.json()['goal_text'], 'Get fit')

        DailyData.objects.create(user_id=self.user.id, date=DAY, habits_completed='1100000000')
        DailyData.objects.create(user_id=self.user.id, date=date(2025, 4, 1), habits_completed='1000000000')
        r = self.client.post(reverse('api:habit_clear', args=[2025, 3]), {'index': 1}, format='json')
        self.assertEqual(r.json()['habits'][0], '')
        self.assertEqual(r.json()['habit_days'], [{'day': 4, 'habits': '0100000000'}])
        # other months keep their check-offs
        self.assertEqual(DailyData.objects.get(date=date(2025, 4, 1)).habits_completed, '1000000000')

    def test_put_keeps_goal_when_not_sent(self):
        url = reverse('api:habits', args=[2025, 3])
        self.client.put(url, {'goal_text': 'Goal', 'habits': ['Run']}, format='json')
        self.client.put(url, {'habits': ['Run', 'Swim']}, format='json')
        self.assertEqual(MonthlyHabits.objects.get().goal_text, 'Goal')

    def test_validation(self):
        url = reverse('api:habits', args=[2025, 3])
        self.assertError(self.client.put(url, {'habits': ['x'] * 11}, format='json'), 400)
        self.assertError(self.client.put(url, {'habits': ['x' * 101]}, format='json'), 400)
        self.assertError(self.client.post(reverse('api:habit_clear', args=[2025, 3]), {'index': 11}, format='json'), 400)
        self.assertEqual(self.client.get(reverse('api:habits', args=[2025, 0])).status_code, 404)


class JournalAndInsightTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user('ada')
        self.auth(self.user)
        self.act = ActivityMapping.objects.create(user_id=self.user.id, year=2025, month=3, name='Work', color='#112233')
        MonthlyHabits.objects.create(user_id=self.user.id, year=2025, month=3, habit_1='Run')
        DailyData.objects.create(
            user_id=self.user.id, date=DAY, mood_rating=7, productivity_score=5, sleep='2300,0700,0650,',
            habits_completed='1000000000', thoughts='Hi', self_reflection='Long day',
            hourly_activity_logging=json.dumps([{'hour': h, 'activity': self.act.id if h < 3 else None} for h in range(24)]),
        )
        DailyData.objects.create(user_id=self.user.id, date=DAY + timedelta(days=1), mood_rating=4)

    def test_journal(self):
        body = self.client.get(reverse('api:journal', args=[2025, 3])).json()
        self.assertEqual(body['entries'], [{'date': '2025-03-04', 'thoughts': 'Hi', 'self_reflection': 'Long day'}])

    def test_month_matches_the_website(self):
        api = self.client.get(reverse('api:insights_month', args=[2025, 3])).json()
        self.client.force_login(self.user)
        web = self.client.get(reverse('month_view', args=[2025, 3])).context
        self.assertEqual(api['day_summaries'], web['day_summaries'])
        self.assertEqual({int(k): v for k, v in api['hourly_grid'].items()}, web['hourly_grid'])
        self.assertEqual(api['activity_legend'], web['activity_legend'])
        self.assertEqual(api['habit_names'], web['habit_names'])
        web_hours = {int(k.split('ID: ')[1][:-1]): v for k, v in web['monthly_activity_aggregate'].items()}
        self.assertEqual({a['id']: a['hours'] for a in api['activity_hours']}, web_hours)
        self.assertEqual(api['activity_hours'], [{'id': self.act.id, 'name': 'Work', 'color': '#112233', 'hours': 3}])
        self.assertEqual(api['day_summaries'][0]['sleep'], 8.0)

    def test_year_matches_the_website(self):
        api = self.client.get(reverse('api:insights_year', args=[2025])).json()
        self.client.force_login(self.user)
        web = self.client.get(reverse('year_statistics', args=[2025])).context
        self.assertEqual(api['day_summaries'], web['day_summaries'])
        self.assertEqual(api['hourly_grid'], web['hourly_grid'])
        self.assertEqual(api['activity_legend'], web['activity_legend'])
        self.assertEqual((api['year_min'], api['year_max']), (web['year_min'], web['year_max']))

    def test_overview_matches_the_website(self):
        api = self.client.get(reverse('api:overview')).json()
        self.client.force_login(self.user)
        web = self.client.get(reverse('main_page')).context
        self.assertEqual(api['day_summaries'], web['day_summaries'])
        self.assertEqual(api['habit_names'], web['habit_names'])


class AccountTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.make_user('ada')
        self.tokens = self.auth(self.user)
        ActivityMapping.objects.create(user_id=self.user.id, year=2025, month=3, name='Work', color='#112233')
        DailyData.objects.create(user_id=self.user.id, date=DAY, mood_rating=7)
        MonthlyHabits.objects.create(user_id=self.user.id, year=2025, month=3, habit_1='Run')
        UserTodo.objects.create(user=self.user, tasks=[{'id': 1, 'text': 't', 'status': 'pending'}])

    def test_export_needs_password_and_matches_the_website(self):
        self.assertError(self.client.post(reverse('api:export'), {'password': 'wrong'}, format='json'), 400, 'invalid_password')
        r = self.client.post(reverse('api:export'), {'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Content-Type'], 'application/json')
        data = json.loads(r.content)
        self.assertEqual(data['user']['username'], 'ada')
        self.assertEqual(len(data['daily_data']), 1)

        self.client.force_login(self.user)
        web = self.client.post(reverse('confirm_password_download'), {'password': PASSWORD})
        self.assertEqual(json.loads(web.content), data)

    def test_clear_logs_keeps_account(self):
        self.assertError(self.client.post(reverse('api:clear_logs'), {'password': 'wrong'}, format='json'), 400)
        self.assertTrue(DailyData.objects.exists())
        self.assertEqual(self.client.post(reverse('api:clear_logs'), {'password': PASSWORD}, format='json').status_code, 204)
        self.assertFalse(DailyData.objects.exists() or ActivityMapping.objects.exists()
                         or MonthlyHabits.objects.exists() or UserTodo.objects.exists())
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_delete_account(self):
        self.assertError(self.client.post(reverse('api:delete_account'), {'password': 'wrong'}, format='json'), 400)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())
        r = self.client.post(reverse('api:delete_account'), {'password': PASSWORD}, format='json')
        self.assertEqual(r.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertFalse(DailyData.objects.exists())
        self.assertTrue(BlacklistedToken.objects.exists())
        self.assertEqual(self.client.get(reverse('api:me')).status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post(reverse('api:refresh'), {'refresh': self.tokens['refresh']}, format='json').status_code, 401)
