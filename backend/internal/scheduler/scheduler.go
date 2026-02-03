package scheduler

import (
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Task struct {
	ID             string   `json:"id"`
	UserID         string   `json:"user_id"`
	ProjectID      *string  `json:"project_id"`
	Title          string   `json:"title"`
	Company        string   `json:"company"`
	Project        string   `json:"project"`
	TaskDate       string   `json:"task_date"`
	StartTime      *string  `json:"start_time"`
	EndTime        *string  `json:"end_time"`
	EstimatedHours float64  `json:"estimated_hours"`
	PriorityLevel  int      `json:"priority_level"`
	DeadlineType   *string  `json:"deadline_type"`
	DeadlineDate   *string  `json:"deadline_date"`
	Dependencies   []string `json:"dependencies"`
	Status         string   `json:"status"`
	Notes          *string  `json:"notes"`
}

type Event struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	Title     string `json:"title"`
	EventDate string `json:"event_date"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

type Settings struct {
	WorkStartMinutes int
	WorkEndMinutes   int
	BreakMinutes     int
}

type Update struct {
	ID        string `json:"id"`
	TaskDate  string `json:"task_date"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

type Insert struct {
	UserID         string   `json:"user_id"`
	Title          string   `json:"title"`
	Company        string   `json:"company"`
	Project        string   `json:"project"`
	ProjectID      *string  `json:"project_id,omitempty"`
	Notes          *string  `json:"notes,omitempty"`
	TaskDate       string   `json:"task_date"`
	StartTime      string   `json:"start_time"`
	EndTime        string   `json:"end_time"`
	IsMilestone    bool     `json:"is_milestone"`
	EstimatedHours float64  `json:"estimated_hours"`
	Status         string   `json:"status"`
	Dependencies   []string `json:"dependencies"`
	PriorityLevel  int      `json:"priority_level"`
	DeadlineType   *string  `json:"deadline_type,omitempty"`
	DeadlineDate   *string  `json:"deadline_date,omitempty"`
}

type ScheduleResult struct {
	Updates []Update
	Inserts []Insert
}

const autoContMarker = "[auto-cont]"

func AutoSchedule(tasks []Task, events []Event, settings Settings, focusKey string, allowReshuffle bool) ScheduleResult {
	schedulable := make([]Task, 0)
	for _, task := range tasks {
		if task.EstimatedHours <= 0 || strings.EqualFold(task.Status, "completed") {
			continue
		}
		if allowReshuffle || task.StartTime == nil || task.EndTime == nil {
			schedulable = append(schedulable, task)
		}
	}
	if len(schedulable) == 0 {
		return ScheduleResult{}
	}

	busyByDate := map[string][][2]int{}
	schedulableIDs := map[string]bool{}
	for _, task := range schedulable {
		schedulableIDs[task.ID] = true
	}
	for _, task := range tasks {
		if task.StartTime == nil || task.EndTime == nil {
			continue
		}
		if schedulableIDs[task.ID] {
			continue
		}
		start := toMinutes(*task.StartTime)
		end := toMinutes(*task.EndTime)
		busyByDate[task.TaskDate] = append(busyByDate[task.TaskDate], [2]int{start, end})
	}
	for _, event := range events {
		start := toMinutes(event.StartTime)
		end := toMinutes(event.EndTime) + settings.BreakMinutes
		busyByDate[event.EventDate] = append(busyByDate[event.EventDate], [2]int{start, end})
	}

	ordered := buildSchedulingQueue(schedulable)
	updates := []Update{}
	inserts := []Insert{}

	type entry struct {
		task             Task
		remainingMinutes int
		isFirstSegment   bool
	}

	useFocus := focusKey != ""
	focusQueue := []entry{}
	normalQueue := []entry{}
	for _, task := range ordered {
		e := entry{
			task:             task,
			remainingMinutes: int(math.Ceil(task.EstimatedHours * 60)),
			isFirstSegment:   true,
		}
		if useFocus && getProjectKey(task) == focusKey {
			focusQueue = append(focusQueue, e)
		} else {
			normalQueue = append(normalQueue, e)
		}
	}

	chunkMinutes := 90
	if useFocus {
		chunkMinutes = 120
	}
	focusBurst := 0
	if useFocus {
		focusBurst = 2
	}
	cursorDate := nextWeekday(tasks[0].TaskDate)

	for len(focusQueue) > 0 || len(normalQueue) > 0 {
		cursorDate = nextWeekday(cursorDate)
		freeSlots := getFreeSlots(busyByDate[cursorDate], settings)
		if len(freeSlots) == 0 {
			cursorDate = addDays(cursorDate, 1)
			continue
		}

		for _, slot := range freeSlots {
			slotCursor := slot[0]
			for slotCursor < slot[1] && (len(focusQueue) > 0 || len(normalQueue) > 0) {
				var current entry
				if useFocus && len(focusQueue) > 0 && focusBurst > 0 {
					current = focusQueue[0]
					focusQueue = focusQueue[1:]
					focusBurst--
				} else if len(normalQueue) > 0 {
					current = normalQueue[0]
					normalQueue = normalQueue[1:]
					if useFocus {
						focusBurst = 2
					}
				} else if len(focusQueue) > 0 {
					current = focusQueue[0]
					focusQueue = focusQueue[1:]
					if useFocus {
						focusBurst = 1
					}
				} else {
					break
				}

				remainingInSlot := slot[1] - slotCursor
				chunk := minInt(current.remainingMinutes, chunkMinutes, remainingInSlot)
				slotEnd := slotCursor + chunk
				if current.isFirstSegment {
					updates = append(updates, Update{
						ID:        current.task.ID,
						TaskDate:  cursorDate,
						StartTime: toTimeString(slotCursor),
						EndTime:   toTimeString(slotEnd),
					})
					current.isFirstSegment = false
				} else {
					notes := autoContMarker
					if current.task.Notes != nil {
						notes = *current.task.Notes + "\n" + autoContMarker
					}
					inserts = append(inserts, Insert{
						UserID:         current.task.UserID,
						Title:          current.task.Title + " (cont.)",
						Company:        current.task.Company,
						Project:        current.task.Project,
						ProjectID:      current.task.ProjectID,
						Notes:          &notes,
						TaskDate:       cursorDate,
						StartTime:      toTimeString(slotCursor),
						EndTime:        toTimeString(slotEnd),
						IsMilestone:    false,
						EstimatedHours: float64(chunk) / 60,
						Status:         "planned",
						Dependencies:   []string{},
						PriorityLevel:  current.task.PriorityLevel,
						DeadlineType:   current.task.DeadlineType,
						DeadlineDate:   current.task.DeadlineDate,
					})
				}
				current.remainingMinutes -= chunk
				slotCursor = slotEnd
				if slotCursor+settings.BreakMinutes <= slot[1] {
					slotCursor += settings.BreakMinutes
				} else {
					slotCursor = slot[1]
				}

				if current.remainingMinutes > 0 {
					if useFocus && getProjectKey(current.task) == focusKey {
						focusQueue = append(focusQueue, current)
					} else {
						normalQueue = append(normalQueue, current)
					}
				}
			}
		}

		if len(focusQueue) > 0 || len(normalQueue) > 0 {
			cursorDate = addDays(cursorDate, 1)
		}
	}

	return ScheduleResult{Updates: updates, Inserts: inserts}
}

func getFreeSlots(busy [][2]int, settings Settings) [][2]int {
	if len(busy) == 0 {
		return [][2]int{{settings.WorkStartMinutes, settings.WorkEndMinutes}}
	}
	sort.Slice(busy, func(i, j int) bool {
		return busy[i][0] < busy[j][0]
	})
	slots := [][2]int{}
	cursor := settings.WorkStartMinutes
	for _, interval := range busy {
		if interval[0] > cursor {
			slots = append(slots, [2]int{cursor, minInt(interval[0], settings.WorkEndMinutes)})
		}
		cursor = maxInt(cursor, interval[1])
		if cursor >= settings.WorkEndMinutes {
			break
		}
	}
	if cursor < settings.WorkEndMinutes {
		slots = append(slots, [2]int{cursor, settings.WorkEndMinutes})
	}
	return slots
}

func ToMinutes(timeValue string) int {
	parts := strings.Split(timeValue, ":")
	if len(parts) < 2 {
		return 0
	}
	h := parseInt(parts[0])
	m := parseInt(parts[1])
	return h*60 + m
}

func toMinutes(timeValue string) int {
	return ToMinutes(timeValue)
}

func toTimeString(minutes int) string {
	h := minutes / 60
	m := minutes % 60
	return fmtTime(h) + ":" + fmtTime(m)
}

func fmtTime(value int) string {
	if value < 10 {
		return "0" + strconv.Itoa(value)
	}
	return strconv.Itoa(value)
}

func parseInt(value string) int {
	out, _ := strconv.Atoi(strings.TrimSpace(value))
	return out
}

func minInt(values ...int) int {
	if len(values) == 0 {
		return 0
	}
	min := values[0]
	for _, value := range values[1:] {
		if value < min {
			min = value
		}
	}
	return min
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func addDays(dateString string, days int) string {
	date, _ := time.Parse("2006-01-02", dateString)
	date = date.AddDate(0, 0, days)
	return date.Format("2006-01-02")
}

func nextWeekday(dateString string) string {
	date, _ := time.Parse("2006-01-02", dateString)
	for date.Weekday() == time.Saturday || date.Weekday() == time.Sunday {
		date = date.AddDate(0, 0, 1)
	}
	return date.Format("2006-01-02")
}

func getProjectKey(task Task) string {
	company := task.Company
	if company == "" {
		company = "Unassigned"
	}
	project := task.Project
	if project == "" {
		project = "General"
	}
	return company + " · " + project
}

func buildSchedulingQueue(tasks []Task) []Task {
	sorted := sortTasks(tasks)
	tasksByID := map[string]Task{}
	for _, task := range sorted {
		tasksByID[task.ID] = task
	}
	remaining := append([]Task{}, sorted...)
	queue := []Task{}
	scheduled := map[string]bool{}
	guard := 0
	for len(remaining) > 0 && guard < 10000 {
		guard++
		progress := false
		for i := 0; i < len(remaining); i++ {
			task := remaining[i]
			if dependenciesMet(task, scheduled, tasksByID) {
				queue = append(queue, task)
				scheduled[task.ID] = true
				remaining = append(remaining[:i], remaining[i+1:]...)
				i--
				progress = true
			}
		}
		if !progress {
			queue = append(queue, remaining...)
			break
		}
	}
	return queue
}

func dependenciesMet(task Task, scheduled map[string]bool, tasksByID map[string]Task) bool {
	if len(task.Dependencies) == 0 {
		return true
	}
	for _, depID := range task.Dependencies {
		dep, ok := tasksByID[depID]
		if !ok {
			continue
		}
		if dep.Status == "completed" {
			continue
		}
		if !scheduled[depID] {
			return false
		}
	}
	return true
}

func sortTasks(tasks []Task) []Task {
	out := append([]Task{}, tasks...)
	sort.Slice(out, func(i, j int) bool {
		if out[i].PriorityLevel != out[j].PriorityLevel {
			return out[i].PriorityLevel < out[j].PriorityLevel
		}
		iDeadline := deadlineScore(out[i])
		jDeadline := deadlineScore(out[j])
		if iDeadline != jDeadline {
			return iDeadline.Before(jDeadline)
		}
		if out[i].DeadlineType != nil && *out[i].DeadlineType == "hard" &&
			(out[j].DeadlineType == nil || *out[j].DeadlineType != "hard") {
			return true
		}
		if out[j].DeadlineType != nil && *out[j].DeadlineType == "hard" &&
			(out[i].DeadlineType == nil || *out[i].DeadlineType != "hard") {
			return false
		}
		return out[i].EstimatedHours < out[j].EstimatedHours
	})
	return out
}

func deadlineScore(task Task) time.Time {
	if task.DeadlineDate == nil || *task.DeadlineDate == "" {
		return time.Time{}
	}
	date, err := time.Parse("2006-01-02", *task.DeadlineDate)
	if err != nil {
		return time.Time{}
	}
	return date
}
