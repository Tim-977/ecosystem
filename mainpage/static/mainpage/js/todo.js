document.addEventListener("DOMContentLoaded", function() {
    const pendingList = document.getElementById("pendingList");
    const doneList = document.getElementById("doneList");
    const addTaskBtn = document.getElementById("addTaskBtn");

    function loadTasks() {
        fetch("/api/todo/")
            .then(res => res.json())
            .then(data => renderTasks(data))
            .catch(err => console.error("Error loading tasks:", err));
    }

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

    function createTaskItem(task) {
        // Example task = {id, text, status, due_type, due_date, due_time}
        const li = document.createElement("li");

        // Construct a label to show the due info
        let dueInfo = "";
        if (task.due_type === "exact") {
            dueInfo = `Exact: ${task.due_date} ${task.due_time}`;
        } else if (task.due_type === "until") {
            dueInfo = `Until: ${task.due_date}`;
        } else if (task.due_type === "today") {
            dueInfo = `Today only`;
        } else {
            dueInfo = `No deadline`;
        }

        li.textContent = `${task.text} [${dueInfo}] `;

        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = (task.status === "pending") ? "Mark Done" : "Mark Pending";
        toggleBtn.addEventListener("click", () => {
            const newStatus = (task.status === "pending") ? "done" : "pending";
            updateTask(task.id, { status: newStatus });
        });
        li.appendChild(toggleBtn);

        const delBtn = document.createElement("button");
        delBtn.textContent = "Delete";
        delBtn.style.marginLeft = "10px";
        delBtn.addEventListener("click", () => deleteTask(task.id));
        li.appendChild(delBtn);

        return li;
    }

    addTaskBtn.addEventListener("click", function() {
        const text = prompt("Enter task description:");
        if (!text) return;

        const dueType = prompt(
          "Pick due type: none / today / until / exact",
          "none"
        );
        if (!dueType) return;

        let bodyData = {
            text: text,
            due_type: dueType
        };

        if (dueType === "until") {
            const d = prompt("Enter date (YYYY-MM-DD):");
            if (!d) return;
            bodyData.due_date = d;
        } else if (dueType === "exact") {
            const d = prompt("Enter date (YYYY-MM-DD):");
            const t = prompt("Enter time (HH:MM):");
            if (!d || !t) return;
            bodyData.due_date = d;
            bodyData.due_time = t;
        }
        // if 'today' or 'none', no date/time needed

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
                    loadTasks();
                } else {
                    alert("Error adding task: " + JSON.stringify(data));
                }
            })
            .catch(err => console.error("Error adding task:", err));
    });

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
