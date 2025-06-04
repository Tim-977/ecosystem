from django.test import SimpleTestCase
from .views import is_valid_hex_color, _normalize_task, _sort_tasks

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
