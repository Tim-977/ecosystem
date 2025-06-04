#include <SFML/Graphics.hpp>
#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>
#include <string>
#include <filesystem>

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
    
    void draw(sf::Image &img) {
        unsigned int w = img.getSize().x;
        unsigned int h = img.getSize().y;
        int left   = std::max(0, (int)(center.x - r - 1));
        int right  = std::min((int)w - 1, (int)(center.x + r + 1));
        int top    = std::max(0, (int)(center.y - r - 1));
        int bottom = std::min((int)h - 1, (int)(center.y + r + 1));
        
        for (int i = left; i <= right; i++) {
            for (int j = top; j <= bottom; j++) {
                double dx = (center.x - i);
                double dy = (center.y - j);
                if ((dx * dx + dy * dy) <= (r * r)) {
                    img.setPixel(i, j, clr);
                }
            }
        }
    }
};

sf::Color parseHexColor(const std::string &s) {
    // #RRGGBB
    if (s.size() == 7 && s[0] == '#') {
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 16) & 0xFF;
        sf::Uint8 g = (val >> 8)  & 0xFF;
        sf::Uint8 b =  val        & 0xFF;
        return sf::Color(r, g, b, 255);
    }
    // #RRGGBBAA
    else if (s.size() == 9 && s[0] == '#') {
        unsigned int val = std::stoul(s.substr(1), nullptr, 16);
        sf::Uint8 r = (val >> 24) & 0xFF;
        sf::Uint8 g = (val >> 16) & 0xFF;
        sf::Uint8 b = (val >> 8)  & 0xFF;
        sf::Uint8 a =  val        & 0xFF;
        return sf::Color(r, g, b, a);
    }
    // fallback
    return sf::Color::White;
}

int main(int argc, char* argv[]) {
    // Expect 5 args:
    //  argv[1] -> username
    //  argv[2] -> year
    //  argv[3] -> inputPath (colors)
    //  argv[4] -> outputPath (PNG)
    //  argv[5] -> legendPath (#RRGGBB\tNAME lines)
    if (argc < 6) {
        std::cerr << "Usage: " << argv[0]
                  << " <username> <year> <input_path> <output_path> <legend_path>\n";
        return 1;
    }
    std::string userName   = argv[1];
    std::string yearStr    = argv[2];
    std::string inputPath  = argv[3];
    std::string outPath    = argv[4];
    std::string legendPath = argv[5];

    // Canvas size
    const int WD = 5000;
    const int HT = 5000;

    // Radii for the day/hour circles
    const double r = 1500; // inner radius
    const double R = 2000; // outer radius
    const int seg  = 367;  // 365 + 2 black filler
    const int pt   = 24;   // hours
    const double mn_r = 9; // radius of each small circle

    // Create an image for pixel-based circle drawing
    sf::Image image;
    image.create(WD, HT, sf::Color::Black);

    // Center
    double cx = WD / 2.0;
    double cy = HT / 2.0;

    // 1) Read the color data
    std::ifstream inFile(inputPath);
    if (!inFile.is_open()) {
        std::cerr << "Failed to open " << inputPath << "\n";
        return 1;
    }
    std::vector<std::string> colorLines;
    {
        std::string ln;
        while (std::getline(inFile, ln)) {
            colorLines.push_back(ln);
        }
    }
    inFile.close();

    if ((int)colorLines.size() < (seg - 2) * pt) {
        std::cerr << "Not enough color lines in " << inputPath << "\n";
        return 1;
    }

    // 2) Build circles
    int colorIndex = 0;
    for (int i = 0; i < seg; i++) {
        double ang = -M_PI / 2.0 + (i * 2.0 * M_PI / seg);
        for (int j = 0; j < pt; j++) {
            sf::Color c;
            if (i < seg - 2) {
                c = parseHexColor(colorLines[colorIndex++]);
            } else {
                c = sf::Color::Black; // filler
            }
            double ringRadius = r + (double)(R - r) / pt * j;
            double px = cx + std::cos(ang) * ringRadius;
            double py = cy + std::sin(ang) * ringRadius;
            circle cir(point(px, py), mn_r, c);
            cir.draw(image);
        }
    }

    // Convert to texture so we can layer additional shapes & text
    sf::Texture circleTexture;
    if (!circleTexture.loadFromImage(image)) {
        std::cerr << "Failed to create texture from image.\n";
        return 1;
    }

    sf::RenderTexture rTex;
    if (!rTex.create(WD, HT)) {
        std::cerr << "Failed to create render texture.\n";
        return 1;
    }
    rTex.clear(sf::Color::Black);

    // Draw the circles (sprite)
    sf::Sprite sp(circleTexture);
    rTex.draw(sp);

    // Load font
    sf::Font font;
    // Resolve the font relative to the executable to avoid a hard coded path.
    // This allows running the binary from any environment or directory.
    std::filesystem::path execDir = std::filesystem::path(argv[0]).parent_path();
    // Fonts are stored next to the executable, so do not step out of the
    // directory when constructing the path.
    std::filesystem::path fontPath = execDir / "fonts/ArialCE.ttf";    if (!font.loadFromFile(fontPath.string())) {
        std::cerr << "Failed to load font from " << fontPath << "\n";
        return 1;
    }

    // Outer orbit circle
    float orbitOffset    = 50.f;
    float envelopeRadius = float(R + mn_r) + orbitOffset;
    {
        sf::CircleShape envelope(envelopeRadius);
        envelope.setPointCount(360);
        envelope.setOrigin(envelopeRadius, envelopeRadius);
        envelope.setPosition(float(cx), float(cy));
        envelope.setFillColor(sf::Color::Transparent);
        envelope.setOutlineColor(sf::Color::White);
        envelope.setOutlineThickness(4.f);
        rTex.draw(envelope);
    }

    // Optional gap at top
    {
        float gapArcLength = 90.f;
        float gapCenterDeg = -91.73f;
        float rad = gapCenterDeg * 3.14159265f / 180.f;
        float gapX = float(cx + envelopeRadius * std::cos(rad));
        float gapY = float(cy + envelopeRadius * std::sin(rad) + 10);

        sf::RectangleShape gapRect(sf::Vector2f(gapArcLength, -20.f));
        gapRect.setFillColor(sf::Color::Black);
        gapRect.setOrigin(gapArcLength / 2.f, 4.f / 2.f);
        gapRect.setPosition(gapX, gapY);
        gapRect.setRotation(gapCenterDeg + 90.f);
        rTex.draw(gapRect);
    }

    // Month labels
    {
        std::vector<std::string> months = {
            "January","February","March","April","May","June",
            "July","August","September","October","November","December"
        };
        int monthDays[12] = {31,28,31,30,31,30,31,31,30,31,30,31};
        int dayOffset = 0;
        float labelExtraOffset = 20.f;
        float arcOffset        = 100.f;
        int   monthFont        = 70;

        for (int m=0; m<12; m++){
            double angle = -M_PI / 2.0 + double(dayOffset)*(2.0*M_PI/(seg-2));
            dayOffset += monthDays[m];

            float baseRadius   = envelopeRadius + labelExtraOffset;
            float deltaAngle   = arcOffset / baseRadius;
            double shiftedAngle= angle + deltaAngle;

            float x = float(cx + std::cos(shiftedAngle)*baseRadius);
            float y = float(cy + std::sin(shiftedAngle)*baseRadius);

            sf::Text txt(months[m], font, monthFont);
            txt.setFillColor(sf::Color::White);

            sf::FloatRect lb = txt.getLocalBounds();
            txt.setOrigin(lb.width/2.f, lb.height+lb.top);

            float angleDeg = float(shiftedAngle*180.f/3.1415926535f);
            txt.setRotation(angleDeg+90.f);
            txt.setPosition(x,y);

            rTex.draw(txt);
        }
    }

    // Info near the top
    {
        sf::Text hourInfo("Outer ring = 23:00, Inner ring = 00:00", font, 40);
        hourInfo.setFillColor(sf::Color::White);
        float textX = float(cx);
        float textY = float(cy - (R+200));
        sf::FloatRect iB = hourInfo.getLocalBounds();
        hourInfo.setOrigin(iB.width/2.f, iB.height/2.f);
        hourInfo.setPosition(textX, textY);
        rTex.draw(hourInfo);
    }

    // Center titles
    {
        sf::Text mainTitle("My Year in Data", font, 300);
        mainTitle.setFillColor(sf::Color::White);
        auto mb = mainTitle.getLocalBounds();
        mainTitle.setOrigin(mb.width/2.f, mb.height/2.f);
        mainTitle.setPosition(float(cx), float(cy)-200.f);
        rTex.draw(mainTitle);

        sf::Text dateTitle("1 Jan ~ 31 Dec", font, 190);
        dateTitle.setFillColor(sf::Color::White);
        auto dbb = dateTitle.getLocalBounds();
        dateTitle.setOrigin(dbb.width/2.f, dbb.height/2.f);
        dateTitle.setPosition(float(cx), float(cy)+100.f);
        rTex.draw(dateTitle);

        sf::Text yearTitle(yearStr, font, 150);
        yearTitle.setFillColor(sf::Color::White);
        auto yb = yearTitle.getLocalBounds();
        yearTitle.setOrigin(yb.width/2.f, yb.height/2.f);
        yearTitle.setPosition(float(cx), float(cy)+350.f);
        rTex.draw(yearTitle);
    }

    // 3) Read the legend from legendPath
    std::ifstream lf(legendPath);
    std::vector<std::pair<sf::Color, std::string>> legendItems;
    if (lf.is_open()) {
        std::string line;
        while(std::getline(lf, line)) {
            // Format: "#RRGGBB\tActivity Name"
            auto tabPos = line.find('\t');
            if (tabPos != std::string::npos) {
                std::string hexColor = line.substr(0, tabPos);
                std::string actName  = line.substr(tabPos+1);
                sf::Color col = parseHexColor(hexColor);
                legendItems.push_back({col, actName});
            }
        }
        lf.close();
    } else {
        std::cerr << "Warning: Could not open legend file " << legendPath << "\n";
    }

    // 4) Draw the legend near bottom-left
    float startX  = 80.f;
    float startY  = 3500.f;
    float boxSize = 85.f;
    float spacing = 120.f;
    unsigned int legendFontSize = 85;

    for (int i = 0; i < (int)legendItems.size(); i++) {
        float rowY = startY + i*spacing;
        sf::RectangleShape box(sf::Vector2f(boxSize, boxSize));
        box.setFillColor(legendItems[i].first);
        box.setPosition(startX, rowY);
        rTex.draw(box);

        sf::Text lbl(legendItems[i].second, font, legendFontSize);
        lbl.setFillColor(sf::Color::White);
        lbl.setPosition(startX + boxSize + 20.f, rowY - 5.f);
        rTex.draw(lbl);
    }

    // 5) Draw "@username" near bottom-right
    {
        std::string handle = "@"+userName;
        sf::Text userTag(handle, font, 120);
        userTag.setFillColor(sf::Color(80,80,80));
        auto tagB = userTag.getLocalBounds();

        float margin = 80.f;
        userTag.setPosition(
            WD - tagB.width - margin,
            HT - tagB.height - margin
        );
        rTex.draw(userTag);
    }

    // Finalize and save
    rTex.display();
    sf::Image finalImg = rTex.getTexture().copyToImage();
    if(!finalImg.saveToFile(outPath)){
        std::cerr << "Failed to save " << outPath << "\n";
        return 1;
    }
    std::cout << "Saved image to " << outPath << std::endl;
    return 0;
}
