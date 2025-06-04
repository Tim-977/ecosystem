# C++ Socket Renderer with Python Client

This project contains a C++ socket server (`cpp_server`) and a Python client (`python_client`). The C++ server listens on port 9090, receives JSON requests, writes a dummy PNG file, and returns a JSON response with the image path. The Python client sends a test JSON payload and prints the server response.

## Build & Run Instructions

### 1. C++ Server

1. Open a terminal and navigate to `project/cpp_server/`.
2. Create a build directory and compile:
   ```bash
   mkdir -p build
   cd build
   cmake ..
   make
   ```
3. After compilation, run the server:
   ```bash
   ./cpp_server
   ```
4. The server will start listening on port 9090.

### 2. Python Client

1. In a separate terminal, navigate to `project/python_client/`.
2. Run:
   ```bash
   python3 socket_client.py
   ```
3. The client will connect to `127.0.0.1:9090`, send a JSON payload, and print the JSON response.

### 3. Testing

* Ensure the C++ server is running before executing the Python client.
* The C++ server will create a file at `project/cpp_server/static/rendered/{user_id}_{year}.png` with dummy content.
* The Python client will print something like:
  ```
  Response from C++ server: {'status': 'ok', 'image_path': '/static/rendered/42_2025.png'}
  ```

### 4. Dependencies

* **C++ server**:
  * CMake ≥ 3.10
  * C++17 compiler (g++ or clang++)
  * `nlohmann/json.hpp` (single header provided in `include/`)
* **Python client**:
  * Python 3.x (built-in `socket` and `json` modules)

## Directory Tree

```
project/
├── cpp_server/
│   ├── include/
│   │   └── json.hpp
│   ├── main.cpp
│   ├── CMakeLists.txt
│   ├── render
│   └── build/
├── python_client/
│   └── socket_client.py
└── README.md
```
