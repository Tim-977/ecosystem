#include <SFML/Graphics.hpp>
#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>
#include <string>

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

sf::Color parseHexColor(const std::string &s) {
    if (s.size() == 7 && s[0] == '#') { 
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 16) & 0xFF;
        sf::Uint8 g = (val >> 8)  & 0xFF;
        sf::Uint8 b =  val        & 0xFF;
        return sf::Color(r, g, b, 255);
    } 
    else if (s.size() == 9 && s[0] == '#') {
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 24) & 0xFF;
        sf::Uint8 g = (val >> 16) & 0xFF;
        sf::Uint8 b = (val >> 8)  & 0xFF;
        sf::Uint8 a =  val        & 0xFF;
        return sf::Color(r, g, b, a);
    }
    return sf::Color::White;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <user_id>\n";
        return 1;
    }
    std::string userId = argv[1];
    
    // Image constants
    const int WD = 5000;
    const int HT = 5000;
    const double r = 1500; // inner radius for data circles
    const double R = 2000; // outer radius for data circles
    const int seg = 367;   // total segments (days + 2 extra black segments)
    const int pt = 24;     // points (hours) per segment
    const double mn_r = 9; // small circle radius
    const int st = 0;
    
    // Offsets for the orbit and text
    const float orbitOffset      = 50.f;  // gap between data circles and the outer orbit line
    const float labelExtraOffset = 20.f;  // pushes text further out from the orbit
    // The arc offset used earlier for labels remains unchanged.
    const float arcOffset        = 100.f;
    const int   monthFont        = 70;
    
    // Create an image for the pixel-based rendering of data circles.
    sf::Image window;
    window.create(WD, HT, sf::Color::Black);
    
    point center(WD / 2.0, HT / 2.0);
    
    // Read color lines from the input file.
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
    
    const int required_lines = (seg - 2) * pt;
    if ((int)colorLines.size() < required_lines) {
        std::cerr << "Expected " << required_lines << " color lines, got " 
                  << colorLines.size() << "\n";
        return 1;
    }
    
    // Build the data circles.
    std::vector<std::vector<circle>> v(seg, std::vector<circle>(pt));
    int colorIndex = 0;
    for (int i = 0; i < seg; i++) {
        double ang = -M_PI / 2.0 + double(i + st) * 2.0 * M_PI / seg;
        for (int j = 0; j < pt; j++) {
            sf::Color c;
            if (i < seg - 2)
                c = parseHexColor(colorLines[colorIndex++]);
            else
                c = sf::Color::Black;
            double ringRadius = r + (double)(R - r) / pt * j;
            point pos = point(std::cos(ang), std::sin(ang)) * ringRadius + center;
            v[i][j] = circle(pos, mn_r, c);
        }
    }
    
    // Render the data circles into the image.
    for (auto &row : v) {
        for (auto &c : row) {
            c.draw(window);
        }
    }
    
    // Convert the image into a texture.
    sf::Texture circleTexture;
    if (!circleTexture.loadFromImage(window)) {
        std::cerr << "Failed to create texture from image.\n";
        return 1;
    }
    
    // Create a RenderTexture to overlay the orbit and text.
    sf::RenderTexture renderTexture;
    if (!renderTexture.create(WD, HT)) {
        std::cerr << "Failed to create render texture.\n";
        return 1;
    }
    renderTexture.clear(sf::Color::Black);
    
    // Draw the pixel-based data circles.
    sf::Sprite sprite(circleTexture);
    renderTexture.draw(sprite);
    
    // Load the font from the specified location.
    sf::Font font;
    if (!font.loadFromFile("/home/yhat/ecosystem/activityredering/fonts/ArialCE.ttf")) {
        std::cerr << "Failed to load font from /home/yhat/ecosystem/activityredering/fonts/ArialCE.ttf\n";
        return 1;
    }
    
    // Draw the outer orbit (a thin circular outline).
    float envelopeRadius = float(R + mn_r) + orbitOffset;
    {
        sf::CircleShape envelope(envelopeRadius);
        envelope.setPointCount(360);
        envelope.setOrigin(envelopeRadius, envelopeRadius);
        envelope.setPosition(float(center.x), float(center.y));
        envelope.setFillColor(sf::Color::Transparent);
        envelope.setOutlineColor(sf::Color::White);
        // envelope.setOutlineColor(sf::Color(255, 100, ));
        envelope.setOutlineThickness(4.f);
        renderTexture.draw(envelope);
    }
    
    // --- Here we add a tiny gap (only in the orbit outline) at the top ---
    // We want to cover about 10 pixels (arc length) of the orbit line.
    // Compute the corresponding gap angle (in radians) from the arc length:
    float gapArcLength = 90.f; // desired gap in pixels along the outer ring
    float gapAngleRad = gapArcLength / envelopeRadius;  // arc length = radius * angle
    float gapAngleDeg = gapAngleRad * 180.f / 3.14159265f; // convert to degrees
    // We'll center this gap at the top: i.e. at -90°.
    float gapCenterDeg = -91.73f;
    float gapCenterRad = gapCenterDeg * 3.14159265f / 180.f;
    
    // Compute the gap's center position along the orbit.
    float gapCenterX = float(center.x + envelopeRadius * std::cos(gapCenterRad));
    float gapCenterY = float(center.y + envelopeRadius * std::sin(gapCenterRad) + 10);
    
    // Create a small rectangle that covers the orbit's outline.
    // Its width is the arc length (gapArcLength), and its height is a bit more than the orbit thickness.
    sf::RectangleShape gapRect(sf::Vector2f(gapArcLength, -20.f));  // 4 px tall covers the 2 px outline comfortably
    gapRect.setFillColor(sf::Color::Black);
    gapRect.setOrigin(gapArcLength/2.f, 4.f/2.f);
    gapRect.setPosition(gapCenterX, gapCenterY);
    // The tangent at the top is horizontal; in general, rotate by (gapCenterDeg + 90).
    gapRect.setRotation(gapCenterDeg + 90.f);
    renderTexture.draw(gapRect);
    // --- End of gap addition ---
    
    // Place month labels along the orbit.
    std::vector<std::string> months = {
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    };
    int monthDays[12] = {31,28,31,30,31,30,31,31,30,31,30,31};
    int dayOffset = 0;
    
    for (int m = 0; m < 12; m++) {
        double angle = -M_PI / 2.0 + double(dayOffset) * 2.0 * M_PI / (seg - 2);
        dayOffset += monthDays[m];
        
        float labelRadius = envelopeRadius + labelExtraOffset;
        // Arc-based label offset (shift label clockwise) remains unchanged.
        float deltaAngle = arcOffset / labelRadius;
        double shiftedAngle = angle + deltaAngle;
        
        float x = float(center.x + std::cos(shiftedAngle) * labelRadius);
        float y = float(center.y + std::sin(shiftedAngle) * labelRadius);
        
        sf::Text monthText(months[m], font, monthFont);
        monthText.setFillColor(sf::Color::White);
        
        sf::FloatRect lb = monthText.getLocalBounds();
        monthText.setOrigin(lb.width / 2.f, lb.height + lb.top);
        
        float angleDeg = float(shiftedAngle * 180.f / 3.14159265358979323846);
        monthText.setRotation(angleDeg + 90.f);
        monthText.setPosition(x, y);
        
        renderTexture.draw(monthText);
    }
    
    // Extra info near the top.
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
    
    // Center titles.
    {
        sf::Text mainTitle("My Year in Data", font, 300);
        mainTitle.setFillColor(sf::Color::White);
        mainTitle.setOrigin(mainTitle.getLocalBounds().width / 2.f,
                            mainTitle.getLocalBounds().height / 2.f);
        mainTitle.setPosition(float(center.x), float(center.y) - 200.f);
        renderTexture.draw(mainTitle);
        
        sf::Text dateTitle("1 Jan ~ 31 Dec", font, 190);
        dateTitle.setFillColor(sf::Color::White);
        dateTitle.setOrigin(dateTitle.getLocalBounds().width / 2.f,
                           dateTitle.getLocalBounds().height / 2.f);
        dateTitle.setPosition(float(center.x), float(center.y) + 100.f);
        renderTexture.draw(dateTitle);

        sf::Text yearTitle("2025", font, 150);
        yearTitle.setFillColor(sf::Color::White);
        yearTitle.setOrigin(yearTitle.getLocalBounds().width / 2.f,
                           yearTitle.getLocalBounds().height / 2.f);
        yearTitle.setPosition(float(center.x), float(center.y) + 350.f);
        renderTexture.draw(yearTitle);
    }
    
    // ... (after drawing circle, months, titles, etc.)

    // Example: 10 legend items (color squares + label)
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

    // Position the legend near the bottom-left corner
    float startX          = 80.f;    // left margin
    float startY          = 3800.f;  // vertical start (higher number -> lower on image)
    float boxSize         = 85.f;    // size of each color square
    float spacing         = 120.f;    // vertical gap between each row
    unsigned int fontSize = 85;      // bigger font so it fills the corner area

    for (int i = 0; i < (int)legendItems.size(); i++) {
        // Y-position for this legend row
        float rowY = startY + i * spacing;

        // 1) Draw the color square
        sf::RectangleShape colorBox(sf::Vector2f(boxSize, boxSize));
        colorBox.setFillColor(legendItems[i].first);
        colorBox.setPosition(startX, rowY);
        renderTexture.draw(colorBox);

        // 2) Draw the text label
        sf::Text label(legendItems[i].second, font, fontSize);
        label.setFillColor(sf::Color::White);

        // Offset the text slightly to the right of the color box,
        // and nudge it vertically to look centered relative to the square
        label.setPosition(startX + boxSize + 20.f, rowY - 5.f);
        renderTexture.draw(label);
    }

    // We'll just use a hard-coded handle for now
    std::string handle = "@username";

    // Create the text object
    sf::Text userTag(handle, font, 120); // font is your loaded sf::Font, size = 50
    userTag.setFillColor(sf::Color(80, 80, 80)); // dark gray color

    // Compute the bounding box of the text
    sf::FloatRect tagBounds = userTag.getLocalBounds();

    // Set how far from the bottom-right corner
    float margin = 80.f;

    // Place the text so its bottom-right corner has the given margin
    userTag.setPosition(
        WD - tagBounds.width - margin,   // X
        HT - tagBounds.height - margin   // Y
    );

    // Draw onto your RenderTexture
    renderTexture.draw(userTag);

    // Then finalize and save, e.g.:
    renderTexture.display();
    sf::Image finalImage = renderTexture.getTexture().copyToImage();
    
    std::string outPath = "mainpage/static/mainpage/images/year_diagram_" + userId + ".png";
    if (!finalImage.saveToFile(outPath)) {
        std::cerr << "Failed to save image to " << outPath << "\n";
        return 1;
    }
    
    std::cout << "Saved image to " << outPath << std::endl;
    return 0;
}
