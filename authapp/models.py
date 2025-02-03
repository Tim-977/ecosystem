from django.contrib.auth.models import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    # Remove first_name and last_name fields
    first_name = None
    last_name = None

    # Fix reverse accessor issue with permissions
    groups = models.ManyToManyField(
        'auth.Group',
        related_name='custom_user_set',  # Avoid conflicts by giving a unique related name
        blank=True,
        help_text='The groups this user belongs to.'
    )

    user_permissions = models.ManyToManyField(
        'auth.Permission',
        related_name='custom_user_set',  # Fix permission conflicts
        blank=True,
        help_text='Specific permissions for this user.'
    )
