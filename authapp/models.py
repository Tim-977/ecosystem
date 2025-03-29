from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    # Optional: You already removed first_name and last_name, so we keep that:
    first_name = None
    last_name = None

    # Gender choices can be defined here, just like in PersonalData
    GENDER_CHOICES = [
        (1, 'Male'),
        (2, 'Female'),
    ]

    # Add the new fields previously in PersonalData
    preferred_name = models.CharField(max_length=100, blank=True)
    b_day = models.DateField(null=True, blank=True)
    gender = models.IntegerField(choices=GENDER_CHOICES, null=True, blank=True)

    # Keep group & permissions definitions as is
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

    def __str__(self):
        return self.username


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

    # Use an IntegerField with the above choices
    gender = models.IntegerField(
        choices=GENDER_CHOICES,
        null=True,
        blank=True
    )

    def __str__(self):
        return f"{self.user.username}'s Personal Data"
