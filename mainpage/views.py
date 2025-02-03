from django.http import HttpResponse
from django.contrib.auth.decorators import login_required


@login_required
def main_page(request):
    return HttpResponse(f"<h1>Welcome, {request.user.username}!</h1>")
