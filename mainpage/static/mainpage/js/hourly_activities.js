// mainpage/static/mainpage/js/hourly_activities.js

let userActivities = [];
let dataByHour = {};

document.addEventListener('DOMContentLoaded', () => {
  const hourlyBar = document.getElementById('hourly-activity-bar');
  const hiddenInput = document.getElementById('hourly_activity_logging');
  const dropdown = document.getElementById('activity-dropdown');
  const activitySelect = document.getElementById('activity-select');
  const dayForm = document.getElementById('dayForm');  // The main form

  /* 
   *    FETCH THE USER'S ACTIVITIES 
   */
  fetch('/api/activities/')
    .then(res => res.json())
    .then(data => {
      userActivities = data; // e.g. [ {id:1, name:"Sleep", color:"#00f"}, ... ]
      console.log("Fetched activities:", userActivities);
    })
    .catch(err => console.error("Error fetching activities:", err));

  /*
   *   PARSE EXISTING JSON FROM THE HIDDEN INPUT
   */
  let hourlyData = [];
  try {
    hourlyData = JSON.parse(hiddenInput.value);
  } catch (e) {
    console.warn("Invalid JSON in hidden input. Using empty array.");
    hourlyData = [];
  }
  // Convert to an object keyed by hour, e.g. {0: 2, 1: 3, ...}
  hourlyData.forEach(obj => {
    dataByHour[obj.hour] = obj.activity;
  });

  /*
   *   RENDER EACH HOUR-SQUARE WITH THE CORRECT COLOR
   */
  const squares = hourlyBar.querySelectorAll('.hour-square');
  squares.forEach(sq => {
    const hour = parseInt(sq.dataset.hour, 10);
    const activityId = dataByHour[hour];

    // If there's a known activity ID, color it
    if (activityId !== null && activityId !== undefined) {
      const act = findActivityById(activityId);
      if (act) {
        sq.style.backgroundColor = act.color;
      } else {
        sq.style.backgroundColor = "#ddd";
      }
    } else {
      // No activity => gray
      sq.style.backgroundColor = "#ddd";
    }

    // On click -> show the dropdown near this square
    sq.addEventListener('click', (evt) => {
      showDropdown(evt, hour, sq);
    });
  });

  /*
   *   SHOW THE DROPDOWN & POPULATE IT
   */
  function showDropdown(evt, hour, squareElem) {
    // Clear out any old <option> children
    activitySelect.innerHTML = '';

    // FIRST: Add a "No Activity" option
    const noActivityOption = document.createElement('option');
    noActivityOption.value = 'none';
    noActivityOption.textContent = 'No Activity';
    activitySelect.appendChild(noActivityOption);

    // NEXT: Add an option for each user activity
    userActivities.forEach(act => {
      let opt = document.createElement('option');
      opt.value = act.id;            // store the activity ID
      opt.textContent = act.name;    // display the name
      activitySelect.appendChild(opt);
    });

    // If there's already an activity for this hour, select it, else "No Activity"
    const existingId = dataByHour[hour];
    activitySelect.value = (existingId !== null && existingId !== undefined) 
      ? existingId 
      : 'none';

    // Position the dropdown near the click
    dropdown.style.left = evt.pageX + 'px';
    dropdown.style.top = evt.pageY + 'px';
    dropdown.style.display = 'block';

    // On selection change -> update data
    activitySelect.onchange = (e) => {
      const selectedVal = e.target.value;
      const chosenId = parseInt(selectedVal, 10);

      if (isNaN(chosenId)) {
        // means user picked "No Activity"
        dataByHour[hour] = null;
        squareElem.style.backgroundColor = "#ddd";
      } else {
        const chosenAct = findActivityById(chosenId);
        if (!chosenAct) return;
        dataByHour[hour] = chosenId;
        squareElem.style.backgroundColor = chosenAct.color;
      }

      // Hide dropdown
      dropdown.style.display = 'none';

      // Rebuild JSON & update hidden input right away
      updateHourlyLog();
    };
  }

  /*
   *   HELPER: FIND ACTIVITY BY ID
   */
  function findActivityById(id) {
    return userActivities.find(a => a.id === id);
  }

  /*
   *   HELPER: REBUILD THE JSON & UPDATE THE HIDDEN INPUT
   */
  function updateHourlyLog() {
    const newHourlyData = [];
    for (let h = 0; h < 24; h++) {
      newHourlyData.push({
        hour: h,
        activity: dataByHour[h] || null
      });
    }
    hiddenInput.value = JSON.stringify(newHourlyData);
  }

  /*
   *   HIDE DROPDOWN IF CLICKING OUTSIDE
   */
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !hourlyBar.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  /*
   *   ENSURE LATEST DATA IS SAVED BEFORE FORM SUBMIT
   */
  if (dayForm) {
    dayForm.addEventListener("submit", () => {
      updateHourlyLog();
    });
  }
});
