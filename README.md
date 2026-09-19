# Ecosystem Project

This repository contains a Django web application and a small C++ socket server.
The `run.sh` script builds the C++ server and launches the Django site via Gunicorn.

## Project Layout

```
activity_rendering/        # older C++ rendering experiments
authapp/                   # custom authentication app
ecosystem/                 # Django project configuration
mainpage/                  # main Django app
project/cpp_server/        # C++ socket server source
tracker/                   # small utilities (socket client, etc.)
run.sh                     # helper script to build and run everything
setup_postgres.sh          # optional PostgreSQL setup helper
```

## System Requirements
- **Python 3.10+** and `pip`
- **virtualenv** (`python3 -m venv` or the `virtualenv` package)
- **g++** with C++17 support
- **CMake** and `make`
- **PostgreSQL** server and client tools


On Arch Linux use `pacman`:
```bash
sudo pacman -Syu python python-virtualenv python-pip gcc cmake make postgresql
```

On Debian you can install the basics with:
```bash
sudo apt update
sudo apt install python3 python3-venv python3-pip g++ cmake make postgresql
```

## Setup Steps

1. **Create a virtual environment**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. **Install Python packages**
   ```bash
   pip install django gunicorn whitenoise psycopg2-binary python-dotenv \
       "djangorestframework==3.18.1" "djangorestframework-simplejwt==5.5.1"
   ```
   The last two power the mobile API (`/api/v1/`); run `python manage.py migrate`
   afterwards to create SimpleJWT's token blacklist tables.
3. **Set the Django secret key**
   `ecosystem/settings.py` reads `DJANGO_SECRET_KEY` from the environment
   (via a `.env` file next to `manage.py`, loaded automatically). Create one:
   ```bash
   python -c "from django.core.management.utils import get_random_secret_key; print('DJANGO_SECRET_KEY=' + get_random_secret_key())" > .env
   ```
   `.env` is gitignored - each environment should generate its own.
4. **(Optional) Configure PostgreSQL**
   By default `ecosystem/settings.py` uses PostgreSQL. Run the helper script to
   create the database and user:
   ```bash
   ./setup_postgres.sh
   ```
5. **Collect static files** (required for production with WhiteNoise)
   ```bash
   python manage.py collectstatic
   ```
6. **Build and run the project**
   ```bash
   ./run.sh
   ```
   This compiles the C++ server with CMake and then launches Gunicorn on
   `http://0.0.0.0:8000`. Logs are written to the `logs/` directory.

The site should now be accessible and the C++ server will handle rendering
requests on port `9090`.


## Mobile API (iPhone app)

`api/` serves the iPhone app (`../ecosystem-mobile/app`) under `/api/v1/` with
JWT authentication; the website keeps its session login. Business rules shared
by both live in `mainpage/services.py` and `authapp/services.py`.
For development on a phone in the same Wi-Fi, run the server with the dev
settings, which allow the laptop's LAN address:

```bash
../ecosystem-mobile/scripts/start-django-dev.sh   # 0.0.0.0:8000, ecosystem.settings_dev
```

API reference and app docs: `../ecosystem-mobile/docs/`.

## Security Demo

After applying migrations you can run a helper script to trigger the abuse-detection logic. This will create test accounts and perform repeated logins from the same IP.

```bash
python manage.py migrate --noinput
python security_test.py
```

Check `authapp/security_logs/suspicious_activity.log` for the logged events.
