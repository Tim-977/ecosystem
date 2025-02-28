document.addEventListener("DOMContentLoaded", function() {
    const pendingList = document.getElementById("pendingList");
    const doneList = document.getElementById("doneList");

    // Form elements (for creating NEW tasks)
    const taskText = document.getElementById("taskText");
    const taskPriority = document.getElementById("taskPriority");
    const taskDueType = document.getElementById("taskDueType");
    const taskDueDate = document.getElementById("taskDueDate");
    const taskDueTime = document.getElementById("taskDueTime");
    const createTaskBtn = document.getElementById("createTaskBtn");

    // Enable/disable date/time based on selection for NEW tasks
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

    // 1. Load tasks from the server
    function loadTasks() {
        fetch("/api/todo/")
            .then(res => res.json())
            .then(data => {
                renderTasks(data);
            })
            .catch(err => console.error("Error loading tasks:", err));
    }

    // 2. Render tasks (pending & done) to <ul> lists
    function renderTasks(data) {
        const { pending, done } = data;
        pendingList.innerHTML = "";
        doneList.innerHTML = "";

        pending.forEach(task => {
            const li = createTaskItem(task);
            pendingList.appendChild(li);
        });

        done.forEach(task => {
            const li = createTaskItem(task);
            doneList.appendChild(li);
        });
    }

    // 3. Build an <li> for a given task
    function createTaskItem(task) {
        const li = document.createElement("li");

        // We'll keep the textual display in a <span> so we can hide/show
        // an edit form on the same line
        const displaySpan = document.createElement("span");
        setDisplaySpanContent(displaySpan, task);

        li.appendChild(displaySpan);

        // Button: Mark Done / Mark Pending
        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = (task.status === "pending") ? "Mark Done" : "Mark Pending";
        toggleBtn.addEventListener("click", () => {
            const newStatus = (task.status === "pending") ? "done" : "pending";
            updateTask(task.id, { status: newStatus });
        });
        li.appendChild(toggleBtn);

        // Button: Edit (inline)
        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.style.marginLeft = "10px";
        editBtn.addEventListener("click", () => {
            showEditForm(task, li, displaySpan);
        });
        li.appendChild(editBtn);

        // Button: Delete
        const delBtn = document.createElement("button");
        delBtn.textContent = "Delete";
        delBtn.style.marginLeft = "10px";
        delBtn.addEventListener("click", () => {
            deleteTask(task.id);
        });
        li.appendChild(delBtn);

        // Apply deadline-based highlighting (red or orange)
        applyDeadlineHighlighting(li, task);

        return li;
    }

    // Helper: fill the text content for the displaySpan
    function setDisplaySpanContent(span, task) {
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
        span.textContent = `${priorityInfo} ${task.text} ${dueInfo}  `;
    }

    // 4. Add a NEW task (via the create form)
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
            dueDateVal = taskDueDate.value;  // e.g. "YYYY-MM-DD"
        } else if (dueTypeVal === "exact") {
            dueDateVal = taskDueDate.value;
            dueTimeVal = taskDueTime.value;  // e.g. "HH:MM"
        }

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
                // Reset form
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

    // 5. Show an inline edit form for an existing task
    function showEditForm(task, li, displaySpan) {
        displaySpan.style.display = "none";
    
        const editBtn = li.querySelector("button:nth-of-type(2)"); // Find the edit button
        editBtn.style.display = "none";  // Hide edit button
    
        const formDiv = document.createElement("div");
        formDiv.style.marginTop = "8px";
        formDiv.style.border = "1px solid #ccc";
        formDiv.style.padding = "5px";
        formDiv.style.display = "inline-block";
    
        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.style.width = "120px";
        textInput.value = task.text;
    
        const prioritySelect = document.createElement("select");
        ["critical", "high", "medium", "low"].forEach(p => {
            const opt = document.createElement("option");
            opt.value = p;
            opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
            if (p === task.priority) {
                opt.selected = true;
            }
            prioritySelect.appendChild(opt);
        });
    
        const dueTypeSelect = document.createElement("select");
        ["none", "today", "until", "exact"].forEach(dt => {
            const opt = document.createElement("option");
            opt.value = dt;
            opt.textContent = dt.charAt(0).toUpperCase() + dt.slice(1);
            if (dt === task.due_type) {
                opt.selected = true;
            }
            dueTypeSelect.appendChild(opt);
        });
    
        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.value = task.due_date || "";
    
        const timeInput = document.createElement("input");
        timeInput.type = "time";
        timeInput.value = task.due_time || "";
    
        function handleDueTypeChange(val) {
            if (val === "until") {
                dateInput.disabled = false;
                timeInput.disabled = true;
                timeInput.value = "";
            } else if (val === "exact") {
                dateInput.disabled = false;
                timeInput.disabled = false;
            } else {
                dateInput.disabled = true;
                timeInput.disabled = true;
                dateInput.value = "";
                timeInput.value = "";
            }
        }
    
        handleDueTypeChange(task.due_type);
        dueTypeSelect.addEventListener("change", () => {
            handleDueTypeChange(dueTypeSelect.value);
        });
    
        formDiv.appendChild(document.createTextNode(" Text: "));
        formDiv.appendChild(textInput);
    
        formDiv.appendChild(document.createTextNode(" Priority: "));
        formDiv.appendChild(prioritySelect);
    
        formDiv.appendChild(document.createTextNode(" Due Type: "));
        formDiv.appendChild(dueTypeSelect);
    
        formDiv.appendChild(document.createTextNode(" Date: "));
        formDiv.appendChild(dateInput);
    
        formDiv.appendChild(document.createTextNode(" Time: "));
        formDiv.appendChild(timeInput);
    
        const saveBtn = document.createElement("button");
        saveBtn.textContent = "Save";
        saveBtn.style.marginLeft = "5px";
        saveBtn.addEventListener("click", () => {
            const changes = {
                text: textInput.value.trim(),
                priority: prioritySelect.value,
                due_type: dueTypeSelect.value
            };
            if (dueTypeSelect.value === "until") {
                changes.due_date = dateInput.value;
                changes.due_time = null;
            } else if (dueTypeSelect.value === "exact") {
                changes.due_date = dateInput.value;
                changes.due_time = timeInput.value;
            } else {
                changes.due_date = null;
                changes.due_time = null;
            }
    
            updateTask(task.id, changes, () => {
                li.removeChild(formDiv);
                displaySpan.style.display = "";
                editBtn.style.display = "";  // Show edit button again
            });
        });
        formDiv.appendChild(saveBtn);
    
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.marginLeft = "5px";
        cancelBtn.addEventListener("click", () => {
            li.removeChild(formDiv);
            displaySpan.style.display = "";
            editBtn.style.display = "";  // Show edit button again
        });
        formDiv.appendChild(cancelBtn);
    
        li.appendChild(formDiv);
    }
    

    // 6. Update a task (e.g., text, priority, due info, status)
    function updateTask(taskId, changes, onSuccess) {
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
                // Optionally re-load tasks or call a callback
                if (onSuccess) onSuccess();
                loadTasks();
            } else {
                alert("Error updating task: " + JSON.stringify(data));
            }
        })
        .catch(err => console.error("Error updating task:", err));
    }

    // 7. Delete a task
    function deleteTask(taskId) {
        fetch(`/api/todo/${taskId}/delete/`, {
            method: "DELETE",
            headers: { "X-CSRFToken": getCSRFToken() }
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

    // Highlight overdue tasks (red) or tasks due in next 30 min (orange)
    function applyDeadlineHighlighting(li, task) {
        const now = new Date();
        let deadline = null;

        if (task.due_type === "exact" && task.due_date && task.due_time) {
            // Example: "2025-02-28T14:30"
            deadline = new Date(`${task.due_date}T${task.due_time}`);
        } else if (task.due_type === "until" && task.due_date) {
            // e.g. "2025-02-28T23:59"
            deadline = new Date(`${task.due_date}T23:59`);
        } else if (task.due_type === "today") {
            // use today's date + 23:59 local
            const todayStr = new Date().toISOString().split("T")[0];
            deadline = new Date(`${todayStr}T23:59`);
        }

        if (deadline) {
            const diffMinutes = (deadline - now) / (1000 * 60); // ms → minutes
            if (diffMinutes < 0) {
                // Overdue
                li.style.color = "red";
            } else if (diffMinutes <= 30) {
                // Due soon
                li.style.color = "orange";
            } else {
                // Reset color (in case we updated the task)
                li.style.color = "";
            }
        } else {
            // No deadline → no highlight
            li.style.color = "";
        }
    }

    // Retrieve CSRF token from cookies
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
