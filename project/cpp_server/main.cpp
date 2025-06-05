#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <cstdlib>
#include <cstdio>
#include <filesystem>
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
    std::string mode = request_json.value("mode", "month");
    int month = request_json.value("month", 0);

    if (user_id < 0 || year == 0) {
        json err = {{"success", false}, {"error", "Missing user_id or year"}};
        return err.dump();
    }

    if (mode == "month" && month == 0) {
        json err = {{"success", false}, {"error", "Missing month"}};
        return err.dump();
    }

    std::string baseDir = "project/cpp_server";
    std::string inputFile;
    std::string legendFile;
    std::string outputDir = "mainpage/static/mainpage/images";
    std::string outputFile;
    if (mode == "year") {
        inputFile = baseDir + "/year_input_" + std::to_string(user_id) + "_" + std::to_string(year) + ".txt";
        legendFile = baseDir + "/year_legend_" + std::to_string(user_id) + "_" + std::to_string(year) + ".txt";
        outputFile = outputDir + "/activity_diagram_" + std::to_string(user_id) + "_" + std::to_string(year) + ".png";
    } else {
        inputFile = baseDir + "/input_" + std::to_string(user_id) + "_" + std::to_string(year) + "_" + std::to_string(month) + ".txt";
        legendFile = baseDir + "/legend_" + std::to_string(user_id) + "_" + std::to_string(year) + "_" + std::to_string(month) + ".txt";
        outputFile = outputDir + "/activity_diagram_" + std::to_string(user_id) + "_" + std::to_string(year) + "_" + std::to_string(month) + ".png";
    }

    std::filesystem::create_directories(outputDir);

    try {
        std::ofstream inF(inputFile);
        if (!inF) throw std::runtime_error("input");
        if (mode == "year") {
            for (const auto& row : request_json["activity_log"]) {
                for (const auto& col : row) {
                    inF << col.get<std::string>() << "\n";
                }
            }
        } else {
            for (const auto& row : request_json["activity_log"]) {
                for (size_t i = 0; i < row.size(); ++i) {
                    inF << row[i].get<std::string>();
                    if (i + 1 < row.size()) inF << ' ';
                }
                inF << '\n';
            }
        }
        inF.close();

        std::ofstream lf(legendFile);
        if (lf) {
            if (request_json.contains("color_map")) {
                for (auto it = request_json["color_map"].begin(); it != request_json["color_map"].end(); ++it) {
                    lf << it.value().get<std::string>() << '\t' << it.key() << '\n';
                }
            } else if (request_json.contains("legend")) {
                for (const auto& item : request_json["legend"]) {
                    if (item.size() >= 2)
                        lf << item[1].get<std::string>() << '\t' << item[0].get<std::string>() << '\n';
                }
            }
            lf.close();
        }
    } catch (...) {
        json err = {{"success", false}, {"error", "Failed to write input files"}};
        return err.dump();
    }

    std::string cmd;
    if (mode == "year") {
        cmd = "activity_rendering/render_year --input-file \"" + inputFile + "\" --legend-file \"" + legendFile + "\" --output-file \"" + outputFile + "\"";
    } else {
        cmd = "activity_rendering/render --input-file \"" + inputFile + "\" --legend-file \"" + legendFile + "\" --output-file \"" + outputFile + "\"";
    }

    int ret = system(cmd.c_str());
    std::remove(inputFile.c_str());
    std::remove(legendFile.c_str());

    if (ret != 0) {
        json err = {{"success", false}, {"error", "Failed to launch renderer"}};
        return err.dump();
    }

    std::string publicPath;
    size_t pos = outputFile.find("static/");
    if (pos != std::string::npos)
        publicPath = "/" + outputFile.substr(pos);
    else
        publicPath = "/" + outputFile;

    json resp = {{"success", true}, {"image_path", publicPath}};
    return resp.dump();
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
