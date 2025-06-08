#!/bin/bash

# ─── 0. Go to this script's directory ───────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 1. Configuration ───────────────────────────────────────────────
CPP_DIR="project/cpp_server"
BUILD_DIR="$CPP_DIR/build"
CPP_EXEC="$BUILD_DIR/cpp_server"
DJANGO_DIR="./"
DJANGO_PORT=8000
CPP_PORT=9090
LOG_DIR="logs"

# ─── 2. Kill old C++ server (if running) ────────────────────────────
echo "🔄 Killing previous cpp_server (port $CPP_PORT)..."
pkill -f "$CPP_EXEC" 2>/dev/null || true

# ─── 3. Build C++ server ────────────────────────────────────────────
echo "🛠  Building C++ server..."
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"
cmake .. > /dev/null && make -j > /dev/null
cd "$SCRIPT_DIR"

# ─── 4. Run C++ server in background ────────────────────────────────
echo "🚀 Starting C++ server in background..."
"$CPP_EXEC" &
CPP_PID=$!
echo "   ↳ cpp_server running (PID $CPP_PID)"

# ─── 5. Clean old logs ───────────────────────────────────────────────
mkdir -p "$SCRIPT_DIR/$LOG_DIR"
echo "🧹 Cleaning old logs..."
> "$SCRIPT_DIR/$LOG_DIR/access.log"
> "$SCRIPT_DIR/$LOG_DIR/error.log"

# ─── 6. Run Django via Gunicorn ─────────────────────────────────────
echo "🌐 Launching Gunicorn Django server on http://0.0.0.0:$DJANGO_PORT ..."
cd "$DJANGO_DIR"
source .venv/bin/activate

mkdir -p "$SCRIPT_DIR/$LOG_DIR"

gunicorn ecosystem.wsgi:application \
  --bind 0.0.0.0:$DJANGO_PORT \
  --workers 2 \
  --access-logfile "$SCRIPT_DIR/$LOG_DIR/access.log" \
  --error-logfile "$SCRIPT_DIR/$LOG_DIR/error.log"
