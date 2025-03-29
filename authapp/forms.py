# authapp/forms.py
from django import forms
from django.contrib.auth import get_user_model

from .models import PersonalData

User = get_user_model()

class SettingsForm(forms.Form):
    username = forms.CharField(label="Username", max_length=150)
    email = forms.EmailField(label="Email", required=False)
    b_day = forms.DateField(label="Birthday", required=False, widget=forms.DateInput(attrs={'type': 'date'}))
    gender = forms.ChoiceField(label="Gender", choices=[('', '---------')] + PersonalData.GENDER_CHOICES, required=False)

    def __init__(self, *args, **kwargs):
        # We'll pass user & personal_data as extra arguments
        self.user_instance = kwargs.pop('user_instance', None)
        self.personal_data_instance = kwargs.pop('personal_data_instance', None)
        super().__init__(*args, **kwargs)

        # If instances were provided, set initial form data
        if self.user_instance:
            self.fields['username'].initial = self.user_instance.username
            self.fields['email'].initial = self.user_instance.email

        if self.personal_data_instance:
            self.fields['b_day'].initial = self.personal_data_instance.b_day
            self.fields['gender'].initial = self.personal_data_instance.gender

    def save(self):
        """
        Saves the form data to both the User model and the PersonalData model.
        """
        # Update the User fields
        if self.user_instance:
            self.user_instance.username = self.cleaned_data['username']
            self.user_instance.email = self.cleaned_data['email']
            self.user_instance.save()

        # Update the PersonalData fields
        if self.personal_data_instance:
            self.personal_data_instance.b_day = self.cleaned_data['b_day']
            # Convert empty string to None for gender if user leaves it unselected
            gender_val = self.cleaned_data['gender']
            self.personal_data_instance.gender = gender_val if gender_val else None
            self.personal_data_instance.save()


class PersonalDataForm(forms.ModelForm):
    class Meta:
        model = PersonalData
        fields = ['preferred_name', 'b_day', 'gender']
