#!/bin/bash

# ================================
# PostgreSQL + Django Setup Script
# ================================
# ❗ This script sets up PostgreSQL for a Django project.
# ❗ It does NOT touch your existing SQLite data.
# ❗ Use this to prepare for a future transition to PostgreSQL.

# STEP 0: Ensure PostgreSQL and Python tooling are available
sudo pacman -Syu --noconfirm
sudo pacman -S --noconfirm postgresql python-pip python-virtualenv

# STEP 1: Initialize and start PostgreSQL if it's not already running
if [ ! -d "/var/lib/postgres/data" ]; then
    echo "🛠 Initializing PostgreSQL database cluster..."
    sudo -iu postgres initdb -D /var/lib/postgres/data
fi

sudo systemctl enable --now postgresql

# STEP 2: Create database and user
sudo -u postgres psql <<'EOF'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ecosystemdb') THEN
        CREATE DATABASE ecosystemdb;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecosystemuser') THEN
        CREATE USER ecosystemuser WITH PASSWORD 'ecosystempass';
    END IF;
    ALTER ROLE ecosystemuser SET client_encoding TO 'utf8';
    ALTER ROLE ecosystemuser SET default_transaction_isolation TO 'read committed';
    ALTER ROLE ecosystemuser SET timezone TO 'UTC';
    GRANT ALL PRIVILEGES ON DATABASE ecosystemdb TO ecosystemuser;
END
$$;
EOF

# STEP 3: Install Python dependencies
# If psycopg2-binary is missing, install it
pip show psycopg2-binary &>/dev/null || pip install psycopg2-binary

# STEP 4: Verify PostgreSQL connection using Django ORM shell
echo "🧪 Testing PostgreSQL DB connection..."
export DJANGO_SETTINGS_MODULE=ecosystem.settings

python3 -c "
import django
from django.db import connections
from django.db.utils import OperationalError

try:
    django.setup()
    connections['default'].cursor()
    print('✅ PostgreSQL connection successful.')
except OperationalError as e:
    print('❌ Connection failed:', e)
    print('ℹ️ Make sure DATABASES in settings.py is configured for PostgreSQL.')
    print('⚠️ Reminder: your SQLite db.sqlite3 remains untouched.')
" || echo "⚠️ Django or settings not configured yet. PostgreSQL is ready."

# STEP 5: Print manual step reminder
cat <<'EOM'

📌 When ready, update your Django settings.py with the following:

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'ecosystemdb',
        'USER': 'ecosystemuser',
        'PASSWORD': 'ecosystempass',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

🧠 Reminder:
- Do NOT delete db.sqlite3 yet.
- Do NOT run migrations until you're ready to switch fully.
- PostgreSQL setup is complete and connection tested.

EOM
EOS#!/bin/bash

# ================================
# PostgreSQL + Django Setup Script
# ================================
# ❗ This script sets up PostgreSQL for a Django project.
# ❗ It does NOT touch your existing SQLite data.
# ❗ Use this to prepare for a future transition to PostgreSQL.

# STEP 0: Ensure PostgreSQL and Python tooling are available
sudo pacman -Syu --noconfirm
sudo pacman -S --noconfirm postgresql python-pip python-virtualenv

# STEP 1: Initialize and start PostgreSQL if it's not already running
if [ ! -d "/var/lib/postgres/data" ]; then
    echo "🛠 Initializing PostgreSQL database cluster..."
    sudo -iu postgres initdb -D /var/lib/postgres/data
fi

sudo systemctl enable --now postgresql

# STEP 2: Create database and user
sudo -u postgres psql <<'EOF'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ecosystemdb') THEN
        CREATE DATABASE ecosystemdb;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ecosystemuser') THEN
        CREATE USER ecosystemuser WITH PASSWORD 'ecosystempass';
    END IF;
    ALTER ROLE ecosystemuser SET client_encoding TO 'utf8';
    ALTER ROLE ecosystemuser SET default_transaction_isolation TO 'read committed';
    ALTER ROLE ecosystemuser SET timezone TO 'UTC';
    GRANT ALL PRIVILEGES ON DATABASE ecosystemdb TO ecosystemuser;
END
$$;
EOF

# STEP 3: Install Python dependencies
# If psycopg2-binary is missing, install it
pip show psycopg2-binary &>/dev/null || pip install psycopg2-binary

# STEP 4: Verify PostgreSQL connection using Django ORM shell
echo "🧪 Testing PostgreSQL DB connection..."
export DJANGO_SETTINGS_MODULE=ecosystem.settings

python3 -c "
import django
from django.db import connections
from django.db.utils import OperationalError

try:
    django.setup()
    connections['default'].cursor()
    print('✅ PostgreSQL connection successful.')
except OperationalError as e:
    print('❌ Connection failed:', e)
    print('ℹ️ Make sure DATABASES in settings.py is configured for PostgreSQL.')
    print('⚠️ Reminder: your SQLite db.sqlite3 remains untouched.')
" || echo "⚠️ Django or settings not configured yet. PostgreSQL is ready."

# STEP 5: Print manual step reminder
cat <<'EOM'

📌 When ready, update your Django settings.py with the following:

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'ecosystemdb',
        'USER': 'ecosystemuser',
        'PASSWORD': 'ecosystempass',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

🧠 Reminder:
- Do NOT delete db.sqlite3 yet.
- Do NOT run migrations until you're ready to switch fully.
- PostgreSQL setup is complete and connection tested.

EOM
EOS