-- Entry points called by n8n through the Supabase REST API (POST /rest/v1/rpc/<name>).
-- handle_vapi_tool routes one Vapi tool call to the matching receptionist function.
-- save_call_log stores a Vapi end-of-call report.

create or replace function public.handle_vapi_tool(
  p_name text,
  p_args jsonb default '{}'::jsonb,
  p_caller_phone text default null,
  p_call_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  -- The caller ID is the default; the assistant can pass a different number the caller gives
  v_phone text := coalesce(nullif(v_args ->> 'phone', ''), p_caller_phone);
  v_dentist_id uuid;
  v_svc public.services;
  v_settings public.clinic_settings;
  v_result jsonb;
begin
  select * into v_settings from public.clinic_settings c where c.id;

  if nullif(v_args ->> 'dentist', '') is not null then
    select d.id into v_dentist_id
    from public.dentists d
    where d.is_active and d.full_name ilike '%' || (v_args ->> 'dentist') || '%'
    order by d.full_name
    limit 1;
  end if;

  case p_name
    when 'get_clinic_info' then
      select jsonb_build_object(
        'clinic_name', v_settings.clinic_name,
        'address', v_settings.address,
        'phone', v_settings.phone,
        'today_local', to_char(now() at time zone v_settings.timezone, 'FMDay, YYYY-MM-DD HH24:MI'),
        'services', (
          select jsonb_agg(jsonb_build_object('name', s.name, 'description', s.description, 'duration_min', s.duration_min, 'price', s.price) order by s.name)
          from public.services s where s.is_active
        ),
        'dentists', (
          select jsonb_agg(jsonb_build_object(
              'name', d.full_name,
              'specialty', d.specialty,
              'hours', (
                select jsonb_agg(
                  trim(to_char(date '2024-01-07' + wh.weekday, 'Day')) || ' ' ||
                  to_char(wh.start_time, 'FMHH12:MI AM') || '-' || to_char(wh.end_time, 'FMHH12:MI AM')
                  order by wh.weekday, wh.start_time)
                from public.working_hours wh where wh.dentist_id = d.id
              )
            ) order by d.full_name)
          from public.dentists d where d.is_active
        )
      ) into v_result;

    when 'check_availability' then
      v_svc := public.find_service(v_args ->> 'service');
      if v_svc.id is null then
        return jsonb_build_object('success', false, 'message', format('We do not offer a service called "%s".', v_args ->> 'service'));
      end if;

      select jsonb_build_object(
        'success', true,
        'service', v_svc.name,
        'date', v_args ->> 'date',
        'available_times', coalesce(jsonb_agg(jsonb_build_object(
            'start_local', t.slot_local, 'time', t.slot_label, 'dentists', t.dentists
          ) order by t.slot_local), '[]'::jsonb),
        'message', case
          when count(*) = 0 then 'There are no open times on that day. Offer to check another day.'
          else format('%s open start times for %s.', count(*), v_svc.name)
        end
      ) into v_result
      from (
        select s.slot_local, min(s.slot_label) as slot_label, jsonb_agg(s.dentist_name order by s.dentist_name) as dentists
        from public.get_available_slots((v_args ->> 'date')::date, v_svc.name, v_dentist_id) s
        group by s.slot_local
      ) t;

    when 'book_appointment' then
      if nullif(v_args ->> 'full_name', '') is null or nullif(v_args ->> 'service', '') is null
         or nullif(v_args ->> 'start_local', '') is null then
        return jsonb_build_object('success', false,
          'message', 'To book I need the patient''s full name, the service and the start time.');
      end if;
      v_result := public.book_appointment(
        v_args ->> 'full_name', v_phone, v_args ->> 'service',
        (v_args ->> 'start_local')::timestamp, v_dentist_id, v_args ->> 'notes', p_call_id);

    when 'get_patient_appointments' then
      v_result := public.get_patient_appointments(v_phone);

    when 'reschedule_appointment' then
      if nullif(v_args ->> 'new_start_local', '') is null then
        return jsonb_build_object('success', false, 'message', 'I need the new start time to reschedule.');
      end if;
      v_result := public.reschedule_appointment(
        (v_args ->> 'appointment_id')::uuid, v_phone, (v_args ->> 'new_start_local')::timestamp);

    when 'cancel_appointment' then
      v_result := public.cancel_appointment((v_args ->> 'appointment_id')::uuid, v_phone);

    else
      v_result := jsonb_build_object('success', false, 'message', format('Unknown tool "%s".', p_name));
  end case;

  return v_result;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or null_value_not_allowed then
    return jsonb_build_object('success', false,
      'message', 'Some details were missing or in the wrong format. Dates must be YYYY-MM-DD and times YYYY-MM-DD HH:MM.');
end;
$$;

create or replace function public.save_call_log(p_message jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_call jsonb := coalesce(p_message -> 'call', '{}'::jsonb);
  v_phone text := v_call #>> '{customer,number}';
  v_id uuid;
begin
  insert into public.call_logs (
    vapi_call_id, phone, patient_id, started_at, ended_at, duration_sec,
    ended_reason, summary, transcript, recording_url, raw
  )
  values (
    v_call ->> 'id',
    v_phone,
    (select p.id from public.patients p where p.phone_key = public.phone_key(v_phone) and v_phone is not null),
    (p_message ->> 'startedAt')::timestamptz,
    (p_message ->> 'endedAt')::timestamptz,
    round((p_message ->> 'durationSeconds')::numeric)::int,
    p_message ->> 'endedReason',
    coalesce(p_message #>> '{analysis,summary}', p_message ->> 'summary'),
    coalesce(p_message #>> '{artifact,transcript}', p_message ->> 'transcript'),
    coalesce(p_message #>> '{artifact,recordingUrl}', p_message ->> 'recordingUrl'),
    p_message
  )
  on conflict (vapi_call_id) do update set
    ended_at = excluded.ended_at,
    duration_sec = excluded.duration_sec,
    ended_reason = excluded.ended_reason,
    summary = excluded.summary,
    transcript = excluded.transcript,
    recording_url = excluded.recording_url,
    raw = excluded.raw
  returning id into v_id;

  return jsonb_build_object('success', true, 'call_log_id', v_id);
end;
$$;

revoke execute on function
  public.handle_vapi_tool(text, jsonb, text, text),
  public.save_call_log(jsonb)
from public, anon, authenticated;

grant execute on function
  public.handle_vapi_tool(text, jsonb, text, text),
  public.save_call_log(jsonb)
to service_role;
