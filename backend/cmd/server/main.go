package main

import (
	"log"
	"net/http"
	"os"

	"focus-backend/internal/handlers"
	"focus-backend/internal/supabase"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	supabaseURL := os.Getenv("SUPABASE_URL")
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	anonKey := os.Getenv("SUPABASE_ANON_KEY")
	if supabaseURL == "" || serviceKey == "" || anonKey == "" {
		log.Fatal("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY are required")
	}

	client := supabase.NewClient(supabaseURL, serviceKey, anonKey)
	app := &handlers.App{Supabase: client}

	router := chi.NewRouter()
	router.Use(middleware.Logger)
	router.Use(middleware.Recoverer)
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	router.Get("/api/health", app.Health)

	router.Route("/api", func(r chi.Router) {
		r.Use(app.AuthMiddleware)
		r.Get("/tasks", app.GetTasks)
		r.Post("/tasks", app.CreateTask)
		r.Patch("/tasks/{id}", app.UpdateTask)
		r.Delete("/tasks/{id}", app.DeleteTask)

		r.Get("/projects", app.GetProjects)
		r.Post("/projects", app.CreateProject)

		r.Get("/events", app.GetEvents)
		r.Post("/events", app.CreateEvent)

		r.Get("/settings", app.GetSettings)
		r.Post("/settings", app.SaveSettings)

		r.Post("/schedule/auto", app.AutoSchedule)
		r.Post("/integrations/google/import", app.ImportGoogleCalendar)
		r.Post("/ai/breakdown", app.AIBreakdown)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, router))
}
