function updateLocalDateAndTime() {
  const now = new Date();

  // Format the local date as YYYY/MM/DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  // For display: e.g. "February 14, 2025"
  const displayOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  const displayDate = now.toLocaleDateString('en-US', displayOptions);

  // Time: HH:MM:SS
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const displayTime = `${hours}:${minutes}:${seconds}`;

  // Update HTML
  document.getElementById('local-date').textContent = `Date: ${displayDate}`;
  document.getElementById('local-time').textContent = `Time: ${displayTime}`;

  // Generate the link to /day/YYYY/MM/DD/
  const url = `/day/${year}/${month}/${day}/`;
  document.getElementById('log-today-link').setAttribute('href', url);
}

// Update every second
setInterval(updateLocalDateAndTime, 1000);
updateLocalDateAndTime();
