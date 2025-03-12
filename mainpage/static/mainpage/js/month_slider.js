// File: mainpage/static/mainpage/js/month_slider.js
document.addEventListener("DOMContentLoaded", function() {
    // 1) Color each .day-row’s .mood-bar and .productivity-bar  
    colorDayRows();
  
    // 2) Hook up the month slider (if your backend supports switching months)
    let slider = document.getElementById("monthSlider");
    if (slider) {
      slider.addEventListener("change", function() {
        let newMonth = this.value; // e.g. "3"
        // If you want to reload or go to a new URL, do so here:
        // e.g. window.location.href = `/monthly-stats?year=2025&month=${newMonth}`;
        // or if you had a path like /monthly/2025/3:
        // window.location.href = `/monthly/2025/${newMonth}/`;
        alert("Slider changed to month = " + newMonth);
      });
    }
  });
  
  
  function colorDayRows() {
    // For each .day-row, read data-mood and data-prod, then color them
    let rows = document.querySelectorAll(".day-row");
    rows.forEach(row => {
      let moodVal = parseFloat(row.dataset.mood) || 0;        // 0..10
      let prodVal = parseFloat(row.dataset.prod) || 0;        // 0..10
      let moodBar = row.querySelector(".mood-bar");
      let prodBar = row.querySelector(".productivity-bar");
  
      // Color them
      if (moodBar) {
        moodBar.style.backgroundColor = interpolateGradient(
          moodVal,
          0, "#FF0000", // red at 0
          5, "#FFFF00", // yellow at 5
          10, "#00FF00" // green at 10
        );
      }
      if (prodBar) {
        prodBar.style.backgroundColor = interpolateGradient(
          prodVal,
          0, "#0000FF", // blue at 0
          5, "#FFFFFF", // white at 5
          10, "#FFC0CB" // pink at 10
        );
      }
    });
  }
  
  
  /**
   * Interpolate a 3-stop gradient:
   *   minVal => colorA
   *   midVal => colorB
   *   maxVal => colorC
   * numericValue in [minVal..maxVal].
   * For simplicity, we do a piecewise interpolation:
   *   If value <= midVal, we go from colorA->colorB,
   *   Else from colorB->colorC.
   */
  function interpolateGradient(value, minVal, colorA, midVal, colorB, maxVal, colorC) {
    if (value <= midVal) {
      // Range is minVal..midVal (A->B)
      let ratio = (value - minVal) / (midVal - minVal);
      return interpolateColor(colorA, colorB, ratio);
    } else {
      // Range is midVal..maxVal (B->C)
      let ratio = (value - midVal) / (maxVal - midVal);
      return interpolateColor(colorB, colorC, ratio);
    }
  }
  
  
  /**
   * Given two hex colors (#RRGGBB) and a ratio [0..1],
   * returns a linearly interpolated color in #RRGGBB form.
   */
  function interpolateColor(hex1, hex2, ratio) {
    let c1 = parseInt(hex1.substring(1), 16);
    let c2 = parseInt(hex2.substring(1), 16);
  
    let r1 = (c1 >> 16) & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = c1 & 0xFF;
    let r2 = (c2 >> 16) & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = c2 & 0xFF;
  
    let r = Math.round(r1 + (r2 - r1)*ratio);
    let g = Math.round(g1 + (g2 - g1)*ratio);
    let b = Math.round(b1 + (b2 - b1)*ratio);
  
    let hex = (r << 16) | (g << 8) | b;
    return "#" + hex.toString(16).padStart(6, "0");
  }
  