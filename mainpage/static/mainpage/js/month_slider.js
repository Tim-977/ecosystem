document.addEventListener("DOMContentLoaded", function() {
    const slider = document.getElementById("monthSlider");
    if (!slider) return;
  
    // When user drags the slider, change the month
    slider.addEventListener("input", function(e) {
      let newMonth = parseInt(e.target.value, 10);
  
      // We'll keep currentYear as a global var from the template
      // Redirect to the new month (still in the same year)
      // e.g. /month/2025/3/
      window.location.href = `/month/${currentYear}/${newMonth}/`;
    });
  });
  