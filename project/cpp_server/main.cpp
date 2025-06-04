#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include "json.hpp"

using json = nlohmann::json;

const int PORT = 9090;
const int BUFFER_SIZE = 8192;

std::string handle_request(const std::string& request_buffer) {
    json request_json;
    try {
        request_json = json::parse(request_buffer);
    } catch (const json::parse_error& e) {
        json error_resp = {
            {"status", "error"},
            {"message", "Invalid JSON"}
        };
        return error_resp.dump();
    }

    int user_id = request_json.value("user_id", -1);
    int year = request_json.value("year", 0);
    if (user_id < 0 || year == 0) {
        json error_resp = {
            {"status", "error"},
            {"message", "Missing user_id or year"}
        };
        return error_resp.dump();
    }

    system("mkdir -p static/rendered");

    std::ostringstream oss;
    oss << "static/rendered/" << user_id << "_" << year << ".png";
    std::string image_path = oss.str();

    std::ofstream outfile(image_path, std::ios::binary);
    if (!outfile) {
        json error_resp = {
            {"status", "error"},
            {"message", "Failed to create image file"}
        };
        return error_resp.dump();
    }
    outfile << "DUMMY PNG CONTENT";
    outfile.close();

    json success_resp = {
        {"status", "ok"},
        {"image_path", "/" + image_path}
    };
    return success_resp.dump();
}

int main() {
    int server_fd, new_socket;
    struct sockaddr_in address;
    int opt = 1;
    int addrlen = sizeof(address);
    char buffer[BUFFER_SIZE];

    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) {
        std::cerr << "Socket creation failed\n";
        return EXIT_FAILURE;
    }

    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR | SO_REUSEPORT, &opt, sizeof(opt))) {
        std::cerr << "setsockopt failed\n";
        return EXIT_FAILURE;
    }

    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
        std::cerr << "Bind failed\n";
        return EXIT_FAILURE;
    }

    if (listen(server_fd, 3) < 0) {
        std::cerr << "Listen failed\n";
        return EXIT_FAILURE;
    }

    std::cout << "C++ socket server listening on port " << PORT << std::endl;

    while (true) {
        if ((new_socket = accept(server_fd, (struct sockaddr*)&address, (socklen_t*)&addrlen)) < 0) {
            std::cerr << "Accept failed\n";
            continue;
        }
        std::string request_data;
        int bytes_read = 0;
        while ((bytes_read = read(new_socket, buffer, BUFFER_SIZE)) > 0) {
            request_data.append(buffer, bytes_read);
        }

        std::string response = handle_request(request_data);
        send(new_socket, response.c_str(), response.size(), 0);
        close(new_socket);
    }

    return 0;
}
