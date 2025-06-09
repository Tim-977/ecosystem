import re
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator, MinLengthValidator, MaxLengthValidator
from django.utils.translation import gettext_lazy as _
from django.contrib.auth.models import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    # Override the default username field to enforce max_length and regex
    username = models.CharField(
        _('username'),
        max_length=12,
        unique=True,
        help_text=_('Required. 3-12 characters. Letters and digits only.'),
        validators=[
            RegexValidator(
                regex=r'^[A-Za-z0-9]+$',
                message=_('Username can only contain letters and digits.')
            ),
            MinLengthValidator(3, _('Username must have at least 3 characters.')),
            MaxLengthValidator(12, _('Username cannot exceed 12 characters.')),
        ],
        error_messages={
            'unique': _("This username is already taken."),
        },
    )

    # Optional leftover fields from your snippet
    first_name = None
    last_name = None

    GENDER_CHOICES = [
        (1, 'Male'),
        (2, 'Female'),
    ]
    preferred_name = models.CharField(max_length=100, blank=True)
    b_day = models.DateField(null=True, blank=True)
    gender = models.IntegerField(choices=GENDER_CHOICES, null=True, blank=True)

    # Make sure to call super().clean() plus any additional checks if needed
    def clean(self):
        super().clean()
        # Just in case you want an extra check for length (redundant with Min/MaxLengthValidators, but shown as example):
        if len(self.username) < 3 or len(self.username) > 12:
            raise ValidationError(_("Username must be between 3 and 12 characters in length."))

    def __str__(self):
        return self.username


class SignupAttempt(models.Model):
    ip_address = models.GenericIPAddressField()
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"SignupAttempt({self.ip_address}, {self.timestamp})"


class LoginAttempt(models.Model):
    ip_address = models.GenericIPAddressField()
    timestamp = models.DateTimeField(auto_now_add=True)
    was_success = models.BooleanField()

    def __str__(self):
        status = "success" if self.was_success else "failure"
        return f"LoginAttempt({self.ip_address}, {status}, {self.timestamp})"
