// mainpage/static/mainpage/js/hourly_activities.js
let userActivities = [];
let dataByHour = {};

document.addEventListener('DOMContentLoaded', () => {
  const hourlyBar = document.getElementById('hourly-activity-bar');
  const hiddenInput = document.getElementById('hourly_activity_logging');
  const dropdown = document.getElementById('activity-dropdown');
  const activitySelect = document.getElementById('activity-select');

  // 1. Fetch user's activities from the server
  fetch('/api/activities/')
    .then(res => res.json())
    .then(data => {
      userActivities = data; // e.g. [ {id:1, name:"Studying", color:"#f00"}, ... ]
      console.log("Fetched activities:", userActivities);

      // Build a dictionary for color lookups: { activityId: color }
      // Not strictly required, but convenient
    })
    .catch(err => console.error("Error fetching activities:", err));

  // 2. Parse existing JSON from hidden input
  let hourlyData = [];
  try {
    hourlyData = JSON.parse(hiddenInput.value);
  } catch (e) {
    console.warn("Invalid JSON in hidden input. Using empty array.");
    hourlyData = [];
  }
  // Convert to an object keyed by hour
  hourlyData.forEach(obj => {
    dataByHour[obj.hour] = obj.activity;
  });

  // 3. For each square, set initial color & attach click event
  const squares = hourlyBar.querySelectorAll('.hour-square');
  squares.forEach(sq => {
    const hour = parseInt(sq.dataset.hour, 10);
    const activityId = dataByHour[hour];

    // If there's an existing activity for this hour, color it
    if (activityId) {
      const act = findActivityById(activityId);
      if (act) {
        sq.style.backgroundColor = act.color;
      }
    }

    sq.addEventListener('click', (evt) => {
      showDropdown(evt, hour, sq);
    });
  });

  // 4. showDropdown: Populate the <select>, position it, etc.
  function showDropdown(evt, hour, squareElem) {
    // Clear out any old <option> children
    activitySelect.innerHTML = '';

    // Create an option for each user activity
    userActivities.forEach(act => {
      let opt = document.createElement('option');
      opt.value = act.id;         // store the activity ID
      opt.textContent = act.name; // display the name
      activitySelect.appendChild(opt);
    });

    // If there's already an activity for this hour, select it
    const existingId = dataByHour[hour];
    if (existingId) {
      activitySelect.value = existingId;
    }

    // Position the dropdown near the clicked square
    // (A quick approach: position absolutely based on mouse coords)
    dropdown.style.left = evt.pageX + 'px';
    dropdown.style.top = evt.pageY + 'px';
    dropdown.style.display = 'block';

    // Listen for a change event on the select
    activitySelect.onchange = (e) => {
      const chosenId = parseInt(e.target.value, 10);
      const chosenAct = findActivityById(chosenId);
      if (!chosenAct) return;

      // Update data structure
      dataByHour[hour] = chosenId;
      // Change background color
      squareElem.style.backgroundColor = chosenAct.color;

      // Hide dropdown
      dropdown.style.display = 'none';

      // Rebuild JSON array & update hidden input
      const newHourlyData = [];
      for (let h = 0; h < 24; h++) {
        newHourlyData.push({
          hour: h,
          activity: dataByHour[h] || null
        });
      }
      hiddenInput.value = JSON.stringify(newHourlyData);
    };
  }

  // A helper function to find an activity by ID
  function findActivityById(id) {
    return userActivities.find(a => a.id === id);
  }

  // Hide dropdown if user clicks elsewhere
  document.addEventListener('click', (e) => {
    // If click is outside the dropdown or squares, hide it
    if (!dropdown.contains(e.target) && !hourlyBar.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
});
