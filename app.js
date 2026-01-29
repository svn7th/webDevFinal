document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEYS = {
    tasks: "tasks",
    habits: "habits",
    favorites: "favorites",
    theme: "theme",
    resourcesCache: "resources_cache_v1"
  };

  
  const $ = (sel) => document.querySelector(sel);

  const toISODate = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.toISOString().slice(0, 10);
  };

  
  const getWeekStartISO = (date = new Date()) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const offset = (day - 6 + 7) % 7; 
    d.setDate(d.getDate() - offset);
    return toISODate(d);
  };

  const getDayIndexSatFirst = (date = new Date()) => {
    const day = new Date(date).getDay(); 
    const map = { 6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };
    return map[day];
  };

  const load = (key, fallback) => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  };

  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  
  let tasks = load(STORAGE_KEYS.tasks, []);
  let habits = load(STORAGE_KEYS.habits, []);
  let favorites = load(STORAGE_KEYS.favorites, []);
  let resourcesData = [];

  
  const navToggle = $("#navToggle");
  const appNav = $("#appNav");

  navToggle.addEventListener("click", () => {
    appNav.classList.toggle("open");
  });

  function setActiveLink() {
    document.querySelectorAll(".nav-link").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === location.hash);
    });
  }

  function showSection() {
    if (!location.hash) location.hash = "#dashboard";
    document.querySelectorAll(".page").forEach((s) => (s.style.display = "none"));
    const page = document.querySelector(location.hash);
    if (page) page.style.display = "block";
    setActiveLink();
    appNav.classList.remove("open");

    if (location.hash === "#dashboard") renderDashboard();
  }

  window.addEventListener("hashchange", showSection);

  
  const themeSwitch = $("#themeSwitch");

  function applyTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    themeSwitch.value = theme;
  }

  themeSwitch.addEventListener("change", (e) => applyTheme(e.target.value));

  const dbTotalTasks = $("#dbTotalTasks");
  const dbCompletedTasks = $("#dbCompletedTasks");
  const dbDueSoon = $("#dbDueSoon");
  const dbHabitsMet = $("#dbHabitsMet");
  const dbTaskPercent = $("#dbTaskPercent");
  const dbTaskProgressBar = $("#dbTaskProgressBar");
  const dbTaskProgressText = $("#dbTaskProgressText");
  const dbTodayList = $("#dbTodayList");
  const dbTodayEmpty = $("#dbTodayEmpty");
  const dbTodayRange = $("#dbTodayRange");

  function tasksDueWithinDays(days = 2) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + days);

    return tasks.filter((t) => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due >= today && due <= end;
    });
  }

  function renderDashboard() {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;

    const dueSoon = tasksDueWithinDays(2).filter((t) => !t.completed).length;

    ensureHabitsWeek();
    const met = habits.reduce((acc, h) => {
      const x = (h.progress || []).filter(Boolean).length;
      return acc + (x >= h.goal ? 1 : 0);
    }, 0);

    dbTotalTasks.textContent = total;
    dbCompletedTasks.textContent = completed;
    dbDueSoon.textContent = dueSoon;
    dbHabitsMet.textContent = `${met} / ${habits.length}`;

    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    dbTaskPercent.textContent = `${percent}%`;
    dbTaskProgressBar.style.width = `${percent}%`;
    dbTaskProgressText.textContent = `${completed} / ${total} completed`;

    const list = tasksDueWithinDays(2).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    dbTodayList.innerHTML = "";
    dbTodayEmpty.style.display = list.length ? "none" : "block";

    const todayISO = toISODate(new Date());
    const end = new Date();
    end.setDate(end.getDate() + 2);
    dbTodayRange.textContent = `${todayISO} → ${toISODate(end)}`;

    for (const t of list) {
      const li = document.createElement("li");
      const status = t.completed ? "✅" : "⏳";
      li.textContent = `${status} ${t.title} (Due: ${t.dueDate})`;
      dbTodayList.appendChild(li);
    }
  }

  const taskForm = $("#taskForm");
  const taskTitle = $("#taskTitle");
  const taskDescription = $("#taskDescription");
  const taskDueDate = $("#taskDueDate");
  const taskPriority = $("#taskPriority");
  const taskCategory = $("#taskCategory");
  const taskTitleError = $("#taskTitleError");
  const taskDueError = $("#taskDueError");
  const tasksList = $("#tasksList");
  const tasksEmpty = $("#tasksEmpty");
  const taskStatusFilter = $("#taskStatusFilter");
  const taskSort = $("#taskSort");
  const taskSubmitBtn = $("#taskSubmitBtn");
  const taskCancelEditBtn = $("#taskCancelEditBtn");

  let editingTaskId = null;

  function validateTaskForm() {
    let ok = true;
    taskTitleError.textContent = "";
    taskDueError.textContent = "";

    if (!taskTitle.value.trim()) {
      taskTitleError.textContent = "Title is required.";
      ok = false;
    }
    return ok;
  }

  function priorityRank(p) {
    return p === "High" ? 1 : p === "Medium" ? 2 : 3;
  }

  function getFilteredSortedTasks() {
    let list = [...tasks];

    const status = taskStatusFilter.value;
    if (status === "active") list = list.filter((t) => !t.completed);
    if (status === "completed") list = list.filter((t) => t.completed);

    const sortBy = taskSort.value;
    if (sortBy === "dueDate") list.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    if (sortBy === "priority") list.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

    return list;
  }

  function renderTasks() {
    const list = getFilteredSortedTasks();
    tasksList.innerHTML = "";
    tasksEmpty.style.display = list.length ? "none" : "block";

    for (const t of list) {
      const card = document.createElement("div");
      card.className = "panel task-card";

      const badges = `
        <span class="badge">Due: ${t.dueDate}</span>
        <span class="badge">Priority: ${t.priority}</span>
        <span class="badge">Category: ${t.category || "—"}</span>
        <span class="badge">${t.completed ? "Completed" : "Active"}</span>
      `;

      card.innerHTML = `
        <div class="task-top">
          <div>
            <strong>${t.title}</strong>
            ${t.description ? `<div class="muted small">${t.description}</div>` : ""}
          </div>
          <div class="badges">${badges}</div>
        </div>

        <div class="task-actions">
          <button class="btn primary" data-action="toggle" data-id="${t.id}">
            ${t.completed ? "Uncomplete" : "Complete"}
          </button>
          <button class="btn" data-action="edit" data-id="${t.id}">Edit</button>
          <button class="btn danger" data-action="delete" data-id="${t.id}">Delete</button>
        </div>
      `;

      tasksList.appendChild(card);
    }
  }

  taskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateTaskForm()) return;

    const obj = {
      id: editingTaskId ? editingTaskId : Date.now(),
      title: taskTitle.value.trim(),
      description: taskDescription.value.trim(),
      dueDate: taskDueDate.value,
      priority: taskPriority.value,
      category: taskCategory.value.trim(),
      completed: editingTaskId ? (tasks.find(t => t.id === editingTaskId)?.completed ?? false) : false
    };

    if (editingTaskId) {
      tasks = tasks.map((t) => (t.id === editingTaskId ? obj : t));
      editingTaskId = null;
      taskSubmitBtn.textContent = "Add Task";
      taskCancelEditBtn.style.display = "none";
    } else {
      tasks.push(obj);
    }

    save(STORAGE_KEYS.tasks, tasks);
    taskForm.reset();

    renderTasks();
    renderDashboard();
  });

  taskCancelEditBtn.addEventListener("click", () => {
    editingTaskId = null;
    taskForm.reset();
    taskSubmitBtn.textContent = "Add Task";
    taskCancelEditBtn.style.display = "none";
    taskTitleError.textContent = "";
    taskDueError.textContent = "";
  });

  tasksList.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;

    if (action === "toggle") {
      tasks = tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
      save(STORAGE_KEYS.tasks, tasks);
      renderTasks();
      renderDashboard();
    }

    if (action === "edit") {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      editingTaskId = id;

      taskTitle.value = t.title;
      taskDescription.value = t.description || "";
      taskDueDate.value = t.dueDate || "";
      taskPriority.value = t.priority || "Medium";
      taskCategory.value = t.category || "";

      taskSubmitBtn.textContent = "Save";
      taskCancelEditBtn.style.display = "inline-block";
      location.hash = "#tasks";
    }

    if (action === "delete") {
      const ok = confirm("Delete this task?");
      if (!ok) return;
      tasks = tasks.filter((t) => t.id !== id);
      save(STORAGE_KEYS.tasks, tasks);
      renderTasks();
      renderDashboard();
    }
  });

  taskStatusFilter.addEventListener("change", renderTasks);
  taskSort.addEventListener("change", renderTasks);

  const habitForm = $("#habitForm");
  const habitName = $("#habitName");
  const habitGoal = $("#habitGoal");
  const habitNameError = $("#habitNameError");
  const habitGoalError = $("#habitGoalError");
  const habitsList = $("#habitsList");
  const habitsEmpty = $("#habitsEmpty");
  const habitSummaryText = $("#habitSummaryText");
  const habitWeekInfo = $("#habitWeekInfo");

  const DAY_LABELS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

  function ensureHabitsWeek() {
    const currentWeekStart = getWeekStartISO(new Date());
    let changed = false;

    habits = habits.map((h) => {
      if (h.weekStartDate !== currentWeekStart) {
        changed = true;
        return { ...h, weekStartDate: currentWeekStart, progress: Array(7).fill(false) };
      }
      if (!Array.isArray(h.progress) || h.progress.length !== 7) {
        changed = true;
        return { ...h, progress: Array(7).fill(false), weekStartDate: currentWeekStart };
      }
      return h;
    });

    if (changed) save(STORAGE_KEYS.habits, habits);
  }

  function validateHabitForm() {
    let ok = true;
    habitNameError.textContent = "";
    habitGoalError.textContent = "";

    if (!habitName.value.trim()) {
      habitNameError.textContent = "Habit name is required.";
      ok = false;
    }

    const g = Number(habitGoal.value);
    if (!Number.isInteger(g) || g < 1 || g > 7) {
      habitGoalError.textContent = "Goal must be a number from 1 to 7.";
      ok = false;
    }

    return ok;
  }

  function renderHabits() {
    ensureHabitsWeek();

    habitsList.innerHTML = "";
    habitsEmpty.style.display = habits.length ? "none" : "block";

    const weekStart = getWeekStartISO(new Date());
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    habitWeekInfo.textContent = `${weekStart} → ${toISODate(end)}`;

    let achieved = 0;
    for (const h of habits) {
      const done = h.progress.filter(Boolean).length;
      if (done >= h.goal) achieved++;

      const card = document.createElement("div");
      card.className = "panel";

      const daysHTML = h.progress
        .map((val, idx) => {
          return `<button class="day-btn ${val ? "on" : ""}" data-habit="${h.id}" data-day="${idx}" type="button">${DAY_LABELS[idx]}</button>`;
        })
        .join("");

      card.innerHTML = `
        <div class="task-top">
          <div>
            <strong>${h.name}</strong>
            <div class="muted small">Goal: ${h.goal} days/week</div>
          </div>
          <div class="badges">
            <span class="badge">${done} / ${h.goal}</span>
          </div>
        </div>

        <div class="habit-days">${daysHTML}</div>

        <div class="task-actions" style="margin-top:10px;">
          <button class="btn danger" data-action="delete-habit" data-id="${h.id}" type="button">Delete</button>
        </div>
      `;

      habitsList.appendChild(card);
    }

    habitSummaryText.textContent = `Goals Achieved: ${achieved} / ${habits.length}`;
  }

  habitForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateHabitForm()) return;

    ensureHabitsWeek();
    const currentWeekStart = getWeekStartISO(new Date());

    const newHabit = {
      id: Date.now(),
      name: habitName.value.trim(),
      goal: Number(habitGoal.value),
      weekStartDate: currentWeekStart,
      progress: Array(7).fill(false)
    };

    habits.push(newHabit);
    save(STORAGE_KEYS.habits, habits);

    habitForm.reset();
    renderHabits();
    renderDashboard();
  });

  habitsList.addEventListener("click", (e) => {
    const dayBtn = e.target.closest(".day-btn");
    if (dayBtn) {
      const habitId = Number(dayBtn.dataset.habit);
      const dayIndex = Number(dayBtn.dataset.day);

      habits = habits.map((h) => {
        if (h.id !== habitId) return h;
        const p = [...h.progress];
        p[dayIndex] = !p[dayIndex];
        return { ...h, progress: p };
      });

      save(STORAGE_KEYS.habits, habits);
      renderHabits();
      renderDashboard();
      return;
    }

    const delBtn = e.target.closest('button[data-action="delete-habit"]');
    if (delBtn) {
      const id = Number(delBtn.dataset.id);
      if (!confirm("Delete this habit?")) return;
      habits = habits.filter((h) => h.id !== id);
      save(STORAGE_KEYS.habits, habits);
      renderHabits();
      renderDashboard();
    }
  });

  const resourcesStatus = $("#resourcesStatus");
  const resourcesList = $("#resourcesList");
  const resourceSearch = $("#resourceSearch");
  const resourceCategory = $("#resourceCategory");

  function renderResources() {
    const q = resourceSearch.value.trim().toLowerCase();
    const cat = resourceCategory.value;

    let list = [...resourcesData];
    
    if (cat === "favorites") {
      list = list.filter((r) => favorites.includes(r.id));
    } else if (cat !== "all") {
      list = list.filter((r) => r.category === cat);
    }

    if (q) {
      list = list.filter((r) => {
        const t = `${r.title} ${r.description} ${r.category}`.toLowerCase();
        return t.includes(q);
      });
    }

    resourcesList.innerHTML = "";
    for (const r of list) {
      const isFav = favorites.includes(r.id);

      const card = document.createElement("div");
      card.className = "resource";
      card.innerHTML = `
        <div class="resource-head">
          <div>
            <strong>${r.title}</strong>
            <div class="muted small">${r.category}</div>
          </div>
          <button class="star ${isFav ? "on" : ""}" data-id="${r.id}" type="button" title="Favorite">★</button>
        </div>
        <p class="muted">${r.description}</p>
        <a class="btn" href="${r.link}" target="_blank" rel="noopener">Open</a>
      `;
      resourcesList.appendChild(card);
    }

    resourcesStatus.textContent = `Showing ${list.length} resource(s).`;
  }


  resourcesList.addEventListener("click", (e) => {
    const btn = e.target.closest(".star");
    if (!btn) return;
    const id = Number(btn.dataset.id);

    if (favorites.includes(id)) {
      favorites = favorites.filter((x) => x !== id); 
    } else {
      favorites.push(id); 
    }

    save(STORAGE_KEYS.favorites, favorites); 
    renderResources(); 
  });


  resourceSearch.addEventListener("input", renderResources);
  resourceCategory.addEventListener("change", renderResources);

  async function loadResources() {
    resourcesStatus.textContent = "Loading resources...";
    resourcesList.innerHTML = "";

    try {
      const res = await fetch("./resources.json");
      if (!res.ok) throw new Error("Failed to fetch resources.json");
      const data = await res.json();

      resourcesData = Array.isArray(data) ? data : [];
      const cats = [...new Set(resourcesData.map((r) => r.category))].sort();

      resourceCategory.innerHTML = `<option value="all" selected>All</option>` + cats.map((c) => `<option value="${c}">${c}</option>`).join("");

      resourcesStatus.textContent = "Resources loaded.";
      renderResources();
    } catch (err) {
      resourcesStatus.textContent = "Error loading resources.";
      resourcesList.innerHTML = `<div class="panel"><strong>Error:</strong> Could not load resources.json</div>`;
    }
  }

  const resetBtn = $("#resetBtn");
  resetBtn.addEventListener("click", () => {
    if (!confirm("Are you sure you want to reset ALL data?")) return;

    localStorage.removeItem(STORAGE_KEYS.tasks);
    localStorage.removeItem(STORAGE_KEYS.habits);
    localStorage.removeItem(STORAGE_KEYS.favorites);
    localStorage.removeItem(STORAGE_KEYS.theme);

    location.reload();
  });

  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || "light";
  applyTheme(savedTheme);
  showSection();
  renderTasks();
  renderHabits();
  loadResources();
  renderDashboard();
});
