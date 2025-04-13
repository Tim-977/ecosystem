#include <SFML/Graphics.hpp>
#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>

#define PI 3.14159265358979323846

struct point {
    double x, y;

    point() : x(0), y(0) {}
    point(double _x, double _y) : x(_x), y(_y) {}

    point operator+(point oth) const {
        return point(x + oth.x, y + oth.y);
    }

    point operator*(double k) const {
        return point(x * k, y * k);
    }
};

struct circle {
    point center;
    double radius;
    sf::Color color;

    circle() {}
    circle(point c, double r, sf::Color clr) : center(c), radius(r), color(clr) {}

    void draw(sf::Image &img) {
        int w = img.getSize().x;
        int h = img.getSize().y;
        for (int dx = -radius; dx <= radius; ++dx) {
            for (int dy = -radius; dy <= radius; ++dy) {
                int px = center.x + dx;
                int py = center.y + dy;
                if (px >= 0 && py >= 0 && px < w && py < h) {
                    if (dx * dx + dy * dy <= radius * radius) {
                        img.setPixel(px, py, color);
                    }
                }
            }
        }
    }
};

sf::Color parseColor(const std::string &hex) {
    std::string s = hex;
    if (s.empty() || s[0] != '#' || (s.size() != 7 && s.size() != 9)) {
        return sf::Color::White;
    }
    unsigned int value = std::stoul(s.substr(1), nullptr, 16);
    if (s.size() == 7) {
        return sf::Color((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
    } else {
        return sf::Color((value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
    }
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Missing user ID argument.\n";
        return 1;
    }

    std::string userId = argv[1];
    const int WIDTH = 4000, HEIGHT = 4000;
    const int days = 366;
    const int hours = 24;

    const double r_min = 600.0;
    const double r_max = 1800.0;
    const double centerX = WIDTH / 2.0;
    const double centerY = HEIGHT / 2.0;

    std::ifstream infile("activityredering/year_input.txt");
    if (!infile) {
        std::cerr << "Failed to open input file.\n";
        return 1;
    }

    std::vector<std::string> color_strs;
    std::string line;
    while (std::getline(infile, line)) {
        color_strs.push_back(line);
    }

    if ((int)color_strs.size() != days * hours) {
        std::cerr << "Expected " << days * hours << " color values, got " << color_strs.size() << "\n";
        return 1;
    }

    sf::Image image;
    image.create(WIDTH, HEIGHT, sf::Color::Black);

    int index = 0;
    for (int day = 0; day < days; ++day) {
        double angle = 2.0 * PI * day / days;
        for (int hour = 0; hour < hours; ++hour) {
            double radius = r_min + ((r_max - r_min) * hour / (hours - 1));
            point pos = point(cos(angle), sin(angle)) * radius + point(centerX, centerY);
            sf::Color clr = parseColor(color_strs[index++]);
            circle c(pos, 4, clr);  // radius = 4 pixels
            c.draw(image);
        }
    }

    std::string outPath = "mainpage/static/mainpage/images/year_diagram_" + userId + ".png";
    if (!image.saveToFile(outPath)) {
        std::cerr << "Failed to save image to " << outPath << "\n";
        return 1;
    }

    std::cout << "Saved image to " << outPath << std::endl;
    return 0;
}
