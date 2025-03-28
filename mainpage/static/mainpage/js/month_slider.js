document.addEventListener("DOMContentLoaded", function () {
  const monthElement = document.getElementById("currentMonth");
  if (!monthElement) return;

  const dataYear = parseInt(monthElement.dataset.year, 10);
  const dataMonth = parseInt(monthElement.dataset.month, 10);

  const monthSlider = document.getElementById("monthSlider");
  const sliderMonthLabel = document.getElementById("sliderMonthLabel");
  const monthTickmarks = document.getElementById("monthTickmarks");
  const currentView = monthSlider?.dataset.view || "month_view";

  if (!monthSlider || !sliderMonthLabel || !monthTickmarks) return;

  // Get local time for clamping
  const now = new Date();
  const localYear = now.getFullYear();
  const localMonth = now.getMonth() + 1;

  // Function to get full month name
  function getMonthName(month) {
    return new Date(dataYear, month - 1).toLocaleString("default", { month: "long" });
  }

  // Update header text dynamically to show "YYYY Month"
  function updateHeader(year, month) {
    monthElement.innerText = `${year} ${getMonthName(month)}`;
  }

  // Initialize header and slider label
  updateHeader(dataYear, dataMonth);
  sliderMonthLabel.innerText = `Current: ${getMonthName(dataMonth)}`;

  // Update label dynamically when slider moves
  monthSlider.addEventListener("input", function () {
    let sliderValue = parseInt(monthSlider.value, 10);

    // Clamp future months if in current year
    if (localYear === dataYear && sliderValue > localMonth) {
      sliderValue = localMonth;
      monthSlider.value = String(sliderValue);
    }

    sliderMonthLabel.innerText = `Current: ${getMonthName(sliderValue)}`;
    updateHeader(dataYear, sliderValue);
  });

  // Redirect on change
  monthSlider.addEventListener("change", function () {
    const chosenMonth = parseInt(monthSlider.value, 10);
    const monthStr = chosenMonth.toString().padStart(2, "0");

    let redirectUrl = "/";
    if (currentView === "diary_view") {
      redirectUrl = `/diary/${dataYear}/${monthStr}/`;
    } else {
      redirectUrl = `/month/${dataYear}/${monthStr}/`;
    }

    window.location.href = redirectUrl;
  });
});
