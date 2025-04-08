document.addEventListener("DOMContentLoaded", function () {
  function setupFormChangeDetection(form) {
    if (!form) return;

    const inputs = form.querySelectorAll("input, select, textarea");
    const saveBtn = form.querySelector("button[type='submit']");
    const cancelBtn = form.querySelector("button[type='button']");

    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

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

  setupFormChangeDetection(document.querySelector("#general-settings-form"));
  setupFormChangeDetection(document.querySelector("#personalization-form"));

  const clearLogsButton = document.getElementById("clearLogsButton");
  if (clearLogsButton) {
    clearLogsButton.addEventListener("click", function (event) {
      const confirmed = confirm("Are you sure you want to clear all logs?");
      if (!confirmed) {
        event.preventDefault();
      }
    });
  }
});
