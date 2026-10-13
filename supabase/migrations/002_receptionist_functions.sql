-- Functions that back the Vapi tools. n8n calls them with e.g.
--   select public.book_appointment('Jane Doe', '+15551234567', 'cleaning', '2026-10-20 10:00');
-- Every function returns JSON with a human-readable "message" the voice assistant can read out.
-- Local times (timestamp without time zone) are in the clinic's timezone from clinic_settings.

create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
$$;

-- Picks the best matching active service for a spoken name ("cleaning" -> "Checkup & Cleaning")
create or replace function public.find_service(p_service text)
returns public.services
language sql
stable
set search_path = ''
as $$
  select s.*
  from public.services s
  where s.is_active and s.name ilike '%' || trim(p_service) || '%'
  order by length(s.name)
  limit 1;
$$;

create or replace function public.get_available_slots(
  p_date date,
  p_service text,
  p_dentist_id uuid default null
)
returns table (
  dentist_id uuid,
  dentist_name text,
  slot_local text,      -- 'YYYY-MM-DD HH24:MI', pass this back to book_appointment
  slot_label text,      -- '10:30 AM', for speaking
  slot_start timestamptz
)
language sql
stable
set search_path = ''
as $$
  with settings as (
    select c.timezone as tz, c.slot_interval_min from public.clinic_settings c where c.id
  ),
  svc as (
    select s.id, s.duration_min from public.find_service(p_service) s where s.id is not null
  ),
  candidates as (
    select d.id as dentist_id, d.full_name, gs as local_start, svc.duration_min, settings.tz
    from public.dentists d
    join public.working_hours wh
      on wh.dentist_id = d.id and wh.weekday = extract(dow from p_date)
    cross join settings
    cross join svc
    cross join lateral generate_series(
      p_date + wh.start_time,
      p_date + wh.end_time - make_interval(mins => svc.duration_min),
      make_interval(mins => settings.slot_interval_min)
    ) as gs
    where d.is_active and (p_dentist_id is null or d.id = p_dentist_id)
  )
  select
    c.dentist_id,
    c.full_name,
    to_char(c.local_start, 'YYYY-MM-DD HH24:MI'),
    to_char(c.local_start, 'FMHH12:MI AM'),
    c.local_start at time zone c.tz
  from candidates c
  where (c.local_start at time zone c.tz) > now()
    and not exists (
      select 1
      from public.appointments a
      where a.dentist_id = c.dentist_id
        and a.status = 'booked'
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(
          c.local_start at time zone c.tz,
          (c.local_start at time zone c.tz) + make_interval(mins => c.duration_min)
        )
    )
  order by 5, 2;
$$;

create or replace function public.book_appointment(
  p_full_name text,
  p_phone text,
  p_service text,
  p_start_local timestamp,
  p_dentist_id uuid default null,
  p_notes text default null,
  p_vapi_call_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tz text;
  v_svc public.services;
  v_phone text := public.normalize_phone(p_phone);
  v_start timestamptz;
  v_end timestamptz;
  v_dentist_id uuid;
  v_dentist_name text;
  v_patient_id uuid;
  v_appt_id uuid;
begin
  if v_phone = '' then
    return jsonb_build_object('success', false, 'message', 'A phone number is required to book.');
  end if;

  select c.timezone into v_tz from public.clinic_settings c where c.id;

  v_svc := public.find_service(p_service);
  if v_svc.id is null then
    return jsonb_build_object('success', false, 'message', format('We do not offer a service called "%s".', p_service));
  end if;

  v_start := p_start_local at time zone v_tz;
  v_end := v_start + make_interval(mins => v_svc.duration_min);

  if v_start <= now() then
    return jsonb_build_object('success', false, 'message', 'That time has already passed. Please choose a future time.');
  end if;

  -- First dentist who works at that time and has no overlapping booking
  select d.id, d.full_name into v_dentist_id, v_dentist_name
  from public.dentists d
  join public.working_hours wh on wh.dentist_id = d.id
  where d.is_active
    and (p_dentist_id is null or d.id = p_dentist_id)
    and wh.weekday = extract(dow from p_start_local)
    and p_start_local::time >= wh.start_time
    and (p_start_local + make_interval(mins => v_svc.duration_min))::time <= wh.end_time
    and not exists (
      select 1 from public.appointments a
      where a.dentist_id = d.id
        and a.status = 'booked'
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(v_start, v_end)
    )
  order by d.full_name
  limit 1;

  if v_dentist_id is null then
    return jsonb_build_object('success', false, 'message', 'No dentist is available at that time. Please check availability for another time.');
  end if;

  -- Find or create the patient by phone; an existing patient keeps their stored name
  insert into public.patients (full_name, phone)
  values (trim(p_full_name), v_phone)
  on conflict (phone) do update set phone = excluded.phone
  returning id into v_patient_id;

  begin
    insert into public.appointments (patient_id, dentist_id, service_id, starts_at, ends_at, notes, vapi_call_id)
    values (v_patient_id, v_dentist_id, v_svc.id, v_start, v_end, p_notes, p_vapi_call_id)
    returning id into v_appt_id;
  exception when exclusion_violation then
    return jsonb_build_object('success', false, 'message', 'That slot was just taken. Please choose another time.');
  end;

  return jsonb_build_object(
    'success', true,
    'appointment_id', v_appt_id,
    'patient_id', v_patient_id,
    'dentist', v_dentist_name,
    'service', v_svc.name,
    'start_local', to_char(p_start_local, 'YYYY-MM-DD HH24:MI'),
    'message', format('Booked %s with %s on %s.',
      v_svc.name, v_dentist_name, to_char(p_start_local, 'FMDay, FMMonth FMDD "at" FMHH12:MI AM'))
  );
end;
$$;

create or replace function public.get_patient_appointments(p_phone text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with settings as (
    select c.timezone as tz from public.clinic_settings c where c.id
  ),
  p as (
    select pt.* from public.patients pt where pt.phone = public.normalize_phone(p_phone)
  )
  select case
    when not exists (select 1 from p) then
      jsonb_build_object('found', false, 'message', 'No patient record found for this phone number.')
    else jsonb_build_object(
      'found', true,
      'patient', (select jsonb_build_object('id', p.id, 'full_name', p.full_name) from p),
      'upcoming_appointments', coalesce((
        select jsonb_agg(jsonb_build_object(
            'appointment_id', a.id,
            'service', s.name,
            'dentist', d.full_name,
            'start_local', to_char(a.starts_at at time zone settings.tz, 'YYYY-MM-DD HH24:MI'),
            'when', to_char(a.starts_at at time zone settings.tz, 'FMDay, FMMonth FMDD "at" FMHH12:MI AM')
          ) order by a.starts_at)
        from public.appointments a
        join p on p.id = a.patient_id
        join public.services s on s.id = a.service_id
        join public.dentists d on d.id = a.dentist_id
        cross join settings
        where a.status = 'booked' and a.starts_at > now()
      ), '[]'::jsonb)
    )
  end;
$$;

-- The phone must match the appointment's patient, so a caller cannot cancel someone else's visit
create or replace function public.cancel_appointment(p_appointment_id uuid, p_phone text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_found boolean;
begin
  update public.appointments a
  set status = 'cancelled', updated_at = now()
  from public.patients p
  where a.id = p_appointment_id
    and p.id = a.patient_id
    and p.phone = public.normalize_phone(p_phone)
    and a.status = 'booked';
  v_found := found;

  if not v_found then
    return jsonb_build_object('success', false, 'message', 'I could not find an active appointment for this phone number.');
  end if;
  return jsonb_build_object('success', true, 'message', 'The appointment has been cancelled.');
end;
$$;

-- Moves an appointment, preferring the same dentist. The old slot is only released if the new one books.
create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_phone text,
  p_new_start_local timestamp
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_old record;
  v_result jsonb;
begin
  select a.id, a.dentist_id, a.notes, a.vapi_call_id, p.full_name, p.phone, s.name as service_name
  into v_old
  from public.appointments a
  join public.patients p on p.id = a.patient_id
  join public.services s on s.id = a.service_id
  where a.id = p_appointment_id
    and p.phone = public.normalize_phone(p_phone)
    and a.status = 'booked'
  for update of a;

  if not found then
    return jsonb_build_object('success', false, 'message', 'I could not find an active appointment for this phone number.');
  end if;

  -- Free the old slot so the new time may overlap it
  update public.appointments set status = 'cancelled', updated_at = now() where id = v_old.id;

  v_result := public.book_appointment(v_old.full_name, v_old.phone, v_old.service_name, p_new_start_local, v_old.dentist_id, v_old.notes, v_old.vapi_call_id);
  if not (v_result ->> 'success')::boolean then
    v_result := public.book_appointment(v_old.full_name, v_old.phone, v_old.service_name, p_new_start_local, null, v_old.notes, v_old.vapi_call_id);
  end if;

  if not (v_result ->> 'success')::boolean then
    update public.appointments set status = 'booked', updated_at = now() where id = v_old.id;
    return v_result;
  end if;

  return v_result || jsonb_build_object('message', 'Rescheduled. ' || (v_result ->> 'message'));
end;
$$;

-- Only the backend (postgres / service_role) may call these, never the public anon key
revoke execute on function
  public.normalize_phone(text),
  public.find_service(text),
  public.get_available_slots(date, text, uuid),
  public.book_appointment(text, text, text, timestamp, uuid, text, text),
  public.get_patient_appointments(text),
  public.cancel_appointment(uuid, text),
  public.reschedule_appointment(uuid, text, timestamp)
from public, anon, authenticated;

grant execute on function
  public.normalize_phone(text),
  public.find_service(text),
  public.get_available_slots(date, text, uuid),
  public.book_appointment(text, text, text, timestamp, uuid, text, text),
  public.get_patient_appointments(text),
  public.cancel_appointment(uuid, text),
  public.reschedule_appointment(uuid, text, timestamp)
to service_role;
