-- Access for the public website and the staff dashboard.
-- Website (anon key): may read clinic info, active services, active dentists and hours only.
-- Dashboard: signed-in users listed in public.staff may read everything, live via Realtime.

-- Public, non-sensitive clinic data
create policy "Public can read clinic settings" on public.clinic_settings
  for select to anon, authenticated using (true);
create policy "Public can read active services" on public.services
  for select to anon, authenticated using (is_active);
create policy "Public can read active dentists" on public.dentists
  for select to anon, authenticated using (is_active);
create policy "Public can read working hours" on public.working_hours
  for select to anon, authenticated using (true);

-- Staff allowlist: a Supabase Auth user can see patient data only if listed here
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

create policy "Staff can see their own staff row" on public.staff
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Staff can read patients" on public.patients
  for select to authenticated using ((select public.is_staff()));
create policy "Staff can read appointments" on public.appointments
  for select to authenticated using ((select public.is_staff()));
create policy "Staff can read call logs" on public.call_logs
  for select to authenticated using ((select public.is_staff()));
create policy "Staff can read all services" on public.services
  for select to authenticated using ((select public.is_staff()));
create policy "Staff can read all dentists" on public.dentists
  for select to authenticated using ((select public.is_staff()));

-- Live updates for the dashboard (Realtime still applies the policies above)
alter publication supabase_realtime add table public.appointments, public.patients, public.call_logs;
