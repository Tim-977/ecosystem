let userActivities = [];
let dataByHour = {};

document.addEventListener('DOMContentLoaded', () => {
  const hourlyBar = document.getElementById('hourly-activity-bar');
  const hiddenInput = document.getElementById('hourly_activity_logging');
  const dropdown = document.getElementById('activity-dropdown');
  const activitySelect = document.getElementById('activity-select');
  const dayForm = document.getElementById('dayForm');

  /*
   *  1) FETCH THE USER'S ACTIVITIES
   */
  fetch('/api/activities/')
    .then(res => res.json())
    .then(data => {
      userActivities = data;
      console.log("Fetched activities:", userActivities);

      // Now that activities are loaded, apply colors
      applyColorsToSquares();
    })
    .catch(err => console.error("Error fetching activities:", err));

  /*
   *  2) PARSE EXISTING JSON FROM THE HIDDEN INPUT
   */
  let hourlyData = [];
  try {
    hourlyData = JSON.parse(hiddenInput.value);
  } catch (e) {
    console.warn("Invalid JSON in hidden input. Using empty array.");
    hourlyData = [];
  }

  // Convert list to object by hour
  hourlyData.forEach(obj => {
    dataByHour[obj.hour] = obj.activity;
  });

  /*
   *  3) FUNCTION TO APPLY COLORS TO SQUARES BASED ON STORED DATA
   */
  function applyColorsToSquares() {
    const squares = hourlyBar.querySelectorAll('.hour-square');

    squares.forEach(sq => {
      const hour = parseInt(sq.dataset.hour, 10);
      const activityId = dataByHour[hour];

      if (activityId !== null && activityId !== undefined) {
        const act = findActivityById(activityId);
        if (act) {
          sq.style.backgroundColor = act.color;
        } else {
          sq.style.backgroundColor = "#ddd"; // Default gray
        }
      } else {
        sq.style.backgroundColor = "#ddd"; // Default gray
      }

      // Attach click event to show dropdown
      sq.addEventListener('click', (evt) => {
        showDropdown(evt, hour, sq);
      });
    });
  }

  /*
   *  4) SHOW THE DROPDOWN & POPULATE IT
   */
  function showDropdown(evt, hour, squareElem) {
    activitySelect.innerHTML = '';

    const noActivityOption = document.createElement('option');
    noActivityOption.value = 'none';
    noActivityOption.textContent = 'No Activity';
    activitySelect.appendChild(noActivityOption);

    userActivities.forEach(act => {
      let opt = document.createElement('option');
      opt.value = act.id;
      opt.textContent = act.name;
      activitySelect.appendChild(opt);
    });

    const existingId = dataByHour[hour];
    activitySelect.value = (existingId !== null && existingId !== undefined) 
      ? existingId 
      : 'none';

    dropdown.style.left = evt.pageX + 'px';
    dropdown.style.top = evt.pageY + 'px';
    dropdown.style.display = 'block';

    activitySelect.onchange = (e) => {
      const selectedVal = e.target.value;
      const chosenId = parseInt(selectedVal, 10);

      if (isNaN(chosenId)) {
        dataByHour[hour] = null;
        squareElem.style.backgroundColor = "#ddd";
      } else {
        const chosenAct = findActivityById(chosenId);
        if (!chosenAct) return;
        dataByHour[hour] = chosenId;
        squareElem.style.backgroundColor = chosenAct.color;
      }

      dropdown.style.display = 'none';
      updateHourlyLog();
    };
  }

  /*
   *  5) HELPER: FIND ACTIVITY BY ID
   */
  function findActivityById(id) {
    return userActivities.find(a => a.id === id);
  }

  /*
   *  6) HELPER: REBUILD THE JSON & UPDATE THE HIDDEN INPUT
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
   *  7) HIDE DROPDOWN IF CLICKING OUTSIDE
   */
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !hourlyBar.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  /*
   *  8) ENSURE LATEST DATA IS SAVED BEFORE FORM SUBMIT
   */
  if (dayForm) {
    dayForm.addEventListener("submit", () => {
      updateHourlyLog();
    });
  }
});
