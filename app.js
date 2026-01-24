import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
const dayViewCard = document.querySelector("#day-view-card");

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
const BREAK_MINUTES = 15;
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
  "#fbbf24",
];

let focusEnabled = false;
let focusKey = "";
let currentMonth = new Date(`${todayISO}T00:00:00`);
currentMonth.setDate(1);
let todayTaskIndex = new Map();

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

function getNowTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(
    2,
    "0"
  )}`;
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
  const project = task.project || "General";
  return `${company} · ${project}`;
}

function getTaskStatus(task) {
  if (task.status) return task.status;
  if (task.completed_at || task.actual_end) return "completed";
  return "planned";
}

function getProjectColor(task) {
  const key = getProjectKey(task);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % PROJECT_COLORS.length;
  }
  return PROJECT_COLORS[hash];
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
    refresh_token: refreshToken,
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
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      setMessage(authMessage, updateError.message, "error");
    } else {
      setMessage(authMessage, "Password updated. You can continue.", "default");
    }
  }

  return true;
}

async function handleAuth() {
  const recovered = await handleRecoveryFromHash();
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
    status: "planned",
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
    startTime = normalizeTime(start);
    endTime = normalizeTime(end);
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
    user_id: userId,
    title,
    company,
    project,
    task_date: dateValue,
    start_time: startTime,
    end_time: endTime,
    is_milestone: milestone,
    estimated_hours: Number.isFinite(estimatedHours) ? estimatedHours : null,
    status: "planned",
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
  await rollOverOverdueTasks(user);
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
  const tasks = data ?? [];
  const adjusted = await adjustOverrunIfNeeded(user, tasks, day);
  if (adjusted) {
    await loadDay();
    return;
  }
  renderDay(tasks);
  await loadToday();
}

async function rollOverOverdueTasks(user) {
  const targetDay = getNextWeekday(todayISO);
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .lt("task_date", todayISO);
  if (error) {
    setMessage(taskMessage, error.message, "error");
    return;
  }
  const overdue = (data ?? []).filter((task) => getTaskStatus(task) !== "completed");
  if (!overdue.length) return;

  for (const task of overdue) {
    const { error: updateError } = await supabase
      .from("tasks")
      .update({ task_date: targetDay })
      .eq("id", task.id);
    if (updateError) {
      setMessage(taskMessage, updateError.message, "error");
      return;
    }
  }
}

async function adjustOverrunIfNeeded(user, tasks, day) {
  if (day !== todayISO) return false;
  const inProgress = tasks.find(
    (task) =>
      getTaskStatus(task) === "in_progress" && task.start_time && task.end_time
  );
  if (!inProgress) return false;
  const nowMinutes = toMinutes(getNowTimeString());
  const scheduledEnd = toMinutes(inProgress.end_time);
  if (nowMinutes <= scheduledEnd) return false;

  const overrun = nowMinutes - scheduledEnd;
  const updates = [];

  updates.push({
    id: inProgress.id,
    end_time: toTimeString(nowMinutes),
  });

  tasks
    .filter(
      (task) =>
        task.id !== inProgress.id &&
        getTaskStatus(task) !== "completed" &&
        task.start_time &&
        task.end_time &&
        toMinutes(task.start_time) >= scheduledEnd
    )
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
    .forEach((task) => {
      const start = toMinutes(task.start_time) + overrun;
      const end = toMinutes(task.end_time) + overrun;
      updates.push({
        id: task.id,
        start_time: toTimeString(start),
        end_time: toTimeString(end),
      });
    });

  for (const update of updates) {
    const { error } = await supabase.from("tasks").update(update).eq("id", update.id);
    if (error) {
      setMessage(taskMessage, error.message, "error");
      return false;
    }
  }

  return updates.length > 0;
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
  const offset = firstDay.getDay();

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
    const indicatorCount = Math.min(items.length, 3);
    const indicators = items
      .slice(0, indicatorCount)
      .map((task) => {
        const color = getProjectColor(task);
        return `<span class="indicator-dot" style="background:${color}"></span>`;
      })
      .join("");
    cell.innerHTML = `
      <div class="calendar-cell-top">
        <span class="day-number">${day}</span>
        ${items.length ? `<span class="day-count">${items.length}</span>` : ""}
      </div>
      <div class="calendar-cell-bottom">
        <span class="day-stats">${minutesToDuration(scheduledMinutes)}</span>
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
  const deduped = dedupeOverlaps(tasks);
  renderTimeline(deduped);
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

function renderToday(tasks) {
  renderTodayBlocks(tasks);
  const totalMinutes = tasks.reduce((sum, task) => {
    if (!task.start_time || !task.end_time) return sum;
    return sum + Math.max(toMinutes(task.end_time) - toMinutes(task.start_time), 0);
  }, 0);
  todaySummary.innerHTML = `
    <div class="balance-list">
      <div class="balance-item"><span>${tasks.length} tasks</span><span>${minutesToDuration(totalMinutes)}</span></div>
      <div class="balance-item"><span>Milestones</span><span>${tasks.filter((task) => task.is_milestone).length}</span></div>
      <div class="balance-item"><span>Completed</span><span>${tasks.filter((task) => getTaskStatus(task) === "completed").length}</span></div>
    </div>
  `;
}

function renderTodayBlocks(tasks) {
  const cleaned = dedupeOverlaps(tasks);
  const unscheduled = tasks.filter((task) => !task.start_time || !task.end_time);

  todayMap.innerHTML = "";
  todayTaskIndex = new Map();
  tasks.forEach((task) => todayTaskIndex.set(task.id, task));
  if (!cleaned.length && !unscheduled.length) {
    todayMap.innerHTML = `<p class="empty">No tasks scheduled today.</p>`;
    return;
  }

  const list = document.createElement("div");
  list.className = "today-list";

  let lastEnd = null;
  cleaned.forEach((task, index) => {
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
    lastEnd = end;

    const nextTask = cleaned[index + 1];
    if (nextTask) {
      const nextStart = toMinutes(nextTask.start_time);
      const breakStart = end;
      const breakEnd = end + BREAK_MINUTES;
      const breakItem = document.createElement("div");
      breakItem.className = "today-break";
      if (nextStart < breakEnd) {
        breakItem.classList.add("break-missing");
        breakItem.textContent = `Break ${BREAK_MINUTES}m needed (next ${toTimeString(
          nextStart
        )})`;
      } else {
        breakItem.textContent = `Break ${BREAK_MINUTES}m (${toTimeString(
          breakStart
        )} - ${toTimeString(breakEnd)})`;
      }
      list.appendChild(breakItem);
    }
  });

  if (unscheduled.length) {
    const block = document.createElement("div");
    block.className = "today-unscheduled";
    block.innerHTML = `
      <div class="today-time">Unscheduled</div>
      <div class="today-title">
        ${unscheduled.map((task) => escapeHtml(task.title)).join(", ")}
      </div>
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
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "in_progress",
      actual_start: nowTime,
    })
    .eq("id", taskId);
  if (error) {
    setMessage(taskMessage, error.message, "error");
    return;
  }
  await loadDay();
  await loadToday();
}

async function markTaskStopped(taskId) {
  const nowTime = getNowTimeString();
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "planned",
      actual_end: nowTime,
    })
    .eq("id", taskId);
  if (error) {
    setMessage(taskMessage, error.message, "error");
    return;
  }
  await loadDay();
  await loadToday();
}

async function markTaskFinished(taskId) {
  const nowTime = getNowTimeString();
  const nowDate = new Date().toISOString();
  const { error } = await supabase
    .from("tasks")
    .update({
      status: "completed",
      actual_end: nowTime,
      completed_at: nowDate,
      end_time: nowTime,
    })
    .eq("id", taskId);
  if (error) {
    setMessage(taskMessage, error.message, "error");
    return;
  }
  await loadDay();
  await loadToday();
}

async function rescheduleTask(task) {
  const newDate = getNextWorkdayDate(task.task_date);
  const updates = {
    task_date: newDate,
  };
  if (task.start_time && task.end_time) {
    updates.start_time = task.start_time;
    updates.end_time = task.end_time;
  }
  if (getTaskStatus(task) === "in_progress") {
    updates.status = "planned";
  }
  const { error } = await supabase.from("tasks").update(updates).eq("id", task.id);
  if (error) {
    setMessage(taskMessage, error.message, "error");
    return;
  }
  await loadDay();
  await loadToday();
  await loadMonth();
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
        <button class="secondary" data-action="delete" data-task-id="${task.id}">Delete</button>
      </div>
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
      const action = button.dataset.action;
      if (action === "delete") {
        const { error } = await supabase.from("tasks").delete().eq("id", button.dataset.taskId);
        if (error) {
          dayMap.insertAdjacentHTML(
            "beforeend",
            `<p class="empty danger">${error.message}</p>`
          );
        } else {
          loadDay();
        }
        return;
      }
      if (action === "start") {
        await markTaskStarted(button.dataset.taskId);
        return;
      }
      if (action === "finish") {
        await markTaskFinished(button.dataset.taskId);
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
    ? tasks.filter((task) => task.estimated_hours && getTaskStatus(task) !== "completed")
    : tasks.filter(
        (task) =>
          (!task.start_time || !task.end_time) &&
          task.estimated_hours &&
          getTaskStatus(task) !== "completed"
      );
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
            status: "planned",
          });
        }

        current.remainingMinutes -= chunkMinutes;
        slotCursor = slotEnd;
        if (slotCursor + BREAK_MINUTES <= slot[1]) {
          slotCursor += BREAK_MINUTES;
        } else {
          slotCursor = slot[1];
        }

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
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => {
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
