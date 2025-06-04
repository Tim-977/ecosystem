#include <iostream>
#include <iomanip>
#include <cmath>

struct RGB {
    int r, g, b;
};

RGB HSVtoRGB(double H, double S, double V) {
    double C = V * S;
    double X = C * (1 - std::fabs(std::fmod(H / 60.0, 2) - 1));
    double m = V - C;
    double r, g, b;
    
    if (H < 60) {
        r = C, g = X, b = 0;
    } else if (H < 120) {
        r = X, g = C, b = 0;
    } else if (H < 180) {
        r = 0, g = C, b = X;
    } else if (H < 240) {
        r = 0, g = X, b = C;
    } else if (H < 300) {
        r = X, g = 0, b = C;
    } else {
        r = C, g = 0, b = X;
    }
    
    return RGB {
        static_cast<int>(std::round((r + m) * 255)),
        static_cast<int>(std::round((g + m) * 255)),
        static_cast<int>(std::round((b + m) * 255))
    };
}

int main() {
    const int numCols = 31;
    const int numRows = 24;
    const int numSteps = numCols * numRows;

    const double startHue = 0.0;
    const double endHue = 300.0;
    const double hueStep = (endHue - startHue) / (numSteps - 1);

    for (int i = 0; i < numSteps; i++) {
        double hue = startHue + i * hueStep;
        RGB color = HSVtoRGB(hue, 1.0, 1.0);
        
        std::cout << '#' 
                  << std::uppercase << std::setfill('0') << std::setw(2) << std::hex << color.r
                  << std::uppercase << std::setfill('0') << std::setw(2) << std::hex << color.g
                  << std::uppercase << std::setfill('0') << std::setw(2) << std::hex << color.b;
        
        if ((i + 1) % 24 == 0)
            std::cout << std::endl;
        else
            std::cout << " ";
    }
    
    return 0;
}

