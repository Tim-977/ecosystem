document.addEventListener("DOMContentLoaded", function() {
    const pendingList = document.getElementById("pendingList");
    const doneList = document.getElementById("doneList");
    const addTaskBtn = document.getElementById("addTaskBtn");

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
        // Clear current <ul> items
        pendingList.innerHTML = "";
        doneList.innerHTML = "";

        // For each item, create an <li>
        pending.forEach(task => {
            const li = createTaskItem(task);
            pendingList.appendChild(li);
        });

        done.forEach(task => {
            const li = createTaskItem(task);
            doneList.appendChild(li);
        });
    }

    // 3. Create an <li> for a given task object
    function createTaskItem(task) {
        // Example task = {id, text, status, due_time}
        const li = document.createElement("li");
        li.textContent = task.text + " (due: " + task.due_time + ") ";

        // Mark done / undone button
        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = (task.status === "pending") ? "Mark Done" : "Mark Pending";
        toggleBtn.addEventListener("click", () => {
            const newStatus = (task.status === "pending") ? "done" : "pending";
            updateTask(task.id, {status: newStatus});
        });
        li.appendChild(toggleBtn);

        // Delete button
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
    addTaskBtn.addEventListener("click", function() {
        const text = prompt("Enter task description:");
        if (!text) return;

        let dueTime = prompt("Enter due time (or leave blank for 'someday'):");
        if (dueTime === null) {
            // user canceled
            return;
        }

        if (!dueTime) {
            dueTime = "someday";
        }

        fetch("/api/todo/add/", {
            method: "POST",
            headers: {"Content-Type": "application/json", "X-CSRFToken": getCSRFToken()},
            body: JSON.stringify({text: text, due_time: dueTime})
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    loadTasks();
                } else {
                    alert("Error adding task: " + JSON.stringify(data));
                }
            })
            .catch(err => console.error("Error adding task:", err));
    });

    // 5. Update a task (e.g. status)
    function updateTask(taskId, changes) {
        fetch("/api/todo/" + taskId + "/update/", {
            method: "PUT",
            headers: {"Content-Type": "application/json", "X-CSRFToken": getCSRFToken()},
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
        fetch("/api/todo/" + taskId + "/delete/", {
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
        // Simple method to get cookie by name
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
