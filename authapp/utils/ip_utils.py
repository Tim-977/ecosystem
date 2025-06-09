def get_client_ip(request):
    ip = request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR"))
    return ip.split(",")[0].strip()
