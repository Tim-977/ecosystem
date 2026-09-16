from django.conf import settings
from django.db import models


class OnboardingResponse(models.Model):
    """Answers a visitor gave in the pre-signup onboarding flow.

    Written anonymously while they're still deciding (keyed by session), then
    linked to the account once they sign up. Nothing reads this yet — the
    authenticated experience is wired up separately.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='onboarding',
    )
    session_key = models.CharField(max_length=40, blank=True, db_index=True)
    answers = models.JSONField(default=dict)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        who = self.user.username if self.user_id else (self.session_key or 'anonymous')
        return f"OnboardingResponse({who}, {len(self.answers)} answers)"
