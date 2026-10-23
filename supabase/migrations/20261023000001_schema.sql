-- Kodim: asosiy jadvallar (MIGRATION-PLAN.md 2-bo'lim). Enumlar Prisma'dagi bilan bir xil.
-- O'quvchi = anonim Supabase foydalanuvchisi (attempts.student_uid), o'qituvchi = teachers.id = auth.users.id.

create type public.teacher_role as enum ('ADMIN', 'TEACHER');
create type public.exam_status as enum ('DRAFT', 'LOBBY', 'RUNNING', 'GRADING', 'FINISHED');
create type public.exam_template as enum ('EMPTY', 'HTML', 'REACT_VITE', 'VUE_VITE', 'TYPESCRIPT', 'NODE', 'PYTHON', 'CUSTOM');
create type public.task_type as enum ('EXERCISE', 'FIGMA');
create type public.attempt_status as enum ('JOINED', 'WORKING', 'SUBMITTED', 'ANNULLED');
create type public.graded_by as enum ('AI', 'TEACHER', 'NONE');
create type public.event_severity as enum ('INFO', 'WARN', 'DANGER');

create table public.teachers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  email text not null unique,
  role public.teacher_role not null default 'TEACHER',
  disabled boolean not null default false,
  figma_secret_id uuid,
  figma_handle text,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  code text unique check (code ~ '^[0-9]{6}$'),
  status public.exam_status not null default 'DRAFT',
  duration_min int not null check (duration_min between 1 and 600),
  started_at timestamptz,
  ends_at timestamptz,
  template public.exam_template not null default 'EMPTY',
  starter_files jsonb not null default '[]',
  reference_files jsonb not null default '[]',
  criteria jsonb not null default '[]',
  ai_enabled boolean not null default false,
  ai_model text not null default 'DEFAULT' check (ai_model in ('DEFAULT', 'STRONG')),
  allowed_packages jsonb not null default '[]',
  allowed_commands jsonb not null default '[]',
  allowed_shells jsonb not null default '[]',
  -- savollar.md + dizaynlar/ (panel saqlashda shared/examFiles.ts bilan tayyorlaydi)
  readonly_files jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index exams_teacher_id_idx on public.exams (teacher_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  "order" int not null,
  title text not null check (length(title) between 1 and 200),
  description text not null default '',
  type public.task_type not null,
  figma_url text,
  images jsonb not null default '[]', -- [{name, path}] — Storage exam-assets
  expected_output text
);
create index tasks_exam_id_order_idx on public.tasks (exam_id, "order");

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  student_uid uuid not null references auth.users (id) on delete cascade,
  student_name text not null check (length(student_name) between 2 and 60),
  device_id text,
  status public.attempt_status not null default 'JOINED',
  extra_minutes int not null default 0 check (extra_minutes >= 0),
  connected boolean not null default false,
  last_seen_at timestamptz not null default now(),
  ending_at timestamptz, -- 15 s topshirish boshlangan payt (pg_cron)
  submitted_at timestamptz,
  ai_score int check (ai_score between 0 and 100),
  ai_result jsonb,
  ai_error text,
  teacher_score int check (teacher_score between 0 and 100),
  teacher_comment text,
  teacher_criteria jsonb,
  graded_by public.graded_by not null default 'NONE',
  created_at timestamptz not null default now()
);
create index attempts_exam_id_idx on public.attempts (exam_id);
create index attempts_student_uid_idx on public.attempts (student_uid);

create table public.attempt_files (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  path text not null check (length(path) between 1 and 260),
  content text not null,
  encoding text check (encoding = 'base64'),
  sha1 text not null,
  updated_at timestamptz not null default now(),
  primary key (attempt_id, path)
);

create table public.event_types (
  type text primary key,
  severity public.event_severity not null,
  client_allowed boolean not null
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  type text not null references public.event_types (type),
  severity public.event_severity not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_exam_id_created_at_idx on public.events (exam_id, created_at desc);
create index events_attempt_id_created_at_idx on public.events (attempt_id, created_at);
create index events_type_idx on public.events (type);

create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  points int not null check (points > 0 and points <= 100),
  reason text not null check (length(reason) between 1 and 500),
  event_id uuid references public.events (id) on delete set null,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index penalties_attempt_id_idx on public.penalties (attempt_id);
create index penalties_event_id_idx on public.penalties (event_id);
create index penalties_teacher_id_idx on public.penalties (teacher_id);

create table public.figma_caches (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  url text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'READY', 'ERROR')),
  error text,
  data jsonb,
  fetched_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (teacher_id, url)
);

create table public.figma_images (
  cache_id uuid not null references public.figma_caches (id) on delete cascade,
  frame_id text not null,
  format text not null default 'png',
  scale int not null default 2,
  storage_path text not null,
  primary key (cache_id, frame_id)
);

create table public.rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz
);
