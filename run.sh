#!/bin/bash

# ─── Ensure everything runs from this script's directory ────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── CONFIG ─────────────────────────────────────────────────────────
CPP_DIR="project/cpp_server"
BUILD_DIR="$CPP_DIR/build"
CPP_EXEC="$BUILD_DIR/cpp_server"
DJANGO_DIR="ecosystem"
DJANGO_PORT=8000
CPP_PORT=9090

# ─── 1. Kill previous cpp_server ────────────────────────────────────
echo "🔄 Killing previous cpp_server (port $CPP_PORT)..."
pkill -f "$CPP_EXEC" 2>/dev/null || true

# ─── 2. Build C++ server ────────────────────────────────────────────
echo "🛠  Building C++ server..."
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"
cmake .. > /dev/null
make -j > /dev/null
cd "$SCRIPT_DIR"

# ─── 3. Start C++ server in background ──────────────────────────────
echo "🚀 Starting C++ server in background..."
"$CPP_EXEC" &
CPP_PID=$!
echo "   ↳ cpp_server running (PID $CPP_PID)"

# ─── 4. Run Django dev server ───────────────────────────────────────
echo "🌐 Launching Django server at http://127.0.0.1:$DJANGO_PORT ..."
python3 manage.py runserver $DJANGO_PORT
