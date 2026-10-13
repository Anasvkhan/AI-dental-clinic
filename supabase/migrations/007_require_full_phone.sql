-- Reject incomplete phone numbers. Pakistani mobiles are 11 digits (03xxxxxxxxx) or
-- 12 with +92; landlines are 10-11 digits. A test call stored only "03128694" because
-- the assistant booked before the caller finished saying the number.
-- Also fixes that test patient's number (Muhammad Anas, confirmed 03128694139).

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
  if length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) < 10 then
    return jsonb_build_object('success', false,
      'message', format('The phone number "%s" is incomplete. Ask the caller to say their full 11-digit mobile number again, then read it back to confirm.', coalesce(p_phone, '')));
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

  -- Find or create the patient by phone; an existing patient keeps their stored name and number
  insert into public.patients (full_name, phone)
  values (trim(p_full_name), v_phone)
  on conflict (phone_key) do update set phone = public.patients.phone
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

update public.patients
set phone = '03128694139'
where phone = '03128694' and full_name = 'Muhammad Anas';
