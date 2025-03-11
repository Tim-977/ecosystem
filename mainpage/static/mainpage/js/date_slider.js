// file: mainpage/js/date_slider.js

document.addEventListener('DOMContentLoaded', function () {
    const dateElement = document.getElementById('currentDate');
    if (!dateElement) return; // safety
  
    // Pull the date from data attributes
    const dataYear = parseInt(dateElement.dataset.year, 10);
    const dataMonth = parseInt(dateElement.dataset.month, 10);
    const dataDay = parseInt(dateElement.dataset.day, 10);
  
    const dateSlider = document.getElementById('dateSlider');
    const sliderDayLabel = document.getElementById('sliderDayLabel');
    if (!dateSlider) return; // safety
  
    // Compute days in that month. (In JS, "month" is 0-based for Date, so pass dataMonth as 1-based.)
    // E.g. new Date(2025, 3, 0) gives us the last day of the *previous* month if "3" is March in 0-based. 
    // Actually, for "March" in dataMonth=3, we do new Date(2025, 3, 0).
    // This yields 28 or 29 or 30 or 31 depending on the month.
    const daysInMonth = new Date(dataYear, dataMonth, 0).getDate();
  
    // Now get the local date to avoid future date selection:
    const now = new Date();
    const localYear = now.getFullYear();
    const localMonth = now.getMonth() + 1; // 0-based => +1 for human
    const localDay = now.getDate();
  
    // figure out the maximum allowed day in the slider
    let maxDay = daysInMonth;
    // If same year AND same month, cap at today's local day
    if (localYear === dataYear && localMonth === dataMonth) {
      maxDay = Math.min(maxDay, localDay);
    }
  
    // Initialize the slider
    dateSlider.min = '1';
    dateSlider.max = String(maxDay);
    dateSlider.value = String(dataDay);
    sliderDayLabel.innerText = dataDay; // show the current day label
  
    // As the user slides, update the label
    dateSlider.addEventListener('input', function () {
      sliderDayLabel.innerText = dateSlider.value;
    });
  
    // When the user finishes sliding (or changes), redirect to that day
    dateSlider.addEventListener('change', function () {
      const newDay = dateSlider.value;
      // zero-pad if needed
      const dayStr = newDay.padStart(2, '0');
      const monthStr = String(dataMonth).padStart(2, '0');
  
      // Build the day_view URL:
      // e.g. /day/2025/03/10/
      const newUrl = `/day/${dataYear}/${monthStr}/${dayStr}/`;
      window.location.href = newUrl;
    });
  });
  