from datetime import date
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from .models import DailyData


@login_required
def main_page_view(request):
    """Main page that lists all logged data for the logged-in user."""
    all_data = DailyData.objects.filter(user_id=request.user.id).order_by('-date')  # Show only user's data

    context = {
        "all_data": all_data,
        "username": request.user.username  # No "Guest" fallback, user is always logged in
    }
    return render(request, 'mainpage/main.html', context)


@login_required
def day_view(request, year, month, day):
    """Shows a form for a specific date. Updates existing data instead of adding new rows."""
    current_date = date(year, month, day)

    # Fetch or create a DailyData entry for the logged-in user
    daily_obj, created = DailyData.objects.get_or_create(user_id=request.user.id, date=current_date)

    if request.method == 'POST':
        # Fetch form data from request
        daily_obj.mood_rating = request.POST.get('mood_rating') or None
        daily_obj.productivity_score = request.POST.get('productivity_score') or None
        daily_obj.habits = request.POST.get('habits')
        daily_obj.hourly_activity = request.POST.get('hourly_activity')
        daily_obj.sleep_info = request.POST.get('sleep_info')
        daily_obj.thoughts = request.POST.get('thoughts')

        daily_obj.save()
        return redirect('day_view', year=year, month=month, day=day)

    context = {
        "daily_obj": daily_obj,
        "date": current_date,
    }
    return render(request, 'mainpage/day.html', context)
