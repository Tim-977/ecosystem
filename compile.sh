#!/bin/bash

echo "🛠️  Compiling C++ renderers..."

# Compile monthly renderer
echo "📦 Compiling render.cpp → render"
g++ /home/yhat/ecosystem/activity_rendering/render.cpp -o /home/yhat/ecosystem/activity_rendering/render -lsfml-graphics -lsfml-window -lsfml-system || {
    echo "❌ Failed to compile render.cpp"
    exit 1
}

# Compile yearly renderer
echo "📦 Compiling render_year.cpp → render_year"
g++ /home/yhat/ecosystem/activity_rendering/render_year.cpp -o /home/yhat/ecosystem/activity_rendering/render_year -lsfml-graphics -lsfml-window -lsfml-system || {
    echo "❌ Failed to compile render_year.cpp"
    exit 1
}

echo "✅ Done: All renderers compiled successfully."
