package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"cal-enderBE/internal/scheduler"
	"cal-enderBE/internal/supabase"

	"github.com/go-chi/chi/v5"
)

type App struct {
	Supabase *supabase.Client
}

type contextKey string

const userIDKey contextKey = "userID"

func (a *App) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "missing authorization", http.StatusUnauthorized)
			return
		}
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 {
			http.Error(w, "invalid authorization header", http.StatusUnauthorized)
			return
		}
		user, err := a.Supabase.GetUserFromToken(parts[1])
		if err != nil {
			http.Error(w, "invalid session", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, user.ID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func userIDFromContext(r *http.Request) string {
	value := r.Context().Value(userIDKey)
	if value == nil {
		return ""
	}
	return value.(string)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func (a *App) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *App) GetTasks(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	query := url.Values{}
	query.Set("select", "*")
	query.Set("user_id", fmt.Sprintf("eq.%s", userID))
	if date := r.URL.Query().Get("date"); date != "" {
		query.Set("task_date", fmt.Sprintf("eq.%s", date))
	}
	if start := r.URL.Query().Get("start"); start != "" {
		query.Set("task_date", fmt.Sprintf("gte.%s", start))
	}
	if end := r.URL.Query().Get("end"); end != "" {
		query.Set("task_date", fmt.Sprintf("lte.%s", end))
	}
	query.Set("order", "task_date.asc,start_time.asc")
	response, err := a.Supabase.Select("tasks", query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Write(response)
}

func (a *App) CreateTask(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	var payload any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	switch value := payload.(type) {
	case map[string]any:
		value["user_id"] = userID
		payload = value
	case []any:
		for _, item := range value {
			if entry, ok := item.(map[string]any); ok {
				entry["user_id"] = userID
			}
		}
		payload = value
	default:
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	response, err := a.Supabase.Insert("tasks", payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Write(response)
}

func (a *App) UpdateTask(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	taskID := chi.URLParam(r, "id")
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	payload["user_id"] = userID
	filter := fmt.Sprintf("id=eq.%s&user_id=eq.%s", taskID, userID)
	response, err := a.Supabase.Update("tasks", filter, payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if status, ok := payload["status"].(string); ok && status == "completed" {
		taskQuery := url.Values{}
		taskQuery.Set("select", "actual_start,end_time")
		taskQuery.Set("id", fmt.Sprintf("eq.%s", taskID))
		taskQuery.Set("user_id", fmt.Sprintf("eq.%s", userID))
		taskData, err := a.Supabase.Select("tasks", taskQuery)
		if err == nil {
			var rows []map[string]any
			json.Unmarshal(taskData, &rows)
			if len(rows) > 0 {
				now := time.Now().Format("15:04")
				_ = a.Supabase.Insert("behavioral_data", map[string]any{
					"user_id":         userID,
					"task_id":         taskID,
					"start_time":      rows[0]["actual_start"],
					"end_time":        now,
					"overrun_minutes": 0,
				})
			}
		}
	}
	w.Write(response)
}

func (a *App) DeleteTask(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	taskID := chi.URLParam(r, "id")
	filter := fmt.Sprintf("id=eq.%s&user_id=eq.%s", taskID, userID)
	if err := a.Supabase.Delete("tasks", filter); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (a *App) GetProjects(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	query := url.Values{}
	query.Set("select", "*")
	query.Set("user_id", fmt.Sprintf("eq.%s", userID))
	query.Set("order", "created_at.desc")
	response, err := a.Supabase.Select("projects", query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Write(response)
}

func (a *App) CreateProject(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	payload["user_id"] = userID
	response, err := a.Supabase.Insert("projects", payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Write(response)
}

func (a *App) GetEvents(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	query := url.Values{}
	query.Set("select", "*")
	query.Set("user_id", fmt.Sprintf("eq.%s", userID))
	if date := r.URL.Query().Get("date"); date != "" {
		query.Set("event_date", fmt.Sprintf("eq.%s", date))
	}
	if start := r.URL.Query().Get("start"); start != "" {
		query.Set("event_date", fmt.Sprintf("gte.%s", start))
	}
	if end := r.URL.Query().Get("end"); end != "" {
		query.Set("event_date", fmt.Sprintf("lte.%s", end))
	}
	query.Set("order", "event_date.asc,start_time.asc")
	response, err := a.Supabase.Select("calendar_events", query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Write(response)
}

func (a *App) CreateEvent(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	payload["user_id"] = userID
	response, err := a.Supabase.Insert("calendar_events", payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Write(response)
}

func (a *App) GetSettings(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	query := url.Values{}
	query.Set("select", "*")
	query.Set("user_id", fmt.Sprintf("eq.%s", userID))
	response, err := a.Supabase.Select("user_settings", query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Write(response)
}

func (a *App) SaveSettings(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	payload["user_id"] = userID
	response, err := a.Supabase.Upsert("user_settings", payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Write(response)
}

type scheduleRequest struct {
	FocusKey       string `json:"focus_key"`
	AllowReshuffle bool   `json:"allow_reshuffle"`
	StartDay       string `json:"start_day"`
}

func (a *App) AutoSchedule(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	var request scheduleRequest
	json.NewDecoder(r.Body).Decode(&request)
	if request.StartDay == "" {
		request.StartDay = time.Now().Format("2006-01-02")
	}

	taskQuery := url.Values{}
	taskQuery.Set("select", "*")
	taskQuery.Set("user_id", fmt.Sprintf("eq.%s", userID))
	taskQuery.Set("task_date", fmt.Sprintf("gte.%s", request.StartDay))
	taskData, err := a.Supabase.Select("tasks", taskQuery)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	var tasks []scheduler.Task
	if err := json.Unmarshal(taskData, &tasks); err != nil {
		http.Error(w, "invalid tasks payload", http.StatusBadGateway)
		return
	}

	eventQuery := url.Values{}
	eventQuery.Set("select", "*")
	eventQuery.Set("user_id", fmt.Sprintf("eq.%s", userID))
	eventQuery.Set("event_date", fmt.Sprintf("gte.%s", request.StartDay))
	eventData, err := a.Supabase.Select("calendar_events", eventQuery)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	var events []scheduler.Event
	if err := json.Unmarshal(eventData, &events); err != nil {
		http.Error(w, "invalid events payload", http.StatusBadGateway)
		return
	}

	settings := scheduler.Settings{
		WorkStartMinutes: 540,
		WorkEndMinutes:   1020,
		BreakMinutes:     15,
	}
	settingsQuery := url.Values{}
	settingsQuery.Set("select", "*")
	settingsQuery.Set("user_id", fmt.Sprintf("eq.%s", userID))
	settingsData, _ := a.Supabase.Select("user_settings", settingsQuery)
	var settingsRows []map[string]any
	json.Unmarshal(settingsData, &settingsRows)
	if len(settingsRows) > 0 {
		row := settingsRows[0]
		if workStart, ok := row["work_start"].(string); ok {
			settings.WorkStartMinutes = scheduler.ToMinutes(workStart)
		}
		if workEnd, ok := row["work_end"].(string); ok {
			settings.WorkEndMinutes = scheduler.ToMinutes(workEnd)
		}
		if breakLen, ok := row["break_length"].(float64); ok {
			settings.BreakMinutes = int(breakLen)
		}
	}

	behaviorOverrun := a.getBehaviorOverrunMinutes(userID)
	if behaviorOverrun > 0 {
		for i := range tasks {
			if tasks[i].EstimatedHours > 0 {
				tasks[i].EstimatedHours += float64(behaviorOverrun) / 60
			}
		}
	}
	result := scheduler.AutoSchedule(tasks, events, settings, request.FocusKey, request.AllowReshuffle)
	for _, update := range result.Updates {
		filter := fmt.Sprintf("id=eq.%s&user_id=eq.%s", update.ID, userID)
		payload := map[string]any{
			"task_date":  update.TaskDate,
			"start_time": update.StartTime,
			"end_time":   update.EndTime,
		}
		if _, err := a.Supabase.Update("tasks", filter, payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
	}
	if len(result.Inserts) > 0 {
		if _, err := a.Supabase.Insert("tasks", result.Inserts); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": len(result.Updates), "inserted": len(result.Inserts)})
}

func (a *App) getBehaviorOverrunMinutes(userID string) int {
	query := url.Values{}
	query.Set("select", "overrun_minutes")
	query.Set("user_id", fmt.Sprintf("eq.%s", userID))
	query.Set("order", "created_at.desc")
	query.Set("limit", "20")
	data, err := a.Supabase.Select("behavioral_data", query)
	if err != nil {
		return 0
	}
	var rows []map[string]any
	if err := json.Unmarshal(data, &rows); err != nil {
		return 0
	}
	if len(rows) == 0 {
		return 0
	}
	total := 0
	for _, row := range rows {
		if value, ok := row["overrun_minutes"].(float64); ok {
			total += int(value)
		}
	}
	return total / len(rows)
}

func (a *App) ImportGoogleCalendar(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	var payload struct {
		APIKey     string `json:"api_key"`
		CalendarID string `json:"calendar_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if payload.APIKey == "" || payload.CalendarID == "" {
		http.Error(w, "missing api key or calendar id", http.StatusBadRequest)
		return
	}
	events, err := fetchGoogleEvents(payload.APIKey, payload.CalendarID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	for i := range events {
		events[i]["user_id"] = userID
	}
	if _, err := a.Supabase.Insert("calendar_events", events); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"imported": len(events)})
}

func fetchGoogleEvents(apiKey, calendarID string) ([]map[string]any, error) {
	timeMin := url.QueryEscape(time.Now().Format(time.RFC3339))
	timeMax := url.QueryEscape(time.Now().Add(30 * 24 * time.Hour).Format(time.RFC3339))
	endpoint := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events?key=%s&timeMin=%s&timeMax=%s&singleEvents=true&orderBy=startTime",
		url.PathEscape(calendarID),
		url.QueryEscape(apiKey),
		timeMin,
		timeMax,
	)
	resp, err := http.Get(endpoint)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("google api error: %s", resp.Status)
	}
	var payload struct {
		Items []struct {
			Summary string `json:"summary"`
			Start   struct {
				DateTime string `json:"dateTime"`
				Date     string `json:"date"`
			} `json:"start"`
			End struct {
				DateTime string `json:"dateTime"`
				Date     string `json:"date"`
			} `json:"end"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	events := []map[string]any{}
	for _, item := range payload.Items {
		start := item.Start.DateTime
		end := item.End.DateTime
		if start == "" {
			start = item.Start.Date
		}
		if end == "" {
			end = item.End.Date
		}
		if start == "" || end == "" {
			continue
		}
		startDate := parseDate(start)
		endDate := parseDate(end)
		event := map[string]any{
			"title":      item.Summary,
			"source":     "google",
			"event_date": startDate.Format("2006-01-02"),
			"start_time": startDate.Format("15:04"),
			"end_time":   endDate.Format("15:04"),
			"is_fixed":   true,
		}
		events = append(events, event)
	}
	return events, nil
}

func parseDate(value string) time.Time {
	if strings.Contains(value, "T") {
		t, _ := time.Parse(time.RFC3339, value)
		return t
	}
	t, _ := time.Parse("2006-01-02", value)
	return t
}

func (a *App) AIBreakdown(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	lines := strings.Split(payload.Description, "\n")
	tasks := []map[string]any{}
	for _, line := range lines {
		trimmed := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(line, "-"), "*"))
		if trimmed == "" {
			continue
		}
		tasks = append(tasks, map[string]any{
			"title":           trimmed,
			"estimated_hours": 1.5,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks})
}
