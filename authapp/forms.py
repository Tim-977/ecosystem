import pytz
from django import forms
from .models import PersonalData

class PersonalDataForm(forms.ModelForm):
    timezone = forms.ChoiceField(
        choices=[(tz, tz) for tz in pytz.all_timezones],  # All valid tz strings
        required=True
    )

    class Meta:
        model = PersonalData
        fields = ['preferred_name', 'b_day', 'gender', 'timezone']
