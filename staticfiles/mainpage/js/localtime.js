function updateLocalDateAndTime() {
  const now = new Date();

  // Get the local date and time
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const localDate = `${year}-${month}-${day}`;

  // Format time as HH:MM:SS
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const localTime = `${hours}:${minutes}:${seconds}`;

  // Update local time display
  document.getElementById('local-date').textContent = `Local Date: ${localDate}`;
  document.getElementById('local-time').textContent = `Local Time: ${localTime}`;

  // Generate "Add / Log Today" link dynamically
  const logTodayLink = document.getElementById('log-today-link');
  if (logTodayLink) {
      logTodayLink.setAttribute('href', `/day/${year}/${month}/${day}/?local_date=${localDate}`);
  }
}

// Update time every second
setInterval(updateLocalDateAndTime, 1000);
updateLocalDateAndTime();
