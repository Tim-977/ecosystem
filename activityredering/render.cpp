#include <SFML/Graphics.hpp>
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <sstream>
#include <cmath>

sf::Color parseColor(const std::string &s) {
    std::string hex = s;
    if(hex.empty())
        return sf::Color::White;
    if(hex[0] == '#')
        hex = hex.substr(1);
    if(hex.length() == 6) {
        unsigned int colorInt = std::stoul(hex, nullptr, 16);
        sf::Uint8 r = (colorInt >> 16) & 0xFF;
        sf::Uint8 g = (colorInt >> 8)  & 0xFF;
        sf::Uint8 b = colorInt & 0xFF;
        return sf::Color(r, g, b, 255);
    } else if(hex.length() == 8) {
        unsigned int colorInt = std::stoul(hex, nullptr, 16);
        sf::Uint8 r = (colorInt >> 24) & 0xFF;
        sf::Uint8 g = (colorInt >> 16) & 0xFF;
        sf::Uint8 b = (colorInt >> 8)  & 0xFF;
        sf::Uint8 a = colorInt & 0xFF;
        return sf::Color(r, g, b, a);
    } else {
        std::cerr << "Invalid color format: " << s << std::endl;
        return sf::Color::White;
    }
}

sf::ConvexShape createRoundedRectangle(sf::Vector2f size, float radius, int cornerPointCount = 8) {
    sf::ConvexShape shape;
    int totalPoints = cornerPointCount * 4;
    shape.setPointCount(totalPoints);
    const float pi = 3.14159265f;
    int pointIndex = 0;

    for (int i = 0; i < cornerPointCount; i++) {
        float angle = 180.f + (90.f * i / (cornerPointCount - 1));
        float rad = angle * pi / 180.f;
        float x = radius + std::cos(rad) * radius;
        float y = radius + std::sin(rad) * radius;
        shape.setPoint(pointIndex++, sf::Vector2f(x, y));
    }
    for (int i = 0; i < cornerPointCount; i++) {
        float angle = 270.f + (90.f * i / (cornerPointCount - 1));
        float rad = angle * pi / 180.f;
        float x = (size.x - radius) + std::cos(rad) * radius;
        float y = radius + std::sin(rad) * radius;
        shape.setPoint(pointIndex++, sf::Vector2f(x, y));
    }
    for (int i = 0; i < cornerPointCount; i++) {
        float angle = 0.f + (90.f * i / (cornerPointCount - 1));
        float rad = angle * pi / 180.f;
        float x = (size.x - radius) + std::cos(rad) * radius;
        float y = (size.y - radius) + std::sin(rad) * radius;
        shape.setPoint(pointIndex++, sf::Vector2f(x, y));
    }
    for (int i = 0; i < cornerPointCount; i++) {
        float angle = 90.f + (90.f * i / (cornerPointCount - 1));
        float rad = angle * pi / 180.f;
        float x = radius + std::cos(rad) * radius;
        float y = (size.y - radius) + std::sin(rad) * radius;
        shape.setPoint(pointIndex++, sf::Vector2f(x, y));
    }

    return shape;
}


int main(int argc, char* argv[])
{
    std::string userIdStr = "unknown_user";
    if (argc > 1) {
        userIdStr = argv[1];
    }

    const int numDays = 31;
    const int numHours = 24;
    const float cellWidth = 40.f;
    const float cellHeight = 40.f;
    const float gap = 5.f;
    const float cornerRadius = 5.f;
    const int leftMargin = 60;
    const int topMargin = 60;
    const int rightMargin = 20;
    const int bottomMargin = 20;

    float gridWidth = numDays * cellWidth + (numDays - 1) * gap;
    float gridHeight = numHours * cellHeight + (numHours - 1) * gap;
    int totalWidth = leftMargin + gridWidth + rightMargin;
    int totalHeight = topMargin + gridHeight + bottomMargin;

    std::vector<sf::Color> activityColors;
    {
        std::ifstream infile("/home/yhat/ecosystem/activityredering/input.txt");
        std::string token;
        while (infile >> token) {
            activityColors.push_back(parseColor(token));
        }
    }

    sf::RenderTexture renderTexture;
    if (!renderTexture.create(totalWidth, totalHeight)) {
        std::cerr << "Failed to create render texture." << std::endl;
        return -1;
    }
    renderTexture.clear(sf::Color::White);

    sf::Font font;
    if (!font.loadFromFile("/home/yhat/ecosystem/activityredering/fonts/ArialCE.ttf")) {
        std::cerr << "Failed to load font" << std::endl;
        return -1;
    }

    for (int day = 0; day < numDays; day++) {
        for (int hour = 0; hour < numHours; hour++) {
            int index = day * numHours + hour;
            sf::Vector2f pos(leftMargin + day * (cellWidth + gap),
                             topMargin + hour * (cellHeight + gap));

            sf::ConvexShape cellShape = createRoundedRectangle(
                sf::Vector2f(cellWidth, cellHeight), cornerRadius, 8
            );
            cellShape.setPosition(pos);

            if (index < (int)activityColors.size()) {
                cellShape.setFillColor(activityColors[index]);
                cellShape.setOutlineThickness(0.f);
            } else {
                cellShape.setFillColor(sf::Color::White);
                cellShape.setOutlineThickness(1.f);
                cellShape.setOutlineColor(sf::Color(230, 230, 230));
            }
            renderTexture.draw(cellShape);
        }
    }

    for (int day = 0; day < numDays; day++) {
        sf::Text dayText;
        dayText.setFont(font);
        dayText.setString(std::to_string(day + 1));
        dayText.setCharacterSize(16);
        dayText.setFillColor(sf::Color::Black);
        sf::FloatRect textRect = dayText.getLocalBounds();
        float x = leftMargin + day * (cellWidth + gap) + cellWidth / 2 - textRect.width / 2;
        float y = topMargin - 30;
        dayText.setPosition(x, y);
        renderTexture.draw(dayText);
    }

    for (int hour = 0; hour < numHours; hour++) {
        sf::Text hourText;
        hourText.setFont(font);
        char buf[6];
        std::snprintf(buf, sizeof(buf), "%02d:00", hour);
        hourText.setString(buf);
        hourText.setCharacterSize(16);
        hourText.setFillColor(sf::Color::Black);
        sf::FloatRect textRect = hourText.getLocalBounds();
        float x = leftMargin - textRect.width - 10;
        float y = topMargin + hour * (cellHeight + gap) 
                  + cellHeight / 2 - textRect.height / 2;
        hourText.setPosition(x, y);
        renderTexture.draw(hourText);
    }

    {
        sf::Text userText;
        userText.setFont(font);
        userText.setString("User ID: " + userIdStr);
        userText.setCharacterSize(20);
        userText.setFillColor(sf::Color::Blue);
        userText.setPosition(10.f, 10.f);
        renderTexture.draw(userText);
    }

    renderTexture.display();
    sf::Image finalImage = renderTexture.getTexture().copyToImage();

    std::string filename = "/home/yhat/ecosystem/mainpage/static/mainpage/images/activity_diagram_"
                           + userIdStr + ".png";

    if (!finalImage.saveToFile(filename)) {
        std::cerr << "Failed to save image to " << filename << std::endl;
        return -1;
    }

    std::cout << "Saved " << filename << std::endl;
    return 0;
}
