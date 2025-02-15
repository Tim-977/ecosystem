function updateLocalTimeAndDate() {
    const now = new Date();

    // Format date as YYYY-MM-DD
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(now.getDate()).padStart(2, '0');

    // Format date for display (e.g., "February 14, 2025")
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = now.toLocaleDateString('en-US', options);

    // Format time (HH:MM:SS)
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;

    // Update displayed date and time
    document.getElementById('current-date').textContent = `Date: ${formattedDate}`;
    document.getElementById('local-time').textContent = `Local Time: ${timeString}`;

    // Update "Add / Log Today" link with correct local date
    const todayUrl = `/day/${year}/${month}/${day}/`;
    document.getElementById('log-today-link').setAttribute('href', todayUrl);
}

// Run update function every second
setInterval(updateLocalTimeAndDate, 1000);
updateLocalTimeAndDate();
