document.addEventListener("DOMContentLoaded", function() {
    const pendingList = document.getElementById("pendingList");
    const doneList = document.getElementById("doneList");

    // Form elements
    const taskText = document.getElementById("taskText");
    const taskPriority = document.getElementById("taskPriority");
    const taskDueType = document.getElementById("taskDueType");
    const taskDueDate = document.getElementById("taskDueDate");
    const taskDueTime = document.getElementById("taskDueTime");
    const createTaskBtn = document.getElementById("createTaskBtn");

    // Enable/disable date/time based on selection
    taskDueType.addEventListener("change", function() {
        const val = taskDueType.value;
        if (val === "until") {
            taskDueDate.disabled = false;
            taskDueTime.disabled = true;
            taskDueTime.value = "";
        } else if (val === "exact") {
            taskDueDate.disabled = false;
            taskDueTime.disabled = false;
        } else {
            // none or today
            taskDueDate.disabled = true;
            taskDueTime.disabled = true;
            taskDueDate.value = "";
            taskDueTime.value = "";
        }
    });

    // 1. Fetch tasks from the server
    function loadTasks() {
        fetch("/api/todo/")
            .then(res => res.json())
            .then(data => {
                renderTasks(data);
            })
            .catch(err => console.error("Error loading tasks:", err));
    }

    // 2. Render tasks into <ul> lists
    function renderTasks(data) {
        const { pending, done } = data;
        pendingList.innerHTML = "";
        doneList.innerHTML = "";

        // For each pending task, create an <li>
        pending.forEach(task => {
            const li = createTaskItem(task);
            pendingList.appendChild(li);
        });
        // For each done task, create an <li>
        done.forEach(task => {
            const li = createTaskItem(task);
            doneList.appendChild(li);
        });
    }

    // 3. Create an <li> for a given task object
    function createTaskItem(task) {
        // Example: {id, text, status, due_type, due_date, due_time, priority}
        const li = document.createElement("li");

        // Display priority & due info
        let dueInfo = "";
        if (task.due_type === "exact") {
            dueInfo = `(Exact: ${task.due_date} ${task.due_time})`;
        } else if (task.due_type === "until") {
            dueInfo = `(Until: ${task.due_date})`;
        } else if (task.due_type === "today") {
            dueInfo = "(Today)";
        } else {
            dueInfo = "(No deadline)";
        }

        let priorityInfo = `[${task.priority.toUpperCase()}]`; 
        li.textContent = `${priorityInfo} ${task.text} ${dueInfo} `;

        // Mark done / undone
        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = (task.status === "pending") ? "Mark Done" : "Mark Pending";
        toggleBtn.addEventListener("click", () => {
            const newStatus = (task.status === "pending") ? "done" : "pending";
            updateTask(task.id, {status: newStatus});
        });
        li.appendChild(toggleBtn);

        // Delete
        const delBtn = document.createElement("button");
        delBtn.textContent = "Delete";
        delBtn.style.marginLeft = "10px";
        delBtn.addEventListener("click", () => {
            deleteTask(task.id);
        });
        li.appendChild(delBtn);

        return li;
    }

    // 4. Add a new task
    createTaskBtn.addEventListener("click", function() {
        const textVal = taskText.value.trim();
        if (!textVal) {
            alert("Please enter a task description");
            return;
        }

        // Gather form inputs
        const priorityVal = taskPriority.value;
        const dueTypeVal = taskDueType.value;
        let dueDateVal = null;
        let dueTimeVal = null;
        if (dueTypeVal === "until") {
            dueDateVal = taskDueDate.value;  // "YYYY-MM-DD"
        } else if (dueTypeVal === "exact") {
            dueDateVal = taskDueDate.value; 
            dueTimeVal = taskDueTime.value;  // "HH:MM"
        }

        // Build POST body
        const bodyData = {
            text: textVal,
            priority: priorityVal,
            due_type: dueTypeVal,
            due_date: dueDateVal,
            due_time: dueTimeVal
        };

        fetch("/api/todo/add/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCSRFToken()
            },
            body: JSON.stringify(bodyData)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Clear the form
                taskText.value = "";
                taskPriority.value = "medium";
                taskDueType.value = "none";
                taskDueDate.disabled = true;
                taskDueTime.disabled = true;
                taskDueDate.value = "";
                taskDueTime.value = "";

                loadTasks();
            } else {
                alert("Error adding task: " + JSON.stringify(data));
            }
        })
        .catch(err => console.error("Error adding task:", err));
    });

    // 5. Update a task (e.g., status)
    function updateTask(taskId, changes) {
        fetch(`/api/todo/${taskId}/update/`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCSRFToken()
            },
            body: JSON.stringify(changes)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                loadTasks();
            } else {
                alert("Error updating task: " + JSON.stringify(data));
            }
        })
        .catch(err => console.error("Error updating task:", err));
    }

    // 6. Delete a task
    function deleteTask(taskId) {
        fetch(`/api/todo/${taskId}/delete/`, {
            method: "DELETE",
            headers: {"X-CSRFToken": getCSRFToken()}
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                loadTasks();
            } else {
                alert("Error deleting task: " + JSON.stringify(data));
            }
        })
        .catch(err => console.error("Error deleting task:", err));
    }

    // Utility: retrieve the CSRF token from cookies
    function getCSRFToken() {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, 10) === ('csrftoken=')) {
                    cookieValue = cookie.substring(10);
                    break;
                }
            }
        }
        return cookieValue;
    }

    // Finally, load tasks on page load
    loadTasks();
});
