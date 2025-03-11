document.addEventListener('DOMContentLoaded', function () {
  const dateElement = document.getElementById('currentDate');
  if (!dateElement) return; // safety check

  // Extract the current date from data attributes
  const dataYear = parseInt(dateElement.dataset.year, 10);
  const dataMonth = parseInt(dateElement.dataset.month, 10);
  const dataDay = parseInt(dateElement.dataset.day, 10);

  const dateSlider = document.getElementById('dateSlider');
  const sliderDayLabel = document.getElementById('sliderDayLabel');
  const dayTickmarks = document.getElementById('dayTickmarks');
  if (!dateSlider || !sliderDayLabel || !dayTickmarks) return;

  // 1) Figure out how many days in that month
  //    (In JS, months are 0-based for the Date constructor.)
  //    So if dataMonth=3 => that is March (0-based means 2).
  //    But an easy trick is new Date(year, month, 0) gives the last day of the *previous* month.
  //    So we do new Date(dataYear, dataMonth, 0) to get #days in dataMonth.
  const daysInMonth = new Date(dataYear, dataMonth, 0).getDate();

  // 2) We also figure out local time to cap future selection
  const now = new Date();
  const localYear = now.getFullYear();
  const localMonth = now.getMonth() + 1; // +1 because JS months are 0-based
  const localDay = now.getDate();

  // 3) Populate the <datalist> with day ticks from 1..daysInMonth
  //    This will display divisions under the slider.
  dayTickmarks.innerHTML = ''; // clear it
  for (let d = 1; d <= daysInMonth; d++) {
    const option = document.createElement('option');
    option.value = d;  // <option value="1"> etc.
    option.label = d;  // optional: shows a label if there's room
    dayTickmarks.appendChild(option);
  }

  // 4) Slider min and max (the full month)
  dateSlider.min = '1';
  dateSlider.max = String(daysInMonth);
  // Start at the current day
  dateSlider.value = String(dataDay);
  // Show that day in the label
  sliderDayLabel.innerText = dataDay;

  // 5) As the user drags (input event), update label (and clamp if future)
  dateSlider.addEventListener('input', function () {
    let sliderValue = parseInt(dateSlider.value, 10);

    // If it's the same year/month as local time, clamp to localDay
    if (localYear === dataYear && localMonth === dataMonth) {
      if (sliderValue > localDay) {
        // revert to localDay
        sliderValue = localDay;
        dateSlider.value = String(sliderValue);
      }
    }

    // Update the label
    sliderDayLabel.innerText = sliderValue;
  });

  // 6) On "change" (user finished sliding), redirect
  dateSlider.addEventListener('change', function () {
    // The final "safe" slider value
    const chosenValue = parseInt(dateSlider.value, 10);

    // zero-pad day if needed
    const dayStr = chosenValue.toString().padStart(2, '0');
    const monthStr = dataMonth.toString().padStart(2, '0');

    // Build the new URL => /day/YYYY/MM/DD/
    const newUrl = `/day/${dataYear}/${monthStr}/${dayStr}/`;
    window.location.href = newUrl;
  });
});
