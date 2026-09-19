"""Request validation for the mobile API.

These only check shapes and types; the rules themselves (limits, storage
formats, uniqueness) are applied by mainpage/authapp services, the same code
the website runs.
"""
from django.contrib.auth import get_user_model
from rest_framework import exceptions, serializers
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings

from mainpage import services

TIME_RE = r'^([01]\d|2[0-3]):[0-5]\d$'
TIME_MESSAGE = 'Use a 24-hour time like 07:30.'


class RefreshSerializer(TokenRefreshSerializer):
    """Refuse cleanly when the token's account was deleted.

    SimpleJWT 5.5.1 looks the user up with .get(), so a deleted account would
    surface as a server error instead of a 401. Deactivated accounts are
    refused by the parent class."""

    def validate(self, attrs):
        refresh = self.token_class(attrs['refresh'])  # signature, expiry and blacklist
        user_id = refresh.payload.get(jwt_settings.USER_ID_CLAIM)
        if user_id is not None and not get_user_model().objects.filter(
                **{jwt_settings.USER_ID_FIELD: user_id}).exists():
            raise exceptions.AuthenticationFailed('This account no longer exists.', code='user_not_found')
        return super().validate(attrs)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, error_messages={'blank': 'Enter your username.'})
    password = serializers.CharField(max_length=256, trim_whitespace=False,
                                     error_messages={'blank': 'Enter your password.'})


class SignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, error_messages={'blank': 'Choose a username.'})
    email = serializers.EmailField(max_length=254, error_messages={
        'blank': 'Enter your email address.', 'invalid': 'Enter a valid email address.'})
    password = serializers.CharField(max_length=256, trim_whitespace=False,
                                     error_messages={'blank': 'Choose a password.'})
    confirm_password = serializers.CharField(max_length=256, trim_whitespace=False,
                                             error_messages={'blank': 'Repeat your password.'})
    onboarding = serializers.DictField(required=False)


class PasswordSerializer(serializers.Serializer):
    password = serializers.CharField(max_length=256, trim_whitespace=False,
                                     error_messages={'blank': 'Enter your password to confirm.'})


class MeUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(required=False, max_length=150)
    email = serializers.CharField(required=False, allow_blank=True, max_length=254)
    preferred_name = serializers.CharField(required=False, allow_blank=True, max_length=100)
    gender = serializers.ChoiceField(required=False, allow_null=True, choices=[1, 2])
    b_day = serializers.DateField(required=False, allow_null=True)
    rating_format = serializers.ChoiceField(required=False, choices=['numbers', 'words'])
    has_seen_tour = serializers.BooleanField(required=False)


class SleepSerializer(serializers.Serializer):
    bed = serializers.RegexField(TIME_RE, required=False, allow_blank=True, error_messages={'invalid': TIME_MESSAGE})
    wake = serializers.RegexField(TIME_RE, required=False, allow_blank=True, error_messages={'invalid': TIME_MESSAGE})
    alarm = serializers.RegexField(TIME_RE, required=False, allow_blank=True, error_messages={'invalid': TIME_MESSAGE})


class DayUpdateSerializer(serializers.Serializer):
    mood = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=10)
    productivity = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=10)
    sleep = SleepSerializer(required=False)
    habits = serializers.RegexField(r'^[01]{10}$', required=False,
                                    error_messages={'invalid': 'Habits are ten 0/1 flags.'})
    thoughts = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False,
                                     max_length=services.THOUGHTS_MAX,
                                     error_messages={'max_length': 'Thoughts cannot exceed 115 characters.'})
    self_reflection = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False,
                                            max_length=50000)
    hourly = serializers.ListField(
        required=False, min_length=24, max_length=24,
        child=serializers.IntegerField(allow_null=True, min_value=1),
        error_messages={'min_length': 'Send all 24 hours.', 'max_length': 'Send all 24 hours.'},
    )


class ActivityCreateSerializer(serializers.Serializer):
    year = serializers.IntegerField(min_value=1900, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    name = serializers.CharField(allow_blank=True, max_length=100)
    color = serializers.CharField(allow_blank=True, max_length=20)


class ActivityUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True, max_length=100)
    color = serializers.CharField(required=False, allow_blank=True, max_length=20)


class TaskCreateSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=services.TASK_TEXT_MAX, error_messages={
        'blank': 'Task description cannot be empty.',
        'required': 'Task description cannot be empty.',
        'max_length': 'Keep the task to 200 characters or fewer.',
    })
    priority = serializers.ChoiceField(choices=services.TASK_PRIORITIES, default='medium')
    due_type = serializers.ChoiceField(choices=services.TASK_DUE_TYPES, default='none')
    due_date = serializers.DateField(required=False, allow_null=True)
    due_time = serializers.RegexField(TIME_RE, required=False, allow_null=True, allow_blank=True,
                                      error_messages={'invalid': TIME_MESSAGE})


class TaskUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(required=False, choices=['pending', 'done'])
    priority = serializers.ChoiceField(required=False, choices=services.TASK_PRIORITIES)
    due_type = serializers.ChoiceField(required=False, choices=['none', 'until', 'exact'], error_messages={
        'invalid_choice': "A deadline can be none, a date, or a date and time. 'Today' is only for new tasks."})
    due_date = serializers.DateField(required=False, allow_null=True)
    due_time = serializers.RegexField(TIME_RE, required=False, allow_null=True, allow_blank=True,
                                      error_messages={'invalid': TIME_MESSAGE})


class HabitsUpdateSerializer(serializers.Serializer):
    goal_text = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False, max_length=5000)
    habits = serializers.ListField(
        max_length=services.HABIT_SLOTS,
        child=serializers.CharField(allow_blank=True, max_length=services.HABIT_NAME_MAX, error_messages={
            'max_length': 'Keep each habit to 100 characters or fewer.'}),
    )


class HabitClearSerializer(serializers.Serializer):
    index = serializers.IntegerField(min_value=1, max_value=services.HABIT_SLOTS)
