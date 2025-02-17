from django import forms
from .models import PersonalData

class PersonalDataForm(forms.ModelForm):
    class Meta:
        model = PersonalData
        # No timezone field
        fields = ['preferred_name', 'b_day', 'gender']
