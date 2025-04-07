document.addEventListener("DOMContentLoaded", function () {
  const form = document.querySelector("#general-settings-form"); // ONLY general settings

  if (form) {
    const inputs = form.querySelectorAll("input, select, textarea");
    const saveBtn = form.querySelector("button[type='submit']");
    const cancelBtn = form.querySelector("button[type='button']");

    // Disable buttons initially
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    // Save initial state
    const initialValues = {};
    inputs.forEach((input) => {
      initialValues[input.name] = input.value;
    });

    form.addEventListener("input", () => {
      let hasChanged = false;

      inputs.forEach((input) => {
        const initial = initialValues[input.name] || "";
        const current = input.value || "";
        if (initial !== current) {
          hasChanged = true;
        }
      });

      if (saveBtn) saveBtn.disabled = !hasChanged;
      if (cancelBtn) cancelBtn.disabled = !hasChanged;
    });
  }
});


document.addEventListener('DOMContentLoaded', function() {
  const clearLogsButton = document.getElementById('clearLogsButton');
  if (clearLogsButton) {
    clearLogsButton.addEventListener('click', function(event) {
      const confirmed = confirm('Are you sure you want to clear all logs?');
      if (!confirmed) {
        event.preventDefault(); // Stop form submission
      }
    });
  }
});
