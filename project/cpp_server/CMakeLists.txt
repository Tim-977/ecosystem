cmake_minimum_required(VERSION 3.10)
project(cpp_socket_renderer LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -O2")

include_directories(${PROJECT_SOURCE_DIR}/include)

add_executable(cpp_server main.cpp)

# add_executable(render render.cpp)
# install(TARGETS render DESTINATION ${CMAKE_BINARY_DIR})
