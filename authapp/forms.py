from django import forms
from django.contrib.auth import get_user_model

User = get_user_model()

class GeneralSettingsForm(forms.Form):
    username = forms.CharField(label="Username / Display Name", max_length=150)
    email = forms.EmailField(label="Email", required=False)
    # (If you later want to store theme/language/time_format in DB, add fields here as well.)

    def __init__(self, *args, **kwargs):
        self.user_instance = kwargs.pop('user_instance', None)
        super().__init__(*args, **kwargs)
        # Pre‐fill fields with the user’s current data
        if self.user_instance:
            self.fields['username'].initial = self.user_instance.username
            self.fields['email'].initial = self.user_instance.email

    def save(self):
        # Save form data to the user object
        if self.user_instance:
            self.user_instance.username = self.cleaned_data['username']
            self.user_instance.email = self.cleaned_data['email']
            self.user_instance.save()


class PersonalizationForm(forms.Form):
    GENDER_CHOICES = [('', 'Select'), (1, 'Male'), (2, 'Female')]

    gender = forms.ChoiceField(label="Gender", choices=GENDER_CHOICES, required=False)
    b_day = forms.DateField(label="Birthday (optional)",
                            required=False,
                            widget=forms.DateInput(attrs={'type': 'date'}))
    preferred_name = forms.CharField(label="Preferred Name", max_length=100, required=False)

    def __init__(self, *args, **kwargs):
        self.user_instance = kwargs.pop('user_instance', None)
        super().__init__(*args, **kwargs)
        # Pre‐fill fields with the user’s current data
        if self.user_instance:
            self.fields['gender'].initial = self.user_instance.gender or ''
            self.fields['b_day'].initial = self.user_instance.b_day
            self.fields['preferred_name'].initial = self.user_instance.preferred_name

    def save(self):
        if self.user_instance:
            # Convert empty string to None for gender
            gender_val = self.cleaned_data['gender']
            self.user_instance.gender = int(gender_val) if gender_val else None
            self.user_instance.b_day = self.cleaned_data['b_day']
            self.user_instance.preferred_name = self.cleaned_data['preferred_name']
            self.user_instance.save()
