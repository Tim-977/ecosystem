#include <SFML/Graphics.hpp>
#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>
#include <string>

#define sq(x) (int)x*x

struct point {
    double x, y;

    point() : x(0), y(0) {}
    point(double _x, double _y) : x(_x), y(_y) {}

    // Overloads for arithmetic
    point operator+(double oth) const {
        return point(x + oth, y + oth);
    }
    point operator-(double oth) const {
        return *this + (-oth);
    }
    point operator*(double oth) const {
        return point(x * oth, y * oth);
    }
    point operator+(point oth) const {
        return point(x + oth.x, y + oth.y);
    }
};

// A circle structure that draws a filled circle of radius r on a sf::Image
struct circle {
    point center;
    double r;
    sf::Color clr;
    int thickness;  // Not really used, but kept for compatibility

    circle() {
        thickness = 1;
        r = 0;
        clr = sf::Color::White;
    }

    circle(point _center, double _r, sf::Color _clr) {
        thickness = 1;
        clr = _clr;
        r = _r;
        // Because the snippet used `center = _center - r;`, that was to offset?
        // We'll keep the snippet's logic:
        center = _center - r;  
    }

    void draw(sf::Image &window) {
        // window.getSize() returns (width, height)
        unsigned int w = window.getSize().x;
        unsigned int h = window.getSize().y;

        int left   = std::max(0,    (int)(center.x - r - 1));
        int right  = std::min((int)w - 1, (int)(center.x + r + 1));
        int top    = std::max(0,    (int)(center.y - r - 1));
        int bottom = std::min((int)h - 1, (int)(center.y + r + 1));

        for (int i = left; i <= right; i++) {
            for (int j = top; j <= bottom; j++) {
                // the snippet used: sq((center.x - i)) + sq((center.y - j)) <= sq(r)
                // be mindful that sq is #defined as (int)x*x
                // We'll keep it as is, but it's slightly less precise for double usage.
                double dx = (center.x - i);
                double dy = (center.y - j);
                if ((dx * dx + dy * dy) <= (r * r)) {
                    window.setPixel(i, j, clr);
                }
            }
        }
    }
};

// Utility to parse a #RRGGBB or #RRGGBBAA string to sf::Color
sf::Color parseHexColor(const std::string &s) {
    if (s.size() == 7 && s[0] == '#') { 
        // #RRGGBB
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 16) & 0xFF;
        sf::Uint8 g = (val >> 8)  & 0xFF;
        sf::Uint8 b =  val        & 0xFF;
        return sf::Color(r, g, b, 255);
    }
    else if (s.size() == 9 && s[0] == '#') {
        // #RRGGBBAA
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 24) & 0xFF;
        sf::Uint8 g = (val >> 16) & 0xFF;
        sf::Uint8 b = (val >> 8)  & 0xFF;
        sf::Uint8 a =  val        & 0xFF;
        return sf::Color(r, g, b, a);
    }
    // Fallback
    return sf::Color::White;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <user_id>\n";
        return 1;
    }

    // 1) Parse user ID from command line
    std::string userId = argv[1];

    // 2) Constants for your big circle
    const int WD = 5000;
    const int HT = 5000;
    const double r = 1500;  // inner radius
    const double R = 2000;  // outer radius
    const int seg = 366;    // days in a year (including leap day)
    const int pt = 24;      // hours per day
    const double mn_r = 9;  // radius of each little circle
    const int st = 0;       // offset for days

    // 3) Create SFML Image, fill black
    sf::Image window;
    window.create(WD, HT, sf::Color::Black);

    // 4) The center
    point center(WD / 2.0, HT / 2.0);

    // 5) Read color lines from "year_input.txt"
    std::ifstream infile("activityredering/year_input.txt");
    if (!infile.is_open()) {
        std::cerr << "Failed to open year_input.txt\n";
        return 1;
    }

    std::vector<std::string> colorLines;
    std::string line;
    while (std::getline(infile, line)) {
        colorLines.push_back(line);
    }
    infile.close();

    // We expect seg * pt = 366 * 24 lines
    if ((int)colorLines.size() != seg * pt) {
        std::cerr << "Expected " << (seg * pt) << " color lines, got " 
                  << colorLines.size() << "\n";
        return 1;
    }

    // 6) Prepare a 2D array of circles, each circle has color from colorLines
    std::vector<std::vector<circle>> v(seg, std::vector<circle>(pt));

    int colorIndex = 0;
    for (int i = 0; i < seg; i++) {
        double ang = (double)((i + st) % seg) * 2.0 * M_PI / seg; 
        for (int j = 0; j < pt; j++) {
            sf::Color c = parseHexColor(colorLines[colorIndex++]);

            // The radius from the center depends on j:
            // r + (R-r)/pt * j  => linearly mapped from 1500..2000
            double ringRadius = r + ((double)(R - r) / pt) * j;

            // position is:
            point pos = point(std::cos(ang), std::sin(ang)) * ringRadius + center;

            // create a circle of radius mn_r at 'pos'
            v[i][j] = circle(pos, mn_r, c);
        }
    }

    // 7) Draw them all
    for (auto &row : v) {
        for (auto &c : row) {
            c.draw(window);
        }
    }

    // 8) Save the final PNG to "mainpage/static/mainpage/images/year_diagram_<userId>.png"
    std::string outPath = "mainpage/static/mainpage/images/year_diagram_" + userId + ".png";
    if (!window.saveToFile(outPath)) {
        std::cerr << "Failed to save image to " << outPath << std::endl;
        return 1;
    }

    std::cout << "Saved image to " << outPath << std::endl;
    return 0;
}
