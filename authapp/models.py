from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
import pytz  # Import pytz for timezone choices

class CustomUser(AbstractUser):
    first_name = None
    last_name = None

    groups = models.ManyToManyField(
        'auth.Group',
        related_name='custom_user_set',
        blank=True,
        help_text='The groups this user belongs to.'
    )
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        related_name='custom_user_set',
        blank=True,
        help_text='Specific permissions for this user.'
    )


class PersonalData(models.Model):
    GENDER_CHOICES = [
        (1, 'Male'),
        (2, 'Female'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )
    preferred_name = models.CharField(max_length=100, blank=True)
    b_day = models.DateField(null=True, blank=True)

    # Gender field
    gender = models.IntegerField(
        choices=GENDER_CHOICES,
        null=True,
        blank=True
    )

    # New field: Timezone selection
    timezone = models.CharField(
        max_length=50,
        choices=[(tz, tz) for tz in pytz.all_timezones],  # Dropdown list of timezones
        default='UTC'
    )

    def __str__(self):
        return f"{self.user.username}'s Personal Data"
