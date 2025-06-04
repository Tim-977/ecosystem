from django.shortcuts import render
from .utils.socket_client import send_render_request


def render_test(request):
    """Call the C++ renderer via socket and display the image path."""
    payload = {
        "user_id": 1,
        "year": 2024,
        "activity_log": [1, 2, 3],
        "color_map": {"1": "#ff0000", "2": "#00ff00", "3": "#0000ff"},
    }
    response = send_render_request(payload)
    image_path = response.get("image_path") if isinstance(response, dict) else None
    return render(request, "render_result.html", {"image_path": image_path})
