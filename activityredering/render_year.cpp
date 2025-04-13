#include <SFML/Graphics.hpp>
#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>
#include <string>

// Macro for squaring a number (beware: casts to int)
#define sq(x) (int)x*x

// Define a simple point structure with overloaded operators.
struct point {
    double x, y;
    point() : x(0), y(0) {}
    point(double _x, double _y) : x(_x), y(_y) {}

    point operator+(double oth) const { return point(x + oth, y + oth); }
    point operator-(double oth) const { return *this + (-oth); }
    point operator*(double oth) const { return point(x * oth, y * oth); }
    point operator+(point oth) const { return point(x + oth.x, y + oth.y); }
};

// A circle structure which draws a filled circle onto an sf::Image.
struct circle {
    point center;
    double r;
    sf::Color clr;
    int thickness;  // Not used, maintained for compatibility.

    circle() {
        thickness = 1;
        r = 0;
        clr = sf::Color::White;
    }
    circle(point _center, double _r, sf::Color _clr) {
        thickness = 1;
        r = _r;
        clr = _clr;
        // Offset the center as in the original logic.
        center = _center - r;
    }

    void draw(sf::Image &window) {
        unsigned int w = window.getSize().x;
        unsigned int h = window.getSize().y;
        int left   = std::max(0, (int)(center.x - r - 1));
        int right  = std::min((int)w - 1, (int)(center.x + r + 1));
        int top    = std::max(0, (int)(center.y - r - 1));
        int bottom = std::min((int)h - 1, (int)(center.y + r + 1));

        for (int i = left; i <= right; i++) {
            for (int j = top; j <= bottom; j++) {
                double dx = (center.x - i);
                double dy = (center.y - j);
                if ((dx * dx + dy * dy) <= (r * r)) {
                    window.setPixel(i, j, clr);
                }
            }
        }
    }
};

// Utility to parse a hex color string (#RRGGBB or #RRGGBBAA) into an sf::Color.
sf::Color parseHexColor(const std::string &s) {
    if (s.size() == 7 && s[0] == '#') { 
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 16) & 0xFF;
        sf::Uint8 g = (val >> 8)  & 0xFF;
        sf::Uint8 b =  val        & 0xFF;
        return sf::Color(r, g, b, 255);
    } else if (s.size() == 9 && s[0] == '#') {
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 24) & 0xFF;
        sf::Uint8 g = (val >> 16) & 0xFF;
        sf::Uint8 b = (val >> 8)  & 0xFF;
        sf::Uint8 a =  val        & 0xFF;
        return sf::Color(r, g, b, a);
    }
    // Fallback color
    return sf::Color::White;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <user_id>\n";
        return 1;
    }
    std::string userId = argv[1];

    // Constants for our large image.
    const int WD = 5000;
    const int HT = 5000;
    const double r = 1500;   // inner radius
    const double R = 2000;   // outer radius

    // Use 367 segments: first 365 segments from input, last 2 override to black.
    const int seg = 367;     // total segments (days)
    const int pt = 24;       // points per segment (hours)
    const double mn_r = 9;   // radius of each little circle
    const int st = 0;        // day offset, if any

    // Create the SFML image with a black background.
    sf::Image window;
    window.create(WD, HT, sf::Color::Black);

    // Set the center of the image.
    point center(WD / 2.0, HT / 2.0);

    // Read color lines from "activityredering/year_input.txt"
    std::ifstream infile("activityredering/year_input.txt");
    if (!infile.is_open()) {
        std::cerr << "Failed to open activityredering/year_input.txt\n";
        return 1;
    }
    std::vector<std::string> colorLines;
    std::string line;
    while (std::getline(infile, line)) {
        colorLines.push_back(line);
    }
    infile.close();

    // We'll require colors for 365 days (i.e., (seg - 2) * pt lines).
    int required_lines = (seg - 2) * pt;  // 365 * 24 = 8760
    if ((int)colorLines.size() < required_lines) {
        std::cerr << "Expected at least " << required_lines 
                  << " color lines, got " << colorLines.size() << "\n";
        return 1;
    }

    // Create a 2D vector for circles with dimensions (seg x pt).
    std::vector<std::vector<circle>> v(seg, std::vector<circle>(pt));
    int colorIndex = 0;
    for (int i = 0; i < seg; i++) {
        // Start drawing from the top: -90° offset.
        double ang = -M_PI / 2.0 + ((double)(i + st) * 2.0 * M_PI / seg);
        for (int j = 0; j < pt; j++) {
            sf::Color c;
            // For the first 365 segments, use the input file color; for the last 2, force black.
            if (i < seg - 2) {
                c = parseHexColor(colorLines[colorIndex++]);
            } else {
                c = sf::Color::Black;
            }
            // Map the hour j linearly from r to R.
            double ringRadius = r + ((double)(R - r) / pt) * j;
            // Compute the position along the ring.
            point pos = point(std::cos(ang), std::sin(ang)) * ringRadius + center;
            v[i][j] = circle(pos, mn_r, c);
        }
    }

    // Draw every circle into the image.
    for (auto &row : v) {
        for (auto &c : row) {
            c.draw(window);
        }
    }

    // Construct the output path for the PNG.
    std::string outPath = "mainpage/static/mainpage/images/year_diagram_" + userId + ".png";
    if (!window.saveToFile(outPath)) {
        std::cerr << "Failed to save image to " << outPath << "\n";
        return 1;
    }

    std::cout << "Saved image to " << outPath << std::endl;
    return 0;
}
