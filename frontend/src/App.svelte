<script>
  import { onMount } from "svelte";
  import { createClient } from "@supabase/supabase-js";

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let authSection;
  let appSection;
  let authMessage;
  let userEmail;
  let signOutButton;
  let dayPicker;
  let refreshButton;
  let autoScheduleButton;
  let dayTotal;
  let dayDuration;
  let focusToggle;
  let focusProject;
  let focusStatus;
  let selectedDayLabel;
  let dayViewCard;
  let taskForm;
  let taskMessage;
  let bulkInput;
  let bulkMessage;
  let projectForm;
  let projectMessage;
  let eventForm;
  let eventMessage;
  let workHoursForm;
  let workHoursMessage;
  let calendarImportForm;
  let calendarImportMessage;
  let aiBreakdownButton;
  let aiInput;
  let aiMessage;
  let taskProjectSelect;
  let fixedEventsEl;
  let dayMap;
  let monthGrid;
  let monthPrev;
  let monthNext;
  let monthLabel;
  let milestonesEl;
  let balanceEl;
  let todayMap;
  let todaySummary;

  let focusEnabled = false;
  let focusKey = "";
  let currentMonth = new Date();
  currentMonth.setDate(1);
  let projectsCache = [];
  let todayTaskIndex = new Map();
  let dayTaskIndex = new Map();
  let workStartMinutes = 9 * 60;
  let workEndMinutes = 17 * 60;
  let breakMinutes = 15;
  const AUTO_CONT_MARKER = "[auto-cont]";
  const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const PROJECT_COLORS = [
    "#60a5fa",
    "#f59e0b",
    "#34d399",
    "#f472b6",
    "#a78bfa",
    "#f87171",
    "#38bdf8",
    "#fbbf24"
  ];

  const todayISO = new Date().toISOString().slice(0, 10);

  function setMessage(target, text, tone = "default") {
    if (!target) return;
    target.textContent = text;
    target.classList.toggle("danger", tone === "error");
  }

  function formatTimeRange(start, end) {
    if (!start && !end) return "Unscheduled";
    if (start && end) return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
    if (start) return `${start.slice(0, 5)} start`;
    return `${end.slice(0, 5)} end`;
  }

  function toMinutes(timeValue) {
    if (!timeValue) return 0;
    const [hours, minutes] = timeValue.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function minutesToDuration(minutes) {
    if (!minutes) return "0h";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours && mins) return `${hours}h ${mins}m`;
    if (hours) return `${hours}h`;
    return `${mins}m`;
  }

  function getNowTimeString() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  function toTimeString(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function addDays(dateString, days) {
    const date = new Date(`${dateString}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function formatDateParts(year, monthIndex, day) {
    const mm = String(monthIndex + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  function isWeekend(dateString) {
    const day = new Date(`${dateString}T00:00:00`).getDay();
    return day === 0 || day === 6;
  }

  function getNextWeekday(dateString) {
    let cursor = dateString;
    while (isWeekend(cursor)) {
      cursor = addDays(cursor, 1);
    }
    return cursor;
  }

  function getNextWorkdayDate(dateString) {
    let cursor = addDays(dateString, 1);
    while (isWeekend(cursor)) {
      cursor = addDays(cursor, 1);
    }
    return cursor;
  }

  function getProjectKey(task) {
    const company = task.company || "Unassigned";
    const linkedProject = task.project_id
      ? projectsCache.find((item) => item.id === task.project_id)?.title
      : null;
    const project = linkedProject || task.project || "General";
    return `${company} · ${project}`;
  }

  function getProjectColor(task) {
    const key = getProjectKey(task);
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) % PROJECT_COLORS.length;
    }
    return PROJECT_COLORS[hash];
  }

  function getTaskStatus(task) {
    if (task.status) return task.status;
    if (task.completed_at || task.actual_end) return "completed";
    return "planned";
  }

  function parseDependencies(input) {
    if (!input) return [];
    return input.split(",").map((value) => value.trim()).filter(Boolean);
  }

  function getWorkStartMinutes() {
    return workStartMinutes;
  }

  function getWorkEndMinutes() {
    return workEndMinutes;
  }

  function getBreakMinutes() {
    return breakMinutes;
  }

  function getProjectPriority(task) {
    if (!task.project_id) return 2;
    const project = projectsCache.find((item) => item.id === task.project_id);
    if (!project) return 2;
    return Number(project.priority_level) || 2;
  }

  function getEffectivePriority(task) {
    const taskPriority = Number(task.priority_level) || 2;
    const projectPriority = getProjectPriority(task);
    return Math.min(taskPriority, projectPriority);
  }

  function getDeadlineScore(task) {
    if (!task.deadline_date) return Infinity;
    const base = Date.parse(task.deadline_date);
    if (Number.isNaN(base)) return Infinity;
    return base;
  }

  function sortTasksForScheduling(tasks) {
    return tasks.slice().sort((a, b) => {
      const priorityDelta = getEffectivePriority(a) - getEffectivePriority(b);
      if (priorityDelta !== 0) return priorityDelta;
      const deadlineDelta = getDeadlineScore(a) - getDeadlineScore(b);
      if (deadlineDelta !== 0) return deadlineDelta;
      if (a.deadline_type === "hard" && b.deadline_type !== "hard") return -1;
      if (b.deadline_type === "hard" && a.deadline_type !== "hard") return 1;
      return (a.estimated_hours || 0) - (b.estimated_hours || 0);
    });
  }

  function dependenciesMet(task, scheduledIds, tasksById) {
    if (!task.dependencies || !task.dependencies.length) return true;
    return task.dependencies.every((depId) => {
      const dep = tasksById.get(depId);
      if (!dep) return true;
      if (getTaskStatus(dep) === "completed") return true;
      return scheduledIds.has(depId);
    });
  }

  function hasIncompleteDependencies(task, tasksById) {
    if (!task.dependencies || !task.dependencies.length) return false;
    return task.dependencies.some((depId) => {
      const dep = tasksById.get(depId);
      if (!dep) return false;
      return getTaskStatus(dep) !== "completed";
    });
  }

  function buildSchedulingQueue(tasks) {
    const sorted = sortTasksForScheduling(tasks);
    const tasksById = new Map(sorted.map((task) => [task.id, task]));
    const remaining = sorted.slice();
    const queue = [];
    const scheduledIds = new Set();
    let guard = 0;
    while (remaining.length && guard < 10000) {
      guard += 1;
      let progress = false;
      for (let i = 0; i < remaining.length; i += 1) {
        const task = remaining[i];
        if (dependenciesMet(task, scheduledIds, tasksById)) {
          queue.push(task);
          scheduledIds.add(task.id);
          remaining.splice(i, 1);
          progress = true;
          i -= 1;
        }
      }
      if (!progress) {
        queue.push(...remaining);
        break;
      }
    }
    return queue;
  }

  async function apiFetch(path, options = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || response.statusText);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function handleRecoveryFromHash() {
    if (!window.location.hash) return false;
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    if (!accessToken || !refreshToken) return false;
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (error) {
      setMessage(authMessage, error.message, "error");
      return false;
    }
    window.history.replaceState({}, document.title, window.location.pathname);
    if (type === "recovery") {
      const newPassword = window.prompt("Enter a new password to finish recovery:");
      if (!newPassword) {
        setMessage(authMessage, "Password update canceled.", "error");
        return true;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setMessage(authMessage, updateError.message, "error");
      } else {
        setMessage(authMessage, "Password updated. You can continue.", "default");
      }
    }
    return true;
  }

  async function handleAuth() {
    await handleRecoveryFromHash();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await renderApp(data.session.user);
    } else {
      renderSignedOut();
    }
  }

  function renderSignedOut() {
    authSection.hidden = false;
    appSection.hidden = true;
    userEmail.textContent = "Not signed in";
    signOutButton.hidden = true;
  }

  async function renderApp(user) {
    authSection.hidden = true;
    appSection.hidden = false;
    userEmail.textContent = user.email ?? "Signed in";
    signOutButton.hidden = false;
    setActiveTab("calendar-tab");
    await loadWorkSettings();
    await loadProjects();
    updateMonthLabel();
    await loadMonth();
    await loadDay();
  }

  async function signIn(email, password, mode) {
    setMessage(authMessage, "");
    if (!email || !password) {
      setMessage(authMessage, "Email and password are required.", "error");
      return;
    }
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(authMessage, error.message, "error");
        return;
      }
      setMessage(authMessage, "Account created. Check your inbox for confirmation.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(authMessage, error.message, "error");
    }
  }

  function setActiveTab(tabId) {
    document.querySelectorAll("[data-tab-target]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tabTarget === tabId);
    });
    document.querySelectorAll("[data-tab-content]").forEach((section) => {
      const isActive = section.id === tabId;
      section.classList.toggle("active", isActive);
      section.hidden = !isActive;
    });
  }

  function updateMonthLabel() {
    const formatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
    monthLabel.textContent = formatter.format(currentMonth);
  }

  function setCurrentMonthFromDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    updateMonthLabel();
  }

  async function loadWorkSettings() {
    try {
      const response = await apiFetch("/api/settings");
      const settings = response?.[0] || {
        work_start: "09:00",
        work_end: "17:00",
        break_length: 15
      };
      workStartMinutes = toMinutes(settings.work_start);
      workEndMinutes = toMinutes(settings.work_end);
      breakMinutes = settings.break_length ?? 15;
      document.querySelector("#work-start").value = settings.work_start;
      document.querySelector("#work-end").value = settings.work_end;
      document.querySelector("#break-length").value = breakMinutes;
    } catch (error) {
      setMessage(workHoursMessage, error.message, "error");
    }
  }

  async function saveWorkSettings(payload) {
    try {
      await apiFetch("/api/settings", { method: "POST", body: JSON.stringify(payload) });
      setMessage(workHoursMessage, "Work hours saved.");
      await loadWorkSettings();
      await loadMonth();
      await loadDay();
    } catch (error) {
      setMessage(workHoursMessage, error.message, "error");
    }
  }

  async function loadProjects() {
    try {
      projectsCache = await apiFetch("/api/projects");
      taskProjectSelect.innerHTML = "";
      const noneOption = document.createElement("option");
      noneOption.value = "";
      noneOption.textContent = "No project";
      taskProjectSelect.appendChild(noneOption);
      projectsCache.forEach((project) => {
        const option = document.createElement("option");
        option.value = project.id;
        option.textContent = project.title;
        taskProjectSelect.appendChild(option);
      });
    } catch (error) {
      setMessage(projectMessage, error.message, "error");
    }
  }

  async function loadDay() {
    const day = dayPicker.value || todayISO;
    try {
      const [tasks, events] = await Promise.all([
        apiFetch(`/api/tasks?date=${day}`),
        apiFetch(`/api/events?date=${day}`)
      ]);
      renderDay(tasks || [], events || []);
      await loadToday();
    } catch (error) {
      setMessage(taskMessage, error.message, "error");
    }
  }

  async function loadToday() {
    try {
      const [tasks, events] = await Promise.all([
        apiFetch(`/api/tasks?date=${todayISO}`),
        apiFetch(`/api/events?date=${todayISO}`)
      ]);
      renderToday(tasks || [], events || []);
    } catch (error) {
      setMessage(taskMessage, error.message, "error");
    }
  }

  async function loadMonth() {
    const startDay = formatDateParts(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1
    );
    const endDay = formatDateParts(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()
    );
    try {
      const [tasks, events] = await Promise.all([
        apiFetch(`/api/tasks?start=${startDay}&end=${endDay}`),
        apiFetch(`/api/events?start=${startDay}&end=${endDay}`)
      ]);
      syncFocusOptions(tasks || []);
      renderMonthCalendar(tasks || [], events || []);
    } catch (error) {
      setMessage(taskMessage, error.message, "error");
    }
  }

  function syncFocusOptions(tasks) {
    const selected = focusProject.value;
    const options = new Set();
    tasks.forEach((task) => {
      options.add(getProjectKey(task));
    });
    const sorted = Array.from(options).sort((a, b) => a.localeCompare(b));
    focusProject.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All projects";
    focusProject.appendChild(allOption);
    sorted.forEach((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = key;
      focusProject.appendChild(option);
    });
    focusProject.value = sorted.includes(selected) ? selected : "";
    focusKey = focusProject.value;
    updateFocusStatus();
  }

  function updateFocusStatus() {
    if (!focusEnabled || !focusKey) {
      focusStatus.textContent = "Neutral";
      return;
    }
    focusStatus.textContent = `High Focus: ${focusKey}`;
  }

  function renderMonthCalendar(tasks, events = []) {
    const year = currentMonth.getFullYear();
    const monthIndex = currentMonth.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const offset = firstDay.getDay();

    const tasksByDate = {};
    const eventsByDate = {};
    tasks.forEach((task) => {
      tasksByDate[task.task_date] = tasksByDate[task.task_date] || [];
      tasksByDate[task.task_date].push(task);
    });
    events.forEach((event) => {
      eventsByDate[event.event_date] = eventsByDate[event.event_date] || [];
      eventsByDate[event.event_date].push(event);
    });

    monthGrid.innerHTML = "";
    WEEKDAY_LABELS.forEach((label) => {
      const weekday = document.createElement("div");
      weekday.className = "calendar-weekday";
      weekday.textContent = label;
      monthGrid.appendChild(weekday);
    });

    for (let i = 0; i < offset; i += 1) {
      const spacer = document.createElement("div");
      spacer.className = "calendar-cell inactive";
      monthGrid.appendChild(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayIso = formatDateParts(year, monthIndex, day);
      const items = tasksByDate[dayIso] ?? [];
      const fixedItems = eventsByDate[dayIso] ?? [];
      const scheduledMinutes = items.reduce((sum, task) => {
        if (!task.start_time || !task.end_time) return sum;
        return sum + Math.max(toMinutes(task.end_time) - toMinutes(task.start_time), 0);
      }, 0);
      const fixedMinutes = fixedItems.reduce((sum, event) => {
        if (!event.start_time || !event.end_time) return sum;
        return sum + Math.max(toMinutes(event.end_time) - toMinutes(event.start_time), 0);
      }, 0);
      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      if (dayIso === todayISO) {
        cell.classList.add("today");
      }
      if ((dayPicker.value || todayISO) === dayIso) {
        cell.classList.add("selected");
      }
      const indicatorCount = Math.min(items.length, 3);
      const indicators = items.slice(0, indicatorCount).map((task) => {
        const color = getProjectColor(task);
        return `<span class="indicator-dot" style="background:${color}"></span>`;
      }).join("");
      cell.innerHTML = `
        <div class="calendar-cell-top">
          <span class="day-number">${day}</span>
          ${items.length ? `<span class="day-count">${items.length}</span>` : ""}
        </div>
        <div class="calendar-cell-bottom">
          <span class="day-stats">${minutesToDuration(scheduledMinutes + fixedMinutes)}</span>
          <div class="calendar-indicators">${indicators}</div>
        </div>
      `;
      if (items.length) {
        cell.classList.add("has-tasks");
      }
      cell.addEventListener("click", () => {
        dayPicker.value = dayIso;
        document.querySelector("#task-date").value = dayIso;
        selectedDayLabel.textContent = `Day view: ${dayIso}`;
        loadDay();
        setActiveTab("calendar-tab");
      });
      monthGrid.appendChild(cell);
    }
  }

  function renderFixedEvents(events) {
    if (!events || !events.length) {
      fixedEventsEl.innerHTML = `<p class="empty">No fixed events.</p>`;
      return;
    }
    const list = document.createElement("div");
    list.className = "milestone-list";
    events.forEach((event) => {
      const item = document.createElement("div");
      item.className = "milestone-item";
      item.innerHTML = `
        <span>${escapeHtml(event.title)}</span>
        <span>${formatTimeRange(event.start_time, event.end_time)}</span>
      `;
      list.appendChild(item);
    });
    fixedEventsEl.innerHTML = "";
    fixedEventsEl.appendChild(list);
  }

  function renderDay(tasks, events = []) {
    const deduped = dedupeOverlaps(tasks);
    dayTaskIndex = new Map();
    tasks.forEach((task) => dayTaskIndex.set(task.id, task));
    renderTimeline(deduped);
    renderFixedEvents(events);
    renderMilestones(deduped);
    renderBalance(deduped);
    if (dayViewCard) {
      if (tasks.length) {
        const accent = getProjectColor(tasks[0]);
        dayViewCard.style.setProperty("--day-accent", accent);
      } else {
        dayViewCard.style.removeProperty("--day-accent");
      }
    }
    const totalMinutes = deduped.reduce((sum, task) => {
      if (!task.start_time || !task.end_time) return sum;
      const diff = toMinutes(task.end_time) - toMinutes(task.start_time);
      return sum + Math.max(diff, 0);
    }, 0);
    dayTotal.textContent = `${deduped.length} tasks`;
    dayDuration.textContent = minutesToDuration(totalMinutes);
    selectedDayLabel.textContent = `Day view: ${dayPicker.value || todayISO}`;
  }

  function renderToday(tasks, events = []) {
    renderTodayBlocks(tasks, events);
    const totalMinutes = tasks.reduce((sum, task) => {
      if (!task.start_time || !task.end_time) return sum;
      return sum + Math.max(toMinutes(task.end_time) - toMinutes(task.start_time), 0);
    }, 0);
    todaySummary.innerHTML = `
      <div class="balance-list">
        <div class="balance-item"><span>${tasks.length} tasks</span><span>${minutesToDuration(totalMinutes)}</span></div>
        <div class="balance-item"><span>Milestones</span><span>${tasks.filter((task) => task.is_milestone).length}</span></div>
        <div class="balance-item"><span>Completed</span><span>${tasks.filter((task) => getTaskStatus(task) === "completed").length}</span></div>
        <div class="balance-item"><span>Fixed events</span><span>${events.length}</span></div>
      </div>
    `;
  }

  function renderTodayBlocks(tasks, events = []) {
    const cleaned = dedupeOverlaps(tasks);
    const unscheduled = tasks.filter((task) => !task.start_time || !task.end_time);
    const fixed = events.filter((event) => event.start_time && event.end_time).sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

    todayMap.innerHTML = "";
    todayTaskIndex = new Map();
    tasks.forEach((task) => todayTaskIndex.set(task.id, task));
    if (!cleaned.length && !unscheduled.length && !fixed.length) {
      todayMap.innerHTML = `<p class="empty">No tasks scheduled today.</p>`;
      return;
    }

    const list = document.createElement("div");
    list.className = "today-list";

    const combined = [
      ...cleaned.map((task) => ({ type: "task", data: task })),
      ...fixed.map((event) => ({ type: "event", data: event }))
    ].sort((a, b) => toMinutes(a.data.start_time) - toMinutes(b.data.start_time));

    combined.forEach((entry, index) => {
      if (entry.type === "event") {
        const event = entry.data;
        const item = document.createElement("div");
        item.className = "today-item today-event";
        item.innerHTML = `
          <div class="today-time">${formatTimeRange(event.start_time, event.end_time)}</div>
          <div class="today-title">${escapeHtml(event.title)}</div>
          <div class="today-actions"><span class="pill">Fixed</span></div>
        `;
        list.appendChild(item);
        return;
      }
      const task = entry.data;
      const start = toMinutes(task.start_time);
      const end = toMinutes(task.end_time);
      const item = document.createElement("div");
      item.className = "today-item";
      const status = getTaskStatus(task);
      const accentColor = getProjectColor(task);
      item.style.setProperty("--task-accent", accentColor);
      if (focusEnabled && focusKey && getProjectKey(task) === focusKey) {
        item.classList.add("focused");
      }
      if (status === "completed") {
        item.classList.add("completed");
      }
      const canStart = status === "planned";
      const canFinish = status === "in_progress";
      item.innerHTML = `
        <div class="today-time">${formatTimeRange(task.start_time, task.end_time)}</div>
        <div class="today-title">${escapeHtml(task.title)}</div>
        <div class="today-actions">
          ${status === "completed" ? `<span class="pill done">Done</span>` : ""}
          ${canStart ? `<button class="secondary" data-action="start" data-task-id="${task.id}">Start</button>` : ""}
          ${canFinish ? `<button class="secondary" data-action="finish" data-task-id="${task.id}">Finish</button>` : ""}
          ${status === "in_progress" ? `<button class="secondary" data-action="stop" data-task-id="${task.id}">Stop</button>` : ""}
          <button class="secondary" data-action="reschedule" data-task-id="${task.id}">Reschedule</button>
        </div>
      `;
      list.appendChild(item);

      const nextItem = combined[index + 1];
      if (nextItem && nextItem.type === "task") {
        const nextStart = toMinutes(nextItem.data.start_time);
        const breakStart = end;
        const breakEnd = end + getBreakMinutes();
        const breakItem = document.createElement("div");
        breakItem.className = "today-break";
        if (nextStart < breakEnd) {
          breakItem.classList.add("break-missing");
          breakItem.textContent = `Break ${getBreakMinutes()}m needed (next ${toTimeString(nextStart)})`;
        } else {
          breakItem.textContent = `Break ${getBreakMinutes()}m (${toTimeString(breakStart)} - ${toTimeString(breakEnd)})`;
        }
        list.appendChild(breakItem);
      }
    });

    if (unscheduled.length) {
      const block = document.createElement("div");
      block.className = "today-unscheduled";
      block.innerHTML = `
        <div class="today-time">Unscheduled</div>
        <div class="today-title">${unscheduled.map((task) => escapeHtml(task.title)).join(", ")}</div>
      `;
      list.appendChild(block);
    }

    todayMap.appendChild(list);

    todayMap.querySelectorAll("button[data-task-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.action;
        if (action === "start") {
          await markTaskStarted(button.dataset.taskId);
          return;
        }
        if (action === "finish") {
          await markTaskFinished(button.dataset.taskId);
          return;
        }
        if (action === "stop") {
          await markTaskStopped(button.dataset.taskId);
          return;
        }
        if (action === "reschedule") {
          const task = todayTaskIndex.get(button.dataset.taskId);
          if (task) {
            await rescheduleTask(task);
          }
        }
      });
    });
  }

  function renderTimeline(tasks) {
    if (!tasks.length) {
      dayMap.innerHTML = `<p class="empty">No tasks scheduled yet.</p>`;
      return;
    }
    const previousPositions = new Map();
    dayMap.querySelectorAll(".task-item").forEach((item) => {
      previousPositions.set(item.dataset.taskId, item.getBoundingClientRect());
    });
    dayMap.innerHTML = "";
    tasks.forEach((task) => {
      const item = document.createElement("div");
      item.className = "task-item";
      item.dataset.taskId = task.id;
      const status = getTaskStatus(task);
      const titleText =
        (typeof task.title === "string" && task.title.trim()) ||
        (typeof task.project === "string" && task.project.trim()) ||
        (typeof task.company === "string" && task.company.trim()) ||
        "Untitled task";
      const accentColor = getProjectColor(task);
      item.style.setProperty("--task-accent", accentColor);
      if (focusEnabled && focusKey && getProjectKey(task) === focusKey) {
        item.classList.add("focused");
      }
      if (status === "completed") {
        item.classList.add("completed");
      }
      if (status === "in_progress") {
        item.classList.add("in-progress");
      }
      const header = document.createElement("div");
      header.className = "task-header";
      const canStart = status === "planned";
      const canFinish = status === "in_progress";
      header.innerHTML = `
        <strong class="task-title">${escapeHtml(titleText)}</strong>
        <div class="task-actions">
          ${status === "completed" ? `<span class="pill done">Done</span>` : ""}
          ${canStart ? `<button class="secondary" data-action="start" data-task-id="${task.id}">Start</button>` : ""}
          ${canFinish ? `<button class="secondary" data-action="finish" data-task-id="${task.id}">Finish</button>` : ""}
          ${status === "in_progress" ? `<button class="secondary" data-action="stop" data-task-id="${task.id}">Stop</button>` : ""}
          <button class="secondary" data-action="reschedule" data-task-id="${task.id}">Reschedule</button>
          <button class="secondary" data-action="delete" data-task-id="${task.id}">Delete</button>
        </div>
      `;
      const meta = document.createElement("div");
      meta.className = "task-meta";
      const projectLabel = task.project_id
        ? projectsCache.find((item) => item.id === task.project_id)?.title
        : task.project;
      const blocked = hasIncompleteDependencies(task, dayTaskIndex);
      meta.innerHTML = `
        <span class="pill time">${formatTimeRange(task.start_time, task.end_time)}</span>
        ${task.company ? `<span class="pill company">${escapeHtml(task.company)}</span>` : ""}
        ${projectLabel ? `<span class="pill project">${escapeHtml(projectLabel)}</span>` : ""}
        ${task.estimated_hours ? `<span class="pill">Est ${task.estimated_hours}h</span>` : ""}
        ${task.priority_level ? `<span class="pill">P${task.priority_level}</span>` : ""}
        ${task.deadline_date ? `<span class="pill">${escapeHtml(task.deadline_type || "soft")} ${task.deadline_date}</span>` : ""}
        ${blocked ? `<span class="pill">Blocked</span>` : ""}
        ${task.is_milestone ? `<span class="pill milestone">Milestone</span>` : ""}
      `;
      item.append(header, meta);
      if (task.notes) {
        const notes = document.createElement("div");
        notes.className = "helper";
        notes.textContent = task.notes;
        item.appendChild(notes);
      }
      dayMap.appendChild(item);
    });

    requestAnimationFrame(() => {
      dayMap.querySelectorAll(".task-item").forEach((item) => {
        const previous = previousPositions.get(item.dataset.taskId);
        const current = item.getBoundingClientRect();
        if (previous) {
          const deltaY = previous.top - current.top;
          if (Math.abs(deltaY) > 1) {
            item.animate(
              [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
              { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
            );
          }
        } else {
          item.animate(
            [{ opacity: 0, transform: "scale(0.98)" }, { opacity: 1, transform: "scale(1)" }],
            { duration: 260, easing: "ease-out" }
          );
        }
      });
    });

    dayMap.querySelectorAll("button[data-task-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.action;
        if (action === "delete") {
          await apiFetch(`/api/tasks/${button.dataset.taskId}`, { method: "DELETE" });
          loadDay();
          return;
        }
        if (action === "start") {
          await markTaskStarted(button.dataset.taskId);
          return;
        }
        if (action === "finish") {
          await markTaskFinished(button.dataset.taskId);
          return;
        }
        if (action === "stop") {
          await markTaskStopped(button.dataset.taskId);
          return;
        }
        if (action === "reschedule") {
          const task = dayTaskIndex.get(button.dataset.taskId);
          if (task) {
            await rescheduleTask(task);
          }
        }
      });
    });
  }

  function renderMilestones(tasks) {
    const milestones = tasks.filter((task) => task.is_milestone);
    if (!milestones.length) {
      milestonesEl.innerHTML = `<p class="empty">No milestones yet.</p>`;
      return;
    }
    const list = document.createElement("div");
    list.className = "milestone-list";
    milestones.forEach((task) => {
      const item = document.createElement("div");
      item.className = "milestone-item";
      item.innerHTML = `
        <span>${escapeHtml(task.title)}</span>
        <span>${formatTimeRange(task.start_time, task.end_time)}</span>
      `;
      list.appendChild(item);
    });
    milestonesEl.innerHTML = "";
    milestonesEl.appendChild(list);
  }

  function renderBalance(tasks) {
    if (!tasks.length) {
      balanceEl.innerHTML = `<p class="empty">No workload to balance.</p>`;
      return;
    }
    const stats = {};
    tasks.forEach((task) => {
      const key = getProjectKey(task);
      if (!stats[key]) {
        stats[key] = { count: 0, minutes: 0 };
      }
      stats[key].count += 1;
      if (task.start_time && task.end_time) {
        stats[key].minutes += Math.max(toMinutes(task.end_time) - toMinutes(task.start_time), 0);
      }
    });
    const list = document.createElement("div");
    list.className = "balance-list";
    Object.entries(stats).forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "balance-item";
      item.innerHTML = `
        <span>${escapeHtml(key)}</span>
        <span>${value.count} tasks · ${minutesToDuration(value.minutes)}</span>
      `;
      list.appendChild(item);
    });
    balanceEl.innerHTML = "";
    balanceEl.appendChild(list);
  }

  function dedupeOverlaps(tasks) {
    const scheduled = tasks
      .filter((task) => task.start_time && task.end_time)
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
    const cleaned = [];
    scheduled.forEach((task) => {
      const start = toMinutes(task.start_time);
      const end = toMinutes(task.end_time);
      const isAutoCont =
        (typeof task.title === "string" && task.title.includes("(cont.)")) ||
        (typeof task.notes === "string" && task.notes.includes(AUTO_CONT_MARKER));
      const overlappingIndex = cleaned.findIndex((existing) => {
        const existingStart = toMinutes(existing.start_time);
        const existingEnd = toMinutes(existing.end_time);
        return start < existingEnd && end > existingStart;
      });
      if (overlappingIndex === -1) {
        cleaned.push(task);
        return;
      }
      const existing = cleaned[overlappingIndex];
      const existingIsAuto =
        (typeof existing.title === "string" && existing.title.includes("(cont.)")) ||
        (typeof existing.notes === "string" && existing.notes.includes(AUTO_CONT_MARKER));
      if (existingIsAuto && !isAutoCont) {
        cleaned[overlappingIndex] = task;
      }
    });
    return cleaned;
  }

  async function markTaskStarted(taskId) {
    const nowTime = getNowTimeString();
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "in_progress", actual_start: nowTime })
    });
    await loadDay();
    await loadToday();
  }

  async function markTaskStopped(taskId) {
    const nowTime = getNowTimeString();
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "planned", actual_end: nowTime })
    });
    await loadDay();
    await loadToday();
  }

  async function markTaskFinished(taskId) {
    const nowTime = getNowTimeString();
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "completed",
        actual_end: nowTime,
        completed_at: new Date().toISOString(),
        end_time: nowTime
      })
    });
    await loadDay();
    await loadToday();
  }

  async function rescheduleTask(task) {
    const newDate = getNextWorkdayDate(task.task_date);
    const updates = { task_date: newDate };
    if (task.start_time && task.end_time) {
      updates.start_time = task.start_time;
      updates.end_time = task.end_time;
    }
    if (getTaskStatus(task) === "in_progress") {
      updates.status = "planned";
    }
    await apiFetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify(updates)
    });
    await loadDay();
    await loadToday();
    await loadMonth();
  }

  async function autoSchedule() {
    await apiFetch("/api/schedule/auto", {
      method: "POST",
      body: JSON.stringify({
        focus_key: focusEnabled && focusKey ? focusKey : "",
        allow_reshuffle: focusEnabled && focusKey,
        start_day: getNextWeekday(dayPicker.value || todayISO)
      })
    });
    await loadDay();
    await loadMonth();
    await loadToday();
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[&<>\"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });
  }

  onMount(() => {
    authSection = document.querySelector("#auth-section");
    appSection = document.querySelector("#app-section");
    authMessage = document.querySelector("#auth-message");
    userEmail = document.querySelector("#user-email");
    signOutButton = document.querySelector("#sign-out");
    dayPicker = document.querySelector("#day-picker");
    refreshButton = document.querySelector("#refresh-day");
    autoScheduleButton = document.querySelector("#auto-schedule");
    dayTotal = document.querySelector("#day-total");
    dayDuration = document.querySelector("#day-duration");
    focusToggle = document.querySelector("#focus-toggle");
    focusProject = document.querySelector("#focus-project");
    focusStatus = document.querySelector("#focus-status");
    selectedDayLabel = document.querySelector("#selected-day-label");
    dayViewCard = document.querySelector("#day-view-card");
    taskForm = document.querySelector("#task-form");
    taskMessage = document.querySelector("#task-message");
    bulkInput = document.querySelector("#bulk-input");
    bulkMessage = document.querySelector("#bulk-message");
    projectForm = document.querySelector("#project-form");
    projectMessage = document.querySelector("#project-message");
    eventForm = document.querySelector("#event-form");
    eventMessage = document.querySelector("#event-message");
    workHoursForm = document.querySelector("#work-hours-form");
    workHoursMessage = document.querySelector("#work-hours-message");
    calendarImportForm = document.querySelector("#calendar-import-form");
    calendarImportMessage = document.querySelector("#calendar-import-message");
    aiBreakdownButton = document.querySelector("#ai-breakdown");
    aiInput = document.querySelector("#ai-input");
    aiMessage = document.querySelector("#ai-message");
    taskProjectSelect = document.querySelector("#task-project-id");
    fixedEventsEl = document.querySelector("#fixed-events");
    dayMap = document.querySelector("#day-map");
    monthGrid = document.querySelector("#month-grid");
    monthPrev = document.querySelector("#month-prev");
    monthNext = document.querySelector("#month-next");
    monthLabel = document.querySelector("#month-label");
    milestonesEl = document.querySelector("#milestones");
    balanceEl = document.querySelector("#balance");
    todayMap = document.querySelector("#today-map");
    todaySummary = document.querySelector("#today-summary");

    dayPicker.value = todayISO;
    document.querySelector("#task-date").value = todayISO;
    selectedDayLabel.textContent = `Day view: ${todayISO}`;
    const eventDateInput = document.querySelector("#event-date");
    if (eventDateInput) eventDateInput.value = todayISO;

    document.querySelector("#sign-in").addEventListener("click", () => {
      const email = document.querySelector("#auth-email").value.trim();
      const password = document.querySelector("#auth-password").value;
      signIn(email, password, "signin");
    });

    document.querySelector("#sign-up").addEventListener("click", () => {
      const email = document.querySelector("#auth-email").value.trim();
      const password = document.querySelector("#auth-password").value;
      signIn(email, password, "signup");
    });

    signOutButton.addEventListener("click", async () => {
      await supabase.auth.signOut();
      renderSignedOut();
    });

    document.querySelectorAll("[data-tab-target]").forEach((button) => {
      button.addEventListener("click", () => setActiveTab(button.dataset.tabTarget));
    });

    monthPrev.addEventListener("click", () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      updateMonthLabel();
      loadMonth();
    });

    monthNext.addEventListener("click", () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      updateMonthLabel();
      loadMonth();
    });

    taskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(taskMessage, "");
      const payload = {
        title: document.querySelector("#task-title").value.trim(),
        project_id: document.querySelector("#task-project-id").value || null,
        company: document.querySelector("#task-company").value.trim(),
        project: document.querySelector("#task-project").value.trim(),
        task_date: document.querySelector("#task-date").value,
        start_time: document.querySelector("#task-start").value || null,
        end_time: document.querySelector("#task-end").value || null,
        is_milestone: document.querySelector("#task-milestone").checked,
        estimated_hours: parseFloat(document.querySelector("#task-hours").value) || null,
        priority_level: Number(document.querySelector("#task-priority").value) || 2,
        deadline_type: document.querySelector("#task-deadline-type").value || null,
        deadline_date: document.querySelector("#task-deadline-date").value || null,
        dependencies: parseDependencies(document.querySelector("#task-dependencies").value),
        notes: document.querySelector("#task-notes").value.trim(),
        status: "planned"
      };
      if (!payload.title || !payload.task_date) {
        setMessage(taskMessage, "Title and day are required.", "error");
        return;
      }
      await apiFetch("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
      taskForm.reset();
      document.querySelector("#task-date").value = dayPicker.value;
      setMessage(taskMessage, "Task added.");
      await loadDay();
      await loadMonth();
      await loadToday();
    });

    document.querySelector("#bulk-import").addEventListener("click", async () => {
      setMessage(bulkMessage, "");
      let raw = bulkInput.value.trim();
      raw = raw.replace(/;;/g, "\n");
      const lines = raw
        .split("\n")
        .map((line) => line.trim())
        .map((line) => line.replace(/;+\s*$/, ""))
        .filter(Boolean);
      if (!lines.length) {
        setMessage(bulkMessage, "Add at least one line to import.", "error");
        return;
      }
      const tasks = [];
      for (const line of lines) {
        const parsed = parseBulkLine(line);
        if (parsed) tasks.push(parsed);
      }
      if (!tasks.length) {
        setMessage(bulkMessage, "No valid lines found. Check the format.", "error");
        return;
      }
      await apiFetch("/api/tasks", { method: "POST", body: JSON.stringify(tasks) });
      bulkInput.value = "";
      setMessage(bulkMessage, `Imported ${tasks.length} task(s).`);
      await loadDay();
      await loadMonth();
      await loadToday();
    });

    refreshButton.addEventListener("click", loadDay);
    autoScheduleButton.addEventListener("click", autoSchedule);
    dayPicker.addEventListener("change", () => {
      document.querySelector("#task-date").value = dayPicker.value;
      const eventDateInput = document.querySelector("#event-date");
      if (eventDateInput) eventDateInput.value = dayPicker.value;
      setCurrentMonthFromDate(dayPicker.value);
      loadMonth();
      loadDay();
      setActiveTab("calendar-tab");
    });

    focusToggle.addEventListener("change", () => {
      focusEnabled = focusToggle.checked;
      updateFocusStatus();
      if (focusEnabled && focusKey) {
        autoSchedule();
      } else {
        loadDay();
      }
    });

    focusProject.addEventListener("change", () => {
      focusKey = focusProject.value;
      updateFocusStatus();
      if (focusEnabled && focusKey) {
        autoSchedule();
      } else {
        loadDay();
      }
    });

    projectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(projectMessage, "");
      const payload = {
        title: document.querySelector("#project-title").value.trim(),
        description: document.querySelector("#project-description").value.trim(),
        priority_level: Number(document.querySelector("#project-priority").value) || 2,
        deadline_type: document.querySelector("#project-deadline-type").value || null,
        deadline_date: document.querySelector("#project-deadline-date").value || null
      };
      if (!payload.title) {
        setMessage(projectMessage, "Project title is required.", "error");
        return;
      }
      await apiFetch("/api/projects", { method: "POST", body: JSON.stringify(payload) });
      projectForm.reset();
      setMessage(projectMessage, "Project added.");
      await loadProjects();
    });

    eventForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(eventMessage, "");
      const payload = {
        title: document.querySelector("#event-title").value.trim(),
        event_date: document.querySelector("#event-date").value,
        start_time: document.querySelector("#event-start").value,
        end_time: document.querySelector("#event-end").value,
        source: "internal",
        is_fixed: true
      };
      if (!payload.title || !payload.event_date || !payload.start_time || !payload.end_time) {
        setMessage(eventMessage, "All event fields are required.", "error");
        return;
      }
      await apiFetch("/api/events", { method: "POST", body: JSON.stringify(payload) });
      eventForm.reset();
      setMessage(eventMessage, "Event added.");
      await loadMonth();
      await loadDay();
    });

    workHoursForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(workHoursMessage, "");
      const payload = {
        work_start: document.querySelector("#work-start").value,
        work_end: document.querySelector("#work-end").value,
        break_length: Number(document.querySelector("#break-length").value) || 15
      };
      await saveWorkSettings(payload);
    });

    calendarImportForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(calendarImportMessage, "");
      const apiKey = document.querySelector("#google-api-key").value.trim();
      const calendarId = document.querySelector("#google-calendar-id").value.trim();
      if (!apiKey || !calendarId) {
        setMessage(calendarImportMessage, "API key and calendar ID are required.", "error");
        return;
      }
      await apiFetch("/api/integrations/google/import", {
        method: "POST",
        body: JSON.stringify({ api_key: apiKey, calendar_id: calendarId })
      });
      setMessage(calendarImportMessage, "Calendar imported.");
      await loadMonth();
      await loadDay();
    });

    aiBreakdownButton.addEventListener("click", async () => {
      setMessage(aiMessage, "");
      const description = aiInput.value.trim();
      if (!description) {
        setMessage(aiMessage, "Add a project description first.", "error");
        return;
      }
      const response = await apiFetch("/api/ai/breakdown", {
        method: "POST",
        body: JSON.stringify({ description })
      });
      const tasks = response.tasks || [];
      if (!tasks.length) {
        setMessage(aiMessage, "No tasks generated.", "error");
        return;
      }
      const payload = tasks.map((task) => ({
        title: task.title,
        company: document.querySelector("#task-company").value.trim(),
        project: document.querySelector("#task-project").value.trim(),
        project_id: document.querySelector("#task-project-id").value || null,
        task_date: dayPicker.value || todayISO,
        estimated_hours: task.estimated_hours || 1.5,
        priority_level: Number(document.querySelector("#task-priority").value) || 2,
        deadline_type: document.querySelector("#task-deadline-type").value || null,
        deadline_date: document.querySelector("#task-deadline-date").value || null,
        dependencies: [],
        status: "planned"
      }));
      await apiFetch("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
      aiInput.value = "";
      setMessage(aiMessage, `Generated ${payload.length} task(s).`);
      await loadMonth();
      await loadDay();
    });

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        renderApp(session.user);
      }
      if (event === "SIGNED_OUT") {
        renderSignedOut();
      }
    });

    handleAuth();
  });

  function parseBulkLine(line) {
    const milestone = line.toLowerCase().includes("#milestone");
    let cleaned = line.replace(/#milestone/gi, "").trim();
    cleaned = cleaned.replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ");
    let estimatedHours = null;
    const estimateMatch = cleaned.match(/(?:^|\s)est\s*=\s*([0-9]*\.?[0-9]+)\s*h?/i);
    if (estimateMatch) {
      estimatedHours = Number(estimateMatch[1]);
      cleaned = cleaned.replace(estimateMatch[0], "").trim();
    }
    const separatorRegex = /\s+\|\s+|\s+_\s+|\s*::\s*|\t+| {2,}/;
    let parts = cleaned
      .split(separatorRegex)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2) return null;
    const datePart = parts[0];
    const [dateValue, timeRange] = datePart.split(" ").filter(Boolean);
    if (!dateValue || Number.isNaN(Date.parse(dateValue))) {
      return null;
    }
    let startTime = null;
    let endTime = null;
    if (timeRange && timeRange.includes("-")) {
      const [start, end] = timeRange.split("-");
      startTime = start;
      endTime = end;
    }
    let company = "";
    let project = "";
    let title = "";
    if (parts.length >= 4) {
      company = parts[1];
      project = parts[2];
      title = parts.slice(3).join(" ");
    } else if (parts.length === 3) {
      company = parts[1];
      title = parts[2];
    } else if (parts.length === 2) {
      title = parts[1];
    }
    if (!title || title === "::") {
      const fallback = cleaned.replace(datePart, "").trim();
      const fallbackParts = fallback.split(separatorRegex).filter(Boolean);
      if (fallbackParts.length >= 3) {
        company = fallbackParts[0];
        project = fallbackParts[1];
        title = fallbackParts.slice(2).join(" ").trim();
      } else if (fallbackParts.length === 2) {
        company = fallbackParts[0];
        title = fallbackParts[1].trim();
      } else if (fallback) {
        title = fallback;
      }
    }
    return {
      title,
      company,
      project,
      task_date: dateValue,
      start_time: startTime,
      end_time: endTime,
      is_milestone: milestone,
      estimated_hours: Number.isFinite(estimatedHours) ? estimatedHours : null,
      status: "planned",
      priority_level: 2,
      deadline_type: null,
      deadline_date: null,
      dependencies: []
    };
  }
</script>

<header class="app-header">
  <div>
    <h1>Cal-Ender</h1>
    <p class="subtitle">Plan tasks, map milestones, balance projects.</p>
  </div>
  <div class="user-info">
    <span id="user-email">Not signed in</span>
    <button id="sign-out" class="secondary" type="button" hidden>Sign out</button>
  </div>
</header>

<main class="app">
  <section id="auth-section" class="panel">
    <h2>Sign in</h2>
    <div class="form-grid">
      <label>
        Email
        <input id="auth-email" type="email" autocomplete="email" />
      </label>
      <label>
        Password
        <input id="auth-password" type="password" autocomplete="current-password" />
      </label>
    </div>
    <div class="actions">
      <button id="sign-in" type="button">Sign in</button>
      <button id="sign-up" class="secondary" type="button">Create account</button>
    </div>
    <p class="helper" id="auth-message"></p>
  </section>

  <section id="app-section" class="panel" hidden>
    <div class="tabs">
      <button class="tab-button active" data-tab-target="calendar-tab" type="button">Calendar</button>
      <button class="tab-button" data-tab-target="today-tab" type="button">Today</button>
      <button class="tab-button" data-tab-target="add-tab" type="button">Add Tasks</button>
    </div>

    <div class="toolbar">
      <div class="toolbar-group">
        <label>
          Day view
          <input id="day-picker" type="date" />
        </label>
        <button id="refresh-day" class="secondary" type="button">Refresh</button>
        <button id="auto-schedule" type="button">Auto schedule</button>
      </div>
      <div class="toolbar-group focus-controls">
        <label class="checkbox">
          <input id="focus-toggle" type="checkbox" />
          High Focus
        </label>
        <label>
          Focus project
          <select id="focus-project"></select>
        </label>
        <span class="stat" id="focus-status">Neutral</span>
      </div>
      <div class="toolbar-group">
        <span class="stat" id="day-total">0 tasks</span>
        <span class="stat" id="day-duration">0h</span>
      </div>
    </div>

    <section id="calendar-tab" class="tab-content active" data-tab-content>
      <div class="layout">
        <section class="card">
          <div class="month-header">
            <button id="month-prev" class="secondary" type="button">Prev</button>
            <h3 id="month-label">Month</h3>
            <button id="month-next" class="secondary" type="button">Next</button>
          </div>
          <div id="month-grid" class="calendar-grid"></div>
        </section>

        <section class="card day-view-card" id="day-view-card">
          <h3 id="selected-day-label">Day view</h3>
          <div id="day-map" class="timeline"></div>
          <h3>Fixed events</h3>
          <div id="fixed-events"></div>
          <h3>Milestones</h3>
          <div id="milestones"></div>
          <h3>Workload balance</h3>
          <div id="balance"></div>
        </section>
      </div>
    </section>

    <section id="today-tab" class="tab-content" data-tab-content hidden>
      <div class="layout">
        <section class="card">
          <h3>Today: hourly focus</h3>
          <div id="today-map" class="hourly"></div>
        </section>
        <section class="card">
          <h3>Today summary</h3>
          <div id="today-summary"></div>
        </section>
      </div>
    </section>

    <section id="add-tab" class="tab-content" data-tab-content hidden>
      <div class="layout">
        <section class="card">
          <h3>Add a single task</h3>
          <form id="task-form">
            <div class="form-grid">
              <label>
                Task title
                <input id="task-title" type="text" required />
              </label>
              <label>
                Project
                <select id="task-project-id"></select>
              </label>
              <label>
                Company
                <input id="task-company" type="text" placeholder="MBC" />
              </label>
              <label>
                Project
                <input id="task-project" type="text" placeholder="HighLevel integration" />
              </label>
              <label>
                Day
                <input id="task-date" type="date" required />
              </label>
              <label>
                Start
                <input id="task-start" type="time" />
              </label>
              <label>
                End
                <input id="task-end" type="time" />
              </label>
              <label>
                Est. hours
                <input id="task-hours" type="number" step="0.25" min="0" placeholder="2.5" />
              </label>
              <label>
                Priority (1-3)
                <input id="task-priority" type="number" min="1" max="3" value="2" />
              </label>
              <label>
                Deadline type
                <select id="task-deadline-type">
                  <option value="">None</option>
                  <option value="soft">Soft</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                Deadline date
                <input id="task-deadline-date" type="date" />
              </label>
              <label>
                Dependencies (task IDs, comma separated)
                <input id="task-dependencies" type="text" placeholder="uuid, uuid" />
              </label>
            </div>
            <label class="checkbox">
              <input id="task-milestone" type="checkbox" />
              Milestone
            </label>
            <label>
              Notes
              <textarea id="task-notes" rows="3" placeholder="Optional details"></textarea>
            </label>
            <div class="actions">
              <button type="submit">Add task</button>
            </div>
            <p class="helper" id="task-message"></p>
          </form>
        </section>

        <section class="card">
          <h3>Bulk import tasks</h3>
          <p class="helper">
            Format: <code>YYYY-MM-DD | Company | Project | Title #milestone est=2.5</code>
            <span class="helper">Separators: |  _  ::  tab, or 2+ spaces. Line breaks: newline or ;;.</span>
          </p>
          <textarea id="bulk-input" rows="8" placeholder="Add one task per line"></textarea>
          <div class="actions">
            <button id="bulk-import" type="button">Import tasks</button>
          </div>
          <p class="helper" id="bulk-message"></p>
        </section>

        <section class="card">
          <h3>Add a project</h3>
          <form id="project-form">
            <div class="form-grid">
              <label>
                Project title
                <input id="project-title" type="text" required />
              </label>
              <label>
                Description
                <textarea id="project-description" rows="2"></textarea>
              </label>
              <label>
                Priority (1-3)
                <input id="project-priority" type="number" min="1" max="3" value="2" />
              </label>
              <label>
                Deadline type
                <select id="project-deadline-type">
                  <option value="">None</option>
                  <option value="soft">Soft</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>
                Deadline date
                <input id="project-deadline-date" type="date" />
              </label>
            </div>
            <div class="actions">
              <button type="submit">Add project</button>
            </div>
            <p class="helper" id="project-message"></p>
          </form>
        </section>

        <section class="card">
          <h3>Add a fixed event</h3>
          <form id="event-form">
            <div class="form-grid">
              <label>
                Title
                <input id="event-title" type="text" required />
              </label>
              <label>
                Day
                <input id="event-date" type="date" required />
              </label>
              <label>
                Start
                <input id="event-start" type="time" required />
              </label>
              <label>
                End
                <input id="event-end" type="time" required />
              </label>
            </div>
            <div class="actions">
              <button type="submit">Add event</button>
            </div>
            <p class="helper" id="event-message"></p>
          </form>
        </section>

        <section class="card">
          <h3>Work hours</h3>
          <form id="work-hours-form">
            <div class="form-grid">
              <label>
                Start
                <input id="work-start" type="time" value="09:00" />
              </label>
              <label>
                End
                <input id="work-end" type="time" value="17:00" />
              </label>
              <label>
                Break length (minutes)
                <input id="break-length" type="number" min="5" max="60" value="15" />
              </label>
            </div>
            <div class="actions">
              <button type="submit">Save work hours</button>
            </div>
            <p class="helper" id="work-hours-message"></p>
          </form>
        </section>

        <section class="card">
          <h3>External calendar (read-only)</h3>
          <p class="helper">
            Use a public Google Calendar with an API key to import fixed events.
          </p>
          <form id="calendar-import-form">
            <div class="form-grid">
              <label>
                Google API key
                <input id="google-api-key" type="text" />
              </label>
              <label>
                Calendar ID
                <input id="google-calendar-id" type="text" placeholder="example@group.calendar.google.com" />
              </label>
            </div>
            <div class="actions">
              <button type="submit">Import events</button>
            </div>
            <p class="helper" id="calendar-import-message"></p>
          </form>
        </section>

        <section class="card">
          <h3>AI task breakdown (lightweight)</h3>
          <p class="helper">Paste a project description and get a draft task list.</p>
          <textarea id="ai-input" rows="6" placeholder="Describe the project..."></textarea>
          <div class="actions">
            <button id="ai-breakdown" type="button">Generate tasks</button>
          </div>
          <p class="helper" id="ai-message"></p>
        </section>
      </div>
    </section>
  </section>
</main>
