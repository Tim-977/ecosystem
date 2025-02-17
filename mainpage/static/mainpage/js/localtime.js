document.addEventListener("DOMContentLoaded", function () {
  function updateLocalTime() {
      let now = new Date();
      let formattedTime = now.toLocaleString(undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
      });
      document.getElementById("local-time").textContent = formattedTime;
  }

  function updateLogTodayLink() {
      let now = new Date();
      let year = now.getFullYear();
      let month = String(now.getMonth() + 1).padStart(2, "0");
      let day = String(now.getDate()).padStart(2, "0");

      let todayLink = `/day/${year}/${month}/${day}/`;
      document.getElementById("log-today-link").href = todayLink;
  }

  function disableFutureLogs() {
      let today = new Date();
      today.setHours(0, 0, 0, 0);

      document.querySelectorAll(".log-link").forEach(link => {
          let logDate = new Date(link.textContent.trim());
          logDate.setHours(0, 0, 0, 0);

          if (logDate > today) {
              link.style.pointerEvents = "none";
              link.style.color = "gray";
              link.textContent += " (Future - Disabled)";
          }
      });
  }

  function preventFutureLogSubmissions() {
      let logForm = document.getElementById("log-form");
      if (!logForm) return;

      logForm.addEventListener("submit", function (event) {
          let now = new Date();
          let formDate = new Date(logForm.querySelector("input[name='date']").value);

          if (formDate > now) {
              event.preventDefault();
              alert("You cannot log future dates!");
          }
      });
  }

  // Run functions
  updateLocalTime();
  updateLogTodayLink();
  disableFutureLogs();
  preventFutureLogSubmissions();

  // Update local time every second
  setInterval(updateLocalTime, 1000);
});
