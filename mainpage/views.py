# mainpage/views.py

from datetime import date

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone

from .models import DailyData


@login_required
def main_page(request):
    return render(request, 'authapp/mainpage.html', {'username': request.user.username})


def main_page_view(request):
    """
    Shows a list of all daily data for demonstration.
    In a real app, you'd probably show only the current user’s data.
    """
    all_data = DailyData.objects.all().order_by('-date')  # newest first
    return render(request, 'mainpage/main.html', {"all_data": all_data})

def day_view(request, year, month, day):
    """
    Shows a form for the given date. If POST, updates the single DailyData row.
    If the row doesn’t exist, we create it initially (just once).
    """
    current_date = date(year, month, day)
    user_id = 1  # Example: you might get this from request.user.id if logged in

    # Try to get or create the daily row
    daily_obj, created = DailyData.objects.get_or_create(user_id=user_id, date=current_date)

    if request.method == 'POST':
        # Fetch form data from request
        mood_rating = request.POST.get('mood_rating')
        productivity = request.POST.get('productivity_score')
        habits = request.POST.get('habits')
        hourly_activity = request.POST.get('hourly_activity')
        sleep_info = request.POST.get('sleep_info')
        thoughts = request.POST.get('thoughts')

        # Convert numeric fields if they're not empty
        daily_obj.mood_rating = int(mood_rating) if mood_rating else None
        daily_obj.productivity_score = int(productivity) if productivity else None

        # For text fields, just store them directly
        daily_obj.habits = habits
        daily_obj.hourly_activity = hourly_activity
        daily_obj.sleep_info = sleep_info
        daily_obj.thoughts = thoughts

        daily_obj.save()

        return redirect('day_view', year=year, month=month, day=day)

    context = {
        "daily_obj": daily_obj,
        "date": current_date,
    }
    return render(request, 'mainpage/day.html', context)
