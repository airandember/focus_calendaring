# focus_calendaring
Webapp that helps individuals schedule and track their tasks.

## What this includes
- Static frontend ready for GitHub Pages.
- Supabase backend (Auth + Postgres) for task storage.
- Day map with milestones plus workload balance by company/project.

## Setup
1. Create a Supabase project.
2. In Supabase SQL editor, run the schema below.
3. Update `config.js` with your Supabase URL and anon key.
4. Deploy the `index.html`, `app.js`, `styles.css`, `config.js` files to GitHub Pages.

## Supabase schema
```sql
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  company text,
  project text,
  notes text,
  task_date date not null,
  start_time time,
  end_time time,
  estimated_hours numeric,
  status text default 'planned',
  actual_start time,
  actual_end time,
  completed_at timestamptz,
  is_milestone boolean default false,
  created_at timestamptz default now()
);

alter table public.tasks enable row level security;

create policy "Users can manage their tasks"
  on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

If you already created the table, add tracking columns:
```sql
alter table public.tasks
  add column if not exists status text default 'planned',
  add column if not exists actual_start time,
  add column if not exists actual_end time,
  add column if not exists completed_at timestamptz;
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