import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from .models import ActivityMapping, DailyData, MonthlyHabits
from .templatetags.ecosystem_extras import month_nav
from .views import (_day_summary, _hourly_ids, _normalize_task, _sleep_hours,
                    _sort_tasks, is_valid_hex_color)

class UtilityFunctionTests(SimpleTestCase):
    """Tests for helper functions in mainpage.views."""

    def test_is_valid_hex_color(self):
        """is_valid_hex_color only accepts proper hex codes."""
        self.assertTrue(is_valid_hex_color('#00ff00'))
        self.assertFalse(is_valid_hex_color('#GGGGGG'))

    def test_normalize_task_sets_defaults(self):
        """_normalize_task fills in missing fields with safe defaults."""
        task = {'text': 'Example'}
        normalized = _normalize_task(task.copy())
        self.assertEqual(normalized['due_type'], 'none')
        self.assertIsNone(normalized['due_date'])
        self.assertIsNone(normalized['due_time'])
        self.assertEqual(normalized['priority'], 'medium')

    def test_normalize_task_someday_time(self):
        """A due_time of 'someday' resets the due information."""
        task = {'text': 'T', 'due_time': 'someday'}
        normalized = _normalize_task(task)
        self.assertEqual(normalized['due_type'], 'none')
        self.assertIsNone(normalized['due_date'])
        self.assertIsNone(normalized['due_time'])

    def test_sort_tasks_order(self):
        """_sort_tasks orders by priority and due information."""
        t1 = {'id': 1, 'text': 'critical exact', 'priority': 'critical',
              'due_type': 'exact', 'due_date': '2024-01-01', 'due_time': '08:00'}
        t2 = {'id': 2, 'text': 'medium until', 'priority': 'medium',
              'due_type': 'until', 'due_date': '2024-01-02'}
        t3 = {'id': 3, 'text': 'low none', 'priority': 'low', 'due_type': 'none'}
        result = _sort_tasks([t3, t2, t1])
        self.assertEqual([t['id'] for t in result], [1, 2, 3])


class ChartDataHelperTests(SimpleTestCase):
    """The read-only summaries that feed the frontend charts."""

    def test_sleep_hours_crosses_midnight(self):
        log = DailyData(date=date(2025, 1, 2), sleep="2330,0700,0645,")
        self.assertEqual(_sleep_hours(log), 7.5)

    def test_sleep_hours_unknown_or_invalid(self):
        self.assertEqual(_sleep_hours(DailyData(date=date(2025, 1, 2), sleep=",,,")), 0)
        self.assertEqual(_sleep_hours(DailyData(date=date(2025, 1, 2), sleep="ab12,0700,")), 0)
        self.assertEqual(_sleep_hours(DailyData(date=date(2025, 1, 2), sleep=None)), 0)

    def test_hourly_ids_fills_gaps_and_ignores_bad_json(self):
        log = DailyData(hourly_activity_logging=json.dumps([{"hour": 3, "activity": 7}, {"hour": 30, "activity": 1}]))
        hours = _hourly_ids(log)
        self.assertEqual(len(hours), 24)
        self.assertEqual(hours[3], 7)
        self.assertEqual(hours.count(None), 23)
        self.assertEqual(_hourly_ids(DailyData(hourly_activity_logging="not json")), [None] * 24)

    def test_day_summary_keeps_nulls(self):
        log = DailyData(date=date(2025, 3, 4), mood_rating=None, productivity_score=6, habits_completed="101")
        summary = _day_summary(log)
        self.assertIsNone(summary["mood"])
        self.assertEqual(summary["productivity"], 6)
        self.assertEqual(summary["habits"], "1010000000")

    def test_month_nav_wraps_years(self):
        nav = month_nav(2025, 1)
        self.assertEqual((nav["prev_year"], nav["prev_month"]), (2024, 12))
        nav = month_nav(2025, 12)
        self.assertEqual((nav["next_year"], nav["next_month"]), (2026, 1))


class PageTests(TestCase):
    """Every page renders for a signed-in user and exposes real data only."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(username='pages1', password='pw-12345')
        self.client.force_login(self.user)
        MonthlyHabits.objects.create(user_id=self.user.id, year=2025, month=3, habit_1="Run", goal_text="Goal")
        self.act = ActivityMapping.objects.create(user_id=self.user.id, year=2025, month=3, name="Work", color="#112233")
        DailyData.objects.create(
            user_id=self.user.id, date=date(2025, 3, 4), mood_rating=7, productivity_score=5,
            sleep="2300,0700,0650,", habits_completed="1000000000", thoughts="Hi",
            hourly_activity_logging=json.dumps([{"hour": h, "activity": self.act.id if h < 3 else None} for h in range(24)]),
        )

    def test_pages_render(self):
        urls = [
            reverse('main_page'), reverse('tasks'),
            reverse('day_view', args=[2025, 3, 4]), reverse('diary_view', args=[2025, 3]),
            reverse('set_habits', args=[2025, 3]), reverse('activity_config_view', args=[2025, 3]),
            reverse('settings'), reverse('changelog'), reverse('license'), reverse('developer_info'),
            reverse('feedback'), reverse('confirm_password_download'),
        ]
        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_tasks_page_requires_login(self):
        self.client.logout()
        response = self.client.get(reverse('tasks'))
        self.assertEqual(response.status_code, 302)
        self.assertIn('/auth/login/', response.url)

    def test_overview_summaries_include_recent_entries(self):
        response = self.client.get(reverse('main_page'))
        dates = [d["date"] for d in response.context["day_summaries"]]
        self.assertIn("2025-03-04", dates)

    def test_habits_page_exposes_checkoffs(self):
        response = self.client.get(reverse('set_habits', args=[2025, 3]))
        self.assertEqual(response.context["habit_days"], [{"day": 4, "habits": "1000000000"}])
        self.assertEqual(response.context["days_in_month"], 31)

    def test_day_post_round_trip(self):
        url = reverse('day_view', args=[2025, 3, 4])
        hours = json.dumps([{"hour": h, "activity": None} for h in range(24)])
        response = self.client.post(url, {
            "mood_rating": "", "productivity_score": "9", "bed_time": "23:45", "wake_up_time": "07:15",
            "first_alarm_time": "", "habit_0": "on", "thoughts": "Saved", "self_reflection": "Long",
            "hourly_activity_logging": hours,
        })
        self.assertEqual(response.status_code, 302)
        log = DailyData.objects.get(user_id=self.user.id, date=date(2025, 3, 4))
        self.assertIsNone(log.mood_rating)
        self.assertEqual(log.productivity_score, 9)
        self.assertEqual(log.sleep, "2345,0715,,")
        self.assertEqual(log.habits_completed, "1000000000")
        page = self.client.get(url)
        self.assertEqual(page.context["logged_days"], [4])
