/**
 * This script:
 *  - Renders 24 squares for hours 0..23
 *  - On click, shows a simple prompt or dropdown for picking an activity
 *  - Updates a hidden input (#hourly_activity_logging) in JSON form
 */

(function(){
    const hourlyBar = document.getElementById("hourly-activity-bar");
    const hiddenInput = document.getElementById("hourly_activity_logging");
  
    // Parse existing JSON from hidden input or use an empty array
    let hourlyData;
    try {
      hourlyData = JSON.parse(hiddenInput.value);
    } catch (e) {
      hourlyData = [];
    }
  
    // Convert to a dictionary keyed by hour for easy lookups
    const dataByHour = {};
    hourlyData.forEach(obj => {
      dataByHour[obj.hour] = obj.activity;
    });
  
    // We'll fetch the list of user activities from server or embed them if you prefer
    // For brevity, let's just create a dummy array; in practice, fetch from an API or embed in template
    let userActivities = [
      {id: 1, name: "Studying", color: "red"},
      {id: 2, name: "Sleeping", color: "blue"},
      {id: 3, name: "Friends", color: "yellow"},
      // etc.
    ];
  
    // Render squares
    for (let hour = 0; hour < 24; hour++) {
      const square = document.createElement("div");
      square.classList.add("hour-square");
      square.dataset.hour = hour;
  
      const activityId = dataByHour[hour];
      if (activityId) {
        // find activity color
        const act = userActivities.find(a => a.id === activityId);
        if (act) {
          square.style.backgroundColor = act.color;
        }
      }
      square.textContent = hour;  // optional label
  
      square.addEventListener("click", function(){
        // Example: simple prompt or a dropdown. Real scenario: fancy popover or modal.
        const chosenIdStr = prompt("Enter Activity ID (1=Studying, 2=Sleeping, 3=Friends, etc.)", activityId || "");
        if (!chosenIdStr) return; // user canceled
        const chosenId = parseInt(chosenIdStr);
  
        // Validate
        const chosenAct = userActivities.find(a => a.id === chosenId);
        if (!chosenAct) {
          alert("Invalid activity ID");
          return;
        }
  
        // Update
        dataByHour[hour] = chosenId;
        square.style.backgroundColor = chosenAct.color;
  
        // Rebuild JSON array and update hidden input
        const newHourlyData = [];
        for (let h = 0; h < 24; h++){
          if (dataByHour[h]) {
            newHourlyData.push({ hour: h, activity: dataByHour[h] });
          } else {
            newHourlyData.push({ hour: h, activity: null });
          }
        }
        hiddenInput.value = JSON.stringify(newHourlyData);
      });
  
      hourlyBar.appendChild(square);
    }
  
  })();
  