import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authSection = document.querySelector("#auth-section");
const appSection = document.querySelector("#app-section");
const authMessage = document.querySelector("#auth-message");
const userEmail = document.querySelector("#user-email");
const signOutButton = document.querySelector("#sign-out");

const dayPicker = document.querySelector("#day-picker");
const refreshButton = document.querySelector("#refresh-day");
const autoScheduleButton = document.querySelector("#auto-schedule");
const dayTotal = document.querySelector("#day-total");
const dayDuration = document.querySelector("#day-duration");
const focusToggle = document.querySelector("#focus-toggle");
const focusProject = document.querySelector("#focus-project");
const focusStatus = document.querySelector("#focus-status");
const selectedDayLabel = document.querySelector("#selected-day-label");

const taskForm = document.querySelector("#task-form");
const taskMessage = document.querySelector("#task-message");
const bulkInput = document.querySelector("#bulk-input");
const bulkMessage = document.querySelector("#bulk-message");

const dayMap = document.querySelector("#day-map");
const monthGrid = document.querySelector("#month-grid");
const monthPrev = document.querySelector("#month-prev");
const monthNext = document.querySelector("#month-next");
const monthLabel = document.querySelector("#month-label");
const milestonesEl = document.querySelector("#milestones");
const balanceEl = document.querySelector("#balance");
const todayMap = document.querySelector("#today-map");
const todaySummary = document.querySelector("#today-summary");

const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabContents = document.querySelectorAll("[data-tab-content]");

const signInButton = document.querySelector("#sign-in");
const signUpButton = document.querySelector("#sign-up");

const todayISO = new Date().toISOString().slice(0, 10);
dayPicker.value = todayISO;
document.querySelector("#task-date").value = todayISO;
selectedDayLabel.textContent = `Day view: ${todayISO}`;

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

const WORK_START = 9 * 60;
const WORK_END = 17 * 60;
const AUTO_CONT_MARKER = "[auto-cont]";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let focusEnabled = false;
let focusKey = "";
let currentMonth = new Date(`${todayISO}T00:00:00`);
currentMonth.setDate(1);

function formatHours(hoursValue) {
  if (!hoursValue) return "";
  const rounded = Math.round(hoursValue * 100) / 100;
  return `${rounded}h`;
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

function getProjectKey(task) {
  const company = task.company || "Unassigned";
  const project = task.project || "General";
  return `${company} · ${project}`;
}

function updateFocusStatus() {
  if (!focusEnabled || !focusKey) {
    focusStatus.textContent = "Neutral";
    return;
  }
  focusStatus.textContent = `High Focus: ${focusKey}`;
}

function setActiveTab(tabId) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTarget === tabId);
  });
  tabContents.forEach((section) => {
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

function getCurrentUser() {
  return supabase.auth.getUser().then(({ data }) => data.user);
}

async function handleAuth() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (session) {
    await renderApp(session.user);
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

signInButton.addEventListener("click", () => {
  const email = document.querySelector("#auth-email").value.trim();
  const password = document.querySelector("#auth-password").value;
  signIn(email, password, "signin");
});

signUpButton.addEventListener("click", () => {
  const email = document.querySelector("#auth-email").value.trim();
  const password = document.querySelector("#auth-password").value;
  signIn(email, password, "signup");
});

signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  renderSignedOut();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tabTarget);
  });
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
  const user = await getCurrentUser();
  if (!user) {
    setMessage(taskMessage, "Please sign in first.", "error");
    return;
  }

  const payload = {
    user_id: user.id,
    title: document.querySelector("#task-title").value.trim(),
    company: document.querySelector("#task-company").value.trim(),
    project: document.querySelector("#task-project").value.trim(),
    task_date: document.querySelector("#task-date").value,
    start_time: document.querySelector("#task-start").value || null,
    end_time: document.querySelector("#task-end").value || null,
    is_milestone: document.querySelector("#task-milestone").checked,
    estimated_hours: parseFloat(document.querySelector("#task-hours").value) || null,
    notes: document.querySelector("#task-notes").value.trim(),
  };

  if (!payload.title || !payload.task_date) {
    setMessage(taskMessage, "Title and day are required.", "error");
    return;
  }

  const { error } = await supabase.from("tasks").insert(payload);
  if (error) {
    setMessage(taskMessage, error.message, "error");
    return;
  }

  taskForm.reset();
  document.querySelector("#task-date").value = dayPicker.value;
  setMessage(taskMessage, "Task added.");
  await loadDay();
  await loadMonth();
  await loadToday();
});

document.querySelector("#bulk-import").addEventListener("click", async () => {
  setMessage(bulkMessage, "");
  const user = await getCurrentUser();
  if (!user) {
    setMessage(bulkMessage, "Please sign in first.", "error");
    return;
  }
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
    const parsed = parseBulkLine(line, user.id);
    if (parsed) tasks.push(parsed);
  }
  if (!tasks.length) {
    setMessage(bulkMessage, "No valid lines found. Check the format.", "error");
    return;
  }
  const { error } = await supabase.from("tasks").insert(tasks);
  if (error) {
    setMessage(bulkMessage, error.message, "error");
    return;
  }
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

function parseBulkLine(line, userId) {
  const milestone = line.toLowerCase().includes("#milestone");
  let cleaned = line.replace(/#milestone/gi, "").trim();
  cleaned = cleaned.replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ");
  let estimatedHours = null;
  const estimateMatch = cleaned.match(/(?:^|\s)est\s*=\s*([0-9]*\.?[0-9]+)\s*h?/i);
  if (estimateMatch) {
    estimatedHours = Number(estimateMatch[1]);
    cleaned = cleaned.replace(estimateMatch[0], "").trim();
  }
  const parts = cleaned
    .split(/\s+\|\s+|\s*;\s*|\s+_\s+|\t+| {2,}/)
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
    startTime = normalizeTime(start);
    endTime = normalizeTime(end);
  }
  const title = parts[parts.length - 1];
  const company = parts.length >= 3 ? parts[1] : "";
  const project = parts.length >= 4 ? parts[2] : "";
  return {
    user_id: userId,
    title,
    company,
    project,
    task_date: dateValue,
    start_time: startTime,
    end_time: endTime,
    is_milestone: milestone,
    estimated_hours: Number.isFinite(estimatedHours) ? estimatedHours : null,
  };
}

function normalizeTime(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{3,4}$/.test(trimmed)) {
    const padded = trimmed.padStart(4, "0");
    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }
  return null;
}

async function loadDay() {
  const user = await getCurrentUser();
  if (!user) return;
  const day = dayPicker.value || todayISO;
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("task_date", day)
    .order("start_time", { ascending: true });
  if (error) {
    dayMap.innerHTML = `<p class="empty danger">${error.message}</p>`;
    return;
  }
  renderDay(data ?? []);
  await loadToday();
}

async function loadMonth() {
  const user = await getCurrentUser();
  if (!user) return;
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
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .gte("task_date", startDay)
    .lte("task_date", endDay)
    .order("task_date", { ascending: true });

  if (error) {
    monthGrid.innerHTML = `<p class="empty danger">${error.message}</p>`;
    return;
  }

  const tasks = data ?? [];
  syncFocusOptions(tasks);
  renderMonthCalendar(tasks);
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

function renderMonthCalendar(tasks) {
  const year = currentMonth.getFullYear();
  const monthIndex = currentMonth.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;

  const tasksByDate = {};
  tasks.forEach((task) => {
    if (!tasksByDate[task.task_date]) {
      tasksByDate[task.task_date] = [];
    }
    tasksByDate[task.task_date].push(task);
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
    const scheduledMinutes = items.reduce((sum, task) => {
      if (!task.start_time || !task.end_time) return sum;
      return sum + Math.max(toMinutes(task.end_time) - toMinutes(task.start_time), 0);
    }, 0);
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    if (dayIso === todayISO) {
      cell.classList.add("today");
    }
    if ((dayPicker.value || todayISO) === dayIso) {
      cell.classList.add("selected");
    }
    cell.innerHTML = `
      <span class="day-number">${day}</span>
      <span class="day-stats">${items.length} tasks</span>
      <span class="day-stats">${minutesToDuration(scheduledMinutes)}</span>
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

async function loadToday() {
  const user = await getCurrentUser();
  if (!user) return;
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("task_date", todayISO)
    .order("start_time", { ascending: true });
  if (error) {
    todayMap.innerHTML = `<p class="empty danger">${error.message}</p>`;
    return;
  }
  renderToday(data ?? []);
}

function renderDay(tasks) {
  renderTimeline(tasks);
  renderMilestones(tasks);
  renderBalance(tasks);
  const totalMinutes = tasks.reduce((sum, task) => {
    if (!task.start_time || !task.end_time) return sum;
    const diff = toMinutes(task.end_time) - toMinutes(task.start_time);
    return sum + Math.max(diff, 0);
  }, 0);
  dayTotal.textContent = `${tasks.length} tasks`;
  dayDuration.textContent = minutesToDuration(totalMinutes);
  selectedDayLabel.textContent = `Day view: ${dayPicker.value || todayISO}`;
}

function renderToday(tasks) {
  renderHourlyBreakdown(tasks);
  const totalMinutes = tasks.reduce((sum, task) => {
    if (!task.start_time || !task.end_time) return sum;
    return sum + Math.max(toMinutes(task.end_time) - toMinutes(task.start_time), 0);
  }, 0);
  todaySummary.innerHTML = `
    <div class="balance-list">
      <div class="balance-item"><span>${tasks.length} tasks</span><span>${minutesToDuration(totalMinutes)}</span></div>
      <div class="balance-item"><span>Milestones</span><span>${tasks.filter((task) => task.is_milestone).length}</span></div>
    </div>
  `;
}

function renderHourlyBreakdown(tasks) {
  const startHour = 9;
  const endHour = 17;
  todayMap.innerHTML = "";
  for (let hour = startHour; hour < endHour; hour += 1) {
    const slotStart = hour * 60;
    const slotEnd = (hour + 1) * 60;
    const matches = tasks.filter((task) => {
      if (!task.start_time || !task.end_time) return false;
      const start = toMinutes(task.start_time);
      const end = toMinutes(task.end_time);
      return start < slotEnd && end > slotStart;
    });
    const row = document.createElement("div");
    row.className = "hour-row";
    const label = document.createElement("div");
    label.className = "hour-label";
    label.textContent = `${String(hour).padStart(2, "0")}:00`;
    const list = document.createElement("div");
    list.className = "hour-tasks";
    if (!matches.length) {
      list.innerHTML = `<span class="empty">Open focus block</span>`;
    } else {
      matches.forEach((task) => {
        const item = document.createElement("div");
        item.className = "hour-task";
        if (focusEnabled && focusKey && getProjectKey(task) === focusKey) {
          item.classList.add("focused");
        }
        item.textContent = `${task.title} (${formatTimeRange(task.start_time, task.end_time)})`;
        list.appendChild(item);
      });
    }
    row.append(label, list);
    todayMap.appendChild(row);
  }

  const unscheduled = tasks.filter((task) => !task.start_time || !task.end_time);
  if (unscheduled.length) {
    const row = document.createElement("div");
    row.className = "hour-row";
    row.innerHTML = `
      <div class="hour-label">Unscheduled</div>
      <div class="hour-tasks">
        ${unscheduled.map((task) => `<div class="hour-task">${escapeHtml(task.title)}</div>`).join("")}
      </div>
    `;
    todayMap.appendChild(row);
  }
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
    if (focusEnabled && focusKey && getProjectKey(task) === focusKey) {
      item.classList.add("focused");
    }
    const header = document.createElement("div");
    header.className = "task-header";
    header.innerHTML = `
      <strong>${escapeHtml(task.title)}</strong>
      <button class="secondary" data-task-id="${task.id}">Delete</button>
    `;
    const meta = document.createElement("div");
    meta.className = "task-meta";
    meta.innerHTML = `
      <span class="pill time">${formatTimeRange(task.start_time, task.end_time)}</span>
      ${task.company ? `<span class="pill company">${escapeHtml(task.company)}</span>` : ""}
      ${task.project ? `<span class="pill project">${escapeHtml(task.project)}</span>` : ""}
      ${task.estimated_hours ? `<span class="pill">Est ${formatHours(task.estimated_hours)}</span>` : ""}
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
      const { error } = await supabase.from("tasks").delete().eq("id", button.dataset.taskId);
      if (error) {
        dayMap.insertAdjacentHTML("beforeend", `<p class="empty danger">${error.message}</p>`);
      } else {
        loadDay();
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

async function autoSchedule() {
  const user = await getCurrentUser();
  if (!user) return;

  const startDay = getNextWeekday(dayPicker.value || todayISO);
  const allowReshuffle = focusEnabled && focusKey;
  if (allowReshuffle) {
    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("user_id", user.id)
      .ilike("notes", `%${AUTO_CONT_MARKER}%`);
    if (deleteError) {
      setMessage(taskMessage, deleteError.message, "error");
      return;
    }
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .gte("task_date", startDay)
    .order("created_at", { ascending: true });

  if (error) {
    setMessage(taskMessage, error.message, "error");
    return;
  }

  const tasks = data ?? [];
  const schedulable = allowReshuffle
    ? tasks.filter((task) => task.estimated_hours)
    : tasks.filter((task) => (!task.start_time || !task.end_time) && task.estimated_hours);
  if (!schedulable.length) {
    setMessage(taskMessage, "No estimated tasks to schedule.");
    return;
  }

  const busyByDate = new Map();
  const schedulableIds = new Set(schedulable.map((task) => task.id));
  tasks.forEach((task) => {
    if (!task.start_time || !task.end_time) return;
    if (schedulableIds.has(task.id)) return;
    const start = toMinutes(task.start_time);
    const end = toMinutes(task.end_time);
    if (!busyByDate.has(task.task_date)) {
      busyByDate.set(task.task_date, []);
    }
    busyByDate.get(task.task_date).push([start, end]);
  });

  const updates = [];
  const inserts = [];
  const useFocus = focusEnabled && focusKey;
  const focusQueue = [];
  const normalQueue = [];
  const orderedTasks = schedulable.slice();
  orderedTasks.forEach((task) => {
    const entry = {
      task,
      remainingMinutes: Math.ceil(task.estimated_hours * 60),
      isFirstSegment: true,
    };
    if (useFocus && getProjectKey(task) === focusKey) {
      focusQueue.push(entry);
    } else {
      normalQueue.push(entry);
    }
  });
  const CHUNK_MINUTES = useFocus ? 120 : 90;
  let focusBurst = useFocus ? 2 : 0;
  let cursorDate = startDay;

  while (focusQueue.length || normalQueue.length) {
    cursorDate = getNextWeekday(cursorDate);
    const busy = (busyByDate.get(cursorDate) ?? []).slice().sort((a, b) => a[0] - b[0]);
    const freeSlots = getFreeSlots(busy);

    if (!freeSlots.length) {
      cursorDate = addDays(cursorDate, 1);
      continue;
    }

    for (const slot of freeSlots) {
      let slotCursor = slot[0];
      while (slotCursor < slot[1] && (focusQueue.length || normalQueue.length)) {
        let current = null;
        if (useFocus && focusQueue.length && focusBurst > 0) {
          current = focusQueue.shift();
          focusBurst -= 1;
        } else if (normalQueue.length) {
          current = normalQueue.shift();
          focusBurst = useFocus ? 2 : 0;
        } else if (focusQueue.length) {
          current = focusQueue.shift();
          focusBurst = useFocus ? 1 : 0;
        } else {
          break;
        }
        const remainingInSlot = slot[1] - slotCursor;
        const chunkMinutes = Math.min(
          current.remainingMinutes,
          CHUNK_MINUTES,
          remainingInSlot
        );
        const slotEnd = slotCursor + chunkMinutes;

        if (current.isFirstSegment) {
          updates.push({
            id: current.task.id,
            task_date: cursorDate,
            start_time: toTimeString(slotCursor),
            end_time: toTimeString(slotEnd),
          });
          current.isFirstSegment = false;
        } else {
          const baseNotes = current.task.notes
            ? `${current.task.notes}\n${AUTO_CONT_MARKER}`
            : AUTO_CONT_MARKER;
          inserts.push({
            user_id: current.task.user_id,
            title: `${current.task.title} (cont.)`,
            company: current.task.company,
            project: current.task.project,
            notes: baseNotes,
            task_date: cursorDate,
            start_time: toTimeString(slotCursor),
            end_time: toTimeString(slotEnd),
            is_milestone: false,
            estimated_hours: chunkMinutes / 60,
          });
        }

        current.remainingMinutes -= chunkMinutes;
        slotCursor = slotEnd;

        if (current.remainingMinutes > 0) {
          if (useFocus && getProjectKey(current.task) === focusKey) {
            focusQueue.push(current);
          } else {
            normalQueue.push(current);
          }
        }
      }
    }

    busyByDate.set(cursorDate, busy);
    if (focusQueue.length || normalQueue.length) {
      cursorDate = addDays(cursorDate, 1);
    }
  }

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("tasks")
      .update(update)
      .eq("id", update.id);
    if (updateError) {
      setMessage(taskMessage, updateError.message, "error");
      return;
    }
  }

  if (inserts.length) {
    const { error: insertError } = await supabase.from("tasks").insert(inserts);
    if (insertError) {
      setMessage(taskMessage, insertError.message, "error");
      return;
    }
  }

  const scheduledCount = schedulable.length;
  const focusTag = useFocus ? ` with focus on ${focusKey}` : "";
  setMessage(taskMessage, `Auto-scheduled ${scheduledCount} task(s)${focusTag}.`);
  await loadDay();
  await loadMonth();
  await loadToday();
}

function getFreeSlots(busyIntervals) {
  if (!busyIntervals.length) return [[WORK_START, WORK_END]];
  const slots = [];
  let cursor = WORK_START;
  for (const [start, end] of busyIntervals) {
    if (start > cursor) {
      slots.push([cursor, Math.min(start, WORK_END)]);
    }
    cursor = Math.max(cursor, end);
    if (cursor >= WORK_END) break;
  }
  if (cursor < WORK_END) {
    slots.push([cursor, WORK_END]);
  }
  return slots.filter((slot) => slot[1] > slot[0]);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
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

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session?.user) {
    renderApp(session.user);
  }
  if (event === "SIGNED_OUT") {
    renderSignedOut();
  }
});

handleAuth();
