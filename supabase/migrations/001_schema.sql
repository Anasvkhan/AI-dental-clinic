-- AI Dental Receptionist: core schema
-- Times are stored as timestamptz (UTC). The clinic's local timezone lives in clinic_settings.

create extension if not exists btree_gist with schema extensions;

-- Single-row clinic configuration
create table public.clinic_settings (
  id boolean primary key default true check (id),
  clinic_name text not null default 'Bright Smile Dental',
  timezone text not null default 'America/New_York',
  slot_interval_min int not null default 30 check (slot_interval_min > 0),
  phone text,
  address text,
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique,          -- normalized: digits and leading +
  email text,
  date_of_birth date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.dentists (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  specialty text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  duration_min int not null check (duration_min > 0),
  price numeric(10, 2),
  is_active boolean not null default true
);

-- Weekly schedule; several rows per day allow lunch breaks. weekday: 0 = Sunday ... 6 = Saturday
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  dentist_id uuid not null references public.dentists (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  unique (dentist_id, weekday, start_time)
);

create type public.appointment_status as enum ('booked', 'cancelled', 'completed', 'no_show');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  dentist_id uuid not null references public.dentists (id),
  service_id uuid not null references public.services (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'booked',
  notes text,
  source text not null default 'phone',
  vapi_call_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- A dentist can never have two overlapping booked appointments
  constraint appointments_no_overlap exclude using gist (
    dentist_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'booked')
);

create index appointments_patient_id_idx on public.appointments (patient_id);
create index appointments_service_id_idx on public.appointments (service_id);
create index appointments_dentist_starts_idx on public.appointments (dentist_id, starts_at);

-- Filled by the Vapi end-of-call report
create table public.call_logs (
  id uuid primary key default gen_random_uuid(),
  vapi_call_id text unique,
  phone text,
  patient_id uuid references public.patients (id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec int,
  ended_reason text,
  summary text,
  transcript text,
  recording_url text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index call_logs_patient_id_idx on public.call_logs (patient_id);

-- Lock everything down: n8n connects as the postgres / service_role user, which bypasses RLS.
-- The public anon key gets no access.
alter table public.clinic_settings enable row level security;
alter table public.patients enable row level security;
alter table public.dentists enable row level security;
alter table public.services enable row level security;
alter table public.working_hours enable row level security;
alter table public.appointments enable row level security;
alter table public.call_logs enable row level security;
