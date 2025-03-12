document.addEventListener("DOMContentLoaded", function () {
  const monthElement = document.getElementById("currentMonth");
  if (!monthElement) return;

  const dataYear = parseInt(monthElement.dataset.year, 10);
  const dataMonth = parseInt(monthElement.dataset.month, 10);

  const monthSlider = document.getElementById("monthSlider");
  const sliderMonthLabel = document.getElementById("sliderMonthLabel");
  const monthTickmarks = document.getElementById("monthTickmarks");
  if (!monthSlider || !sliderMonthLabel || !monthTickmarks) return;

  // Get local time for clamping
  const now = new Date();
  const localYear = now.getFullYear();
  const localMonth = now.getMonth() + 1;

  // Initialize label
  sliderMonthLabel.innerText = `Current: ${dataMonth.toString().padStart(2, "0")}`;

  // Update label dynamically
  monthSlider.addEventListener("input", function () {
    let sliderValue = parseInt(monthSlider.value, 10);

    // Clamp future months if in current year
    if (localYear === dataYear && sliderValue > localMonth) {
      sliderValue = localMonth;
      monthSlider.value = String(sliderValue);
    }

    sliderMonthLabel.innerText = `Current: ${sliderValue.toString().padStart(2, "0")}`;
  });

  // Redirect on change
  monthSlider.addEventListener("change", function () {
    const chosenMonth = parseInt(monthSlider.value, 10);
    const monthStr = chosenMonth.toString().padStart(2, "0");

    window.location.href = `/month/${dataYear}/${monthStr}/`;
  });
});
