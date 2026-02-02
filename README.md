# Cal-Ender
Webapp that helps individuals schedule and track their tasks.

## What this includes
- Static frontend ready for GitHub Pages.
- Supabase backend (Auth + Postgres) for task storage.
- Day map with milestones plus workload balance by company/project.

## Setup
1. Create a Supabase project.
2. In Supabase SQL editor, run the schema below.
3. For the new stack, set environment variables in `frontend/.env` and `backend/.env` (see examples).
4. Deploy `frontend/` to GitHub Pages and `backend/` to Render.

## Supabase schema
```sql
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  project_id uuid references public.projects on delete set null,
  title text not null,
  company text,
  project text,
  notes text,
  task_date date not null,
  start_time time,
  end_time time,
  estimated_hours numeric,
  priority_level int default 2,
  deadline_type text,
  deadline_date date,
  dependencies uuid[] default '{}',
  status text default 'planned',
  actual_start time,
  actual_end time,
  completed_at timestamptz,
  is_milestone boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  description text,
  priority_level int default 2,
  deadline_type text,
  deadline_date date,
  created_at timestamptz default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  source text default 'internal',
  event_date date not null,
  start_time time not null,
  end_time time not null,
  is_fixed boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  work_start time default '09:00',
  work_end time default '17:00',
  break_length int default 15,
  updated_at timestamptz default now()
);

create table if not exists public.behavioral_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  task_id uuid references public.tasks on delete set null,
  start_time time,
  end_time time,
  overrun_minutes int default 0,
  created_at timestamptz default now()
);

alter table public.tasks enable row level security;
alter table public.projects enable row level security;
alter table public.calendar_events enable row level security;
alter table public.user_settings enable row level security;
alter table public.behavioral_data enable row level security;

create policy "Users can manage their tasks"
  on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their projects"
  on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their calendar events"
  on public.calendar_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their settings"
  on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their behavioral data"
  on public.behavioral_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

If you already created the table, add tracking columns:
```sql
alter table public.tasks
  add column if not exists project_id uuid references public.projects on delete set null,
  add column if not exists status text default 'planned',
  add column if not exists actual_start time,
  add column if not exists actual_end time,
  add column if not exists completed_at timestamptz,
  add column if not exists priority_level int default 2,
  add column if not exists deadline_type text,
  add column if not exists deadline_date date,
  add column if not exists dependencies uuid[] default '{}';

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  description text,
  priority_level int default 2,
  deadline_type text,
  deadline_date date,
  created_at timestamptz default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  source text default 'internal',
  event_date date not null,
  start_time time not null,
  end_time time not null,
  is_fixed boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  work_start time default '09:00',
  work_end time default '17:00',
  break_length int default 15,
  updated_at timestamptz default now()
);

create table if not exists public.behavioral_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  task_id uuid references public.tasks on delete set null,
  start_time time,
  end_time time,
  overrun_minutes int default 0,
  created_at timestamptz default now()
);
```

## Bulk import format
Each line should follow:
```
YYYY-MM-DD | Company | Project | Task title #milestone est=2.5
```
Notes:
- Time range is optional. If provided, use `09:00-10:30` after the date.
- Separators supported: `|`, ` _ ` (space underscore space), `::`, tab, or 2+ spaces.
- Line separators supported: newline or `;;`.
- `#milestone` can appear anywhere in the line.
- `est=` defines estimated hours for auto-scheduling (supports `est=4h`).

## New stack (Svelte + Go + Supabase)
### Frontend
```
cd frontend
npm install
npm run dev
```
Build for GitHub Pages:
```
npm run build
```
Deploy `frontend/dist` to GitHub Pages.

### Backend
```
cd backend
go run ./cmd/server
```
Render config:
- Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `PORT`.
```
go build ./cmd/server
```