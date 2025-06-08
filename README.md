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
- **PostgreSQL** server and client tools (default DB) or SQLite (built‑in)


On Arch Linux use `pacman`:
```bash
sudo pacman -Syu python python-virtualenv python-pip gcc cmake make postgresql
```

On Debian you can install the basics with:
```bash
sudo apt update
sudo apt install python3 python3-venv python3-pip g++ cmake make postgresql
```

On Ubuntu based system just ki|l yourself and never do coding related stuff again.

## Setup Steps

1. **Create a virtual environment**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. **Install Python packages**
   ```bash
   pip install django gunicorn whitenoise psycopg2-binary
   ```
3. **(Optional) Configure PostgreSQL**
   By default `ecosystem/settings.py` uses PostgreSQL. Run the helper script to
   create the database and user:
   ```bash
   ./setup_postgres.sh
   ```
   To use SQLite instead, edit `ecosystem/settings.py` and set `USE_POSTGRES = False`.
4. **Collect static files** (required for production with WhiteNoise)
   ```bash
   python manage.py collectstatic
   ```
5. **Build and run the project**
   ```bash
   ./run.sh
   ```
   This compiles the C++ server with CMake and then launches Gunicorn on
   `http://0.0.0.0:8000`. Logs are written to the `logs/` directory.

The site should now be accessible and the C++ server will handle rendering
requests on port `9090`.

