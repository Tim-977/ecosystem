"""Development-only settings for testing the iPhone app on a trusted Wi-Fi.

The phone reaches this machine by its LAN address, so that address has to be
an allowed host. It is passed in explicitly rather than added to the shared
settings, which stay exactly as they are for every other way of running the
site (run.sh / gunicorn keep using ecosystem.settings).

    ECOSYSTEM_DEV_HOSTS=192.168.1.20 \\
    DJANGO_SETTINGS_MODULE=ecosystem.settings_dev \\
    python manage.py runserver 0.0.0.0:8000

`ecosystem-mobile/scripts/start-django-dev.sh` does this for you, using the
laptop's current Wi-Fi address.
"""
import os

from .settings import *  # noqa: F401,F403
from .settings import ALLOWED_HOSTS, SIMPLE_JWT

DEBUG = True

_dev_hosts = [h.strip() for h in os.environ.get('ECOSYSTEM_DEV_HOSTS', '').split(',') if h.strip()]
ALLOWED_HOSTS = [*ALLOWED_HOSTS, *_dev_hosts]

# Optional: a shorter access-token lifetime, to watch the app refresh tokens
# on the device, e.g. ECOSYSTEM_DEV_ACCESS_MINUTES=1
_access_minutes = os.environ.get('ECOSYSTEM_DEV_ACCESS_MINUTES')
if _access_minutes:
    from datetime import timedelta

    SIMPLE_JWT = {**SIMPLE_JWT, 'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(_access_minutes))}
