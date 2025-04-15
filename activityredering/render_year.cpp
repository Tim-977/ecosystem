#include <SFML/Graphics.hpp>
#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>
#include <string>

// Data structures used for drawing
struct point {
    double x, y;
    point() : x(0), y(0) {}
    point(double _x, double _y) : x(_x), y(_y) {}
    
    point operator+(double oth) const { return point(x + oth, y + oth); }
    point operator-(double oth) const { return *this + (-oth); }
    point operator*(double oth) const { return point(x * oth, y * oth); }
    point operator+(point oth) const { return point(x + oth.x, y + oth.y); }
};

struct circle {
    point center;
    double r;
    sf::Color clr;
    int thickness;
    
    circle() {
        thickness = 1;
        r = 0;
        clr = sf::Color::White;
    }
    circle(point _center, double _r, sf::Color _clr) {
        thickness = 1;
        r = _r;
        clr = _clr;
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

// Helper to parse color from a hex string like "#RRGGBB" or "#RRGGBBAA"
sf::Color parseHexColor(const std::string &s) {
    // Handle #RRGGBB
    if (s.size() == 7 && s[0] == '#') {
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 16) & 0xFF;
        sf::Uint8 g = (val >> 8)  & 0xFF;
        sf::Uint8 b =  val        & 0xFF;
        return sf::Color(r, g, b, 255);
    } 
    // Handle #RRGGBBAA
    else if (s.size() == 9 && s[0] == '#') {
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 24) & 0xFF;
        sf::Uint8 g = (val >> 16) & 0xFF;
        sf::Uint8 b = (val >> 8)  & 0xFF;
        sf::Uint8 a =  val        & 0xFF;
        return sf::Color(r, g, b, a);
    }
    // If invalid, default to white
    return sf::Color::White;
}

int main(int argc, char* argv[]) {
    // We expect 4 arguments: username, year, input_path, output_path
    if (argc < 5) {
        std::cerr << "Usage: " << argv[0]
                  << " <username> <year> <input_path> <output_path>\n";
        return 1;
    }
    std::string userName  = argv[1];  // e.g. "myuser42"
    std::string yearStr   = argv[2];  // e.g. "2025"
    std::string inputPath = argv[3];  // e.g. "/.../year_input.txt"
    std::string outPath   = argv[4];  // e.g. "/.../year_diagram_5.png"

    // Large canvas
    const int WD = 5000;
    const int HT = 5000;

    // Radii for circles
    const double r = 1500; // inner radius
    const double R = 2000; // outer radius

    // We'll draw 367 "day segments" (365 days + 2 black segments)
    // Each segment has 24 sub-segments (hours).
    const int seg = 367;
    const int pt = 24;

    // Radius of each small circle
    const double mn_r = 9;

    // Create an SFML image that we will fill at the pixel level for the circles
    sf::Image window;
    window.create(WD, HT, sf::Color::Black);

    point center(WD / 2.0, HT / 2.0);

    // Read color data lines from inputPath
    std::ifstream infile(inputPath);
    if (!infile.is_open()) {
        std::cerr << "Failed to open " << inputPath << "\n";
        return 1;
    }
    std::vector<std::string> colorLines;
    std::string line;
    while (std::getline(infile, line)) {
        colorLines.push_back(line);
    }
    infile.close();

    // For 365 days, we expect (seg - 2) * pt color lines => 365 * 24
    const int required_lines = (seg - 2) * pt;
    if ((int)colorLines.size() < required_lines) {
        std::cerr << "Expected at least " << required_lines
                  << " color lines, but got " << colorLines.size() << "\n";
        return 1;
    }

    // Precompute circle positions + colors
    std::vector<std::vector<circle>> v(seg, std::vector<circle>(pt));
    int colorIndex = 0;

    // st -> shift for starting day
    const int st = 0;
    for (int i = 0; i < seg; i++) {
        double ang = -M_PI / 2.0 + double(i + st) * 2.0 * M_PI / seg;
        for (int j = 0; j < pt; j++) {
            sf::Color c;
            // The last 2 segments are black "filler"
            if (i < seg - 2) {
                c = parseHexColor(colorLines[colorIndex++]);
            } else {
                c = sf::Color::Black;
            }
            double ringRadius = r + (double)(R - r) / pt * j;
            point pos = point(std::cos(ang), std::sin(ang)) * ringRadius + center;
            v[i][j] = circle(pos, mn_r, c);
        }
    }

    // Paint each small circle into the SFML image
    for (auto &row : v) {
        for (auto &c : row) {
            c.draw(window);
        }
    }

    // Convert that pixel data into an SFML texture
    sf::Texture circleTexture;
    if (!circleTexture.loadFromImage(window)) {
        std::cerr << "Failed to create texture from image.\n";
        return 1;
    }

    // We'll now create a "RenderTexture" for everything else (orbit outline, text, etc.)
    sf::RenderTexture renderTexture;
    if (!renderTexture.create(WD, HT)) {
        std::cerr << "Failed to create render texture.\n";
        return 1;
    }
    renderTexture.clear(sf::Color::Black);

    // Draw the sprite containing all circles
    sf::Sprite sprite(circleTexture);
    renderTexture.draw(sprite);

    // Load a font (update the path if needed!)
    sf::Font font;
    if (!font.loadFromFile("/home/yhat/ecosystem/activityredering/fonts/ArialCE.ttf")) {
        std::cerr << "Failed to load font!\n";
        return 1;
    }

    // Draw the outer orbit circle
    float orbitOffset      = 50.f;
    float envelopeRadius   = float(R + mn_r) + orbitOffset;
    sf::CircleShape envelope(envelopeRadius);
    envelope.setPointCount(360);
    envelope.setOrigin(envelopeRadius, envelopeRadius);
    envelope.setPosition(float(center.x), float(center.y));
    envelope.setFillColor(sf::Color::Transparent);
    envelope.setOutlineColor(sf::Color::White);
    envelope.setOutlineThickness(4.f);
    renderTexture.draw(envelope);

    // Optional gap at top of orbit
    float gapArcLength = 90.f; // 90 px wide gap
    float gapAngleRad  = gapArcLength / envelopeRadius;
    float gapCenterDeg = -91.73f; // center near the top
    float gapCenterRad = gapCenterDeg * 3.14159265f / 180.f;

    float gapCenterX = float(center.x + envelopeRadius * std::cos(gapCenterRad));
    float gapCenterY = float(center.y + envelopeRadius * std::sin(gapCenterRad) + 10);

    sf::RectangleShape gapRect(sf::Vector2f(gapArcLength, -20.f));
    gapRect.setFillColor(sf::Color::Black);
    gapRect.setOrigin(gapArcLength / 2.f, 4.f / 2.f);
    gapRect.setPosition(gapCenterX, gapCenterY);
    gapRect.setRotation(gapCenterDeg + 90.f);
    renderTexture.draw(gapRect);

    // Label the months
    std::vector<std::string> months = {
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    };
    int monthDays[12] = {31,28,31,30,31,30,31,31,30,31,30,31};
    int dayOffset = 0;

    float labelExtraOffset = 20.f;
    float arcOffset        = 100.f;
    int   monthFont        = 70;

    for (int m = 0; m < 12; m++) {
        double angle = -M_PI / 2.0 + double(dayOffset) * 2.0 * M_PI / (seg - 2);
        dayOffset += monthDays[m];

        float baseRadius   = envelopeRadius + labelExtraOffset;
        float deltaAngle   = arcOffset / baseRadius;
        double shiftedAngle= angle + deltaAngle;

        float x = float(center.x + std::cos(shiftedAngle) * baseRadius);
        float y = float(center.y + std::sin(shiftedAngle) * baseRadius);

        sf::Text monthText(months[m], font, monthFont);
        monthText.setFillColor(sf::Color::White);

        sf::FloatRect lb = monthText.getLocalBounds();
        monthText.setOrigin(lb.width / 2.f, lb.height + lb.top);

        float angleDeg = float(shiftedAngle * 180.f / 3.14159265358979323846);
        monthText.setRotation(angleDeg + 90.f);
        monthText.setPosition(x, y);

        renderTexture.draw(monthText);
    }

    // Info near the top explaining outer/inner ring
    {
        sf::Text hourInfo("Outer ring = 23:00, Inner ring = 00:00", font, 40);
        hourInfo.setFillColor(sf::Color::White);
        float textX = float(center.x);
        float textY = float(center.y - (R + 200));
        hourInfo.setOrigin(hourInfo.getLocalBounds().width / 2.f,
                           hourInfo.getLocalBounds().height / 2.f);
        hourInfo.setPosition(textX, textY);
        renderTexture.draw(hourInfo);
    }

    // Central titles
    {
        // Main title
        sf::Text mainTitle("My Year in Data", font, 300);
        mainTitle.setFillColor(sf::Color::White);
        mainTitle.setOrigin(mainTitle.getLocalBounds().width / 2.f,
                            mainTitle.getLocalBounds().height / 2.f);
        mainTitle.setPosition(float(center.x), float(center.y) - 200.f);
        renderTexture.draw(mainTitle);

        // Sub-title (dates)
        sf::Text dateTitle("1 Jan ~ 31 Dec", font, 190);
        dateTitle.setFillColor(sf::Color::White);
        dateTitle.setOrigin(dateTitle.getLocalBounds().width / 2.f,
                            dateTitle.getLocalBounds().height / 2.f);
        dateTitle.setPosition(float(center.x), float(center.y) + 100.f);
        renderTexture.draw(dateTitle);

        // The year from argv[2]
        sf::Text yearTitle(yearStr, font, 150);
        yearTitle.setFillColor(sf::Color::White);
        yearTitle.setOrigin(yearTitle.getLocalBounds().width / 2.f,
                            yearTitle.getLocalBounds().height / 2.f);
        yearTitle.setPosition(float(center.x), float(center.y) + 350.f);
        renderTexture.draw(yearTitle);
    }

    // Example legend items (customize or remove as you wish)
    std::vector<std::pair<sf::Color, std::string>> legendItems = {
        { sf::Color(0, 150, 255),   "Sleep" },
        { sf::Color(255, 200, 0),   "Passive" },
        { sf::Color(100, 255, 100), "Recreation" },
        { sf::Color(255, 100, 150), "Friends" },
        { sf::Color(255, 150, 0),   "Exercising" },
        { sf::Color(150, 100, 255), "Productive" },
        { sf::Color(100, 200, 100), "Studying" },
        { sf::Color(200, 0, 255),   "Reading" },
        { sf::Color(255, 200, 200), "Social Media" },
        { sf::Color(200, 200, 100), "Other" }
    };

    float startX    = 80.f;
    float startY    = 3800.f;
    float boxSize   = 85.f;
    float spacing   = 120.f;
    unsigned int legendFontSize = 85;

    for (int i = 0; i < (int)legendItems.size(); i++) {
        float rowY = startY + i * spacing;

        sf::RectangleShape colorBox(sf::Vector2f(boxSize, boxSize));
        colorBox.setFillColor(legendItems[i].first);
        colorBox.setPosition(startX, rowY);
        renderTexture.draw(colorBox);

        sf::Text label(legendItems[i].second, font, legendFontSize);
        label.setFillColor(sf::Color::White);
        label.setPosition(startX + boxSize + 20.f, rowY - 5.f);
        renderTexture.draw(label);
    }

    // Draw "@username" near the bottom-right corner
    {
        std::string handle = "@" + userName;
        sf::Text userTag(handle, font, 120);
        userTag.setFillColor(sf::Color(80, 80, 80)); // dark gray

        sf::FloatRect tagBounds = userTag.getLocalBounds();
        float margin = 80.f;
        userTag.setPosition(
            WD - tagBounds.width - margin,
            HT - tagBounds.height - margin
        );
        renderTexture.draw(userTag);
    }

    // Finalize and export
    renderTexture.display();
    sf::Image finalImage = renderTexture.getTexture().copyToImage();

    // Save to outPath
    if (!finalImage.saveToFile(outPath)) {
        std::cerr << "Failed to save image to " << outPath << "\n";
        return 1;
    }
    std::cout << "Saved image to " << outPath << std::endl;
    return 0;
}
