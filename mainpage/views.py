from datetime import date
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from .models import DailyData



@login_required
def main_page_view(request):
    """Main page that lists all logged data for the logged-in user."""
    all_data = DailyData.objects.filter(user_id=request.user.id).order_by('-date')  # Show only user's data

    # Pass today's date so we can link to day/<today> easily in the template
    today = date.today()

    context = {
        "all_data": all_data,
        "username": request.user.username,
        "today": today,
    }
    return render(request, 'mainpage/main.html', context)


@login_required
def day_view(request, year, month, day):
    """Restricts users from logging future dates."""
    current_date = date(year, month, day)
    today = date.today()

    # Prevent future log creation
    if current_date > today:
        messages.error(request, "You cannot create or edit logs for future dates.")
        return redirect('main_page')

    # Fetch or create the daily log for the user
    daily_obj, _ = DailyData.objects.get_or_create(user_id=request.user.id, date=current_date)

    if request.method == 'POST':
        # Update only if the date is valid
        daily_obj.mood_rating = request.POST.get('mood_rating') or None
        daily_obj.productivity_score = request.POST.get('productivity_score') or None
        daily_obj.sleep = request.POST.get('sleep')
        daily_obj.habits_completed = request.POST.get('habits_completed')
        daily_obj.thoughts = request.POST.get('thoughts')
        daily_obj.self_reflection = request.POST.get('self_reflection')
        daily_obj.hourly_activity_logging = request.POST.get('hourly_activity_logging')
        daily_obj.todo = request.POST.get('todo')

        daily_obj.save()
        return redirect('day_view', year=year, month=month, day=day)

    context = {
        "daily_obj": daily_obj,
        "date": current_date,
    }
    return render(request, 'mainpage/day.html', context)
