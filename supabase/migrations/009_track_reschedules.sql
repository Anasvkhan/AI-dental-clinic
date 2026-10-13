-- Show reschedules clearly in the admin panel: the old appointment gets status
-- 'rescheduled' (instead of 'cancelled') and the new one points back to it.

alter type public.appointment_status add value if not exists 'rescheduled';

alter table public.appointments
  add column rescheduled_from uuid references public.appointments (id) on delete set null;
create index appointments_rescheduled_from_idx on public.appointments (rescheduled_from);

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
    and p.phone_key = public.phone_key(p_phone)
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

  update public.appointments set status = 'rescheduled', updated_at = now() where id = v_old.id;
  update public.appointments set rescheduled_from = v_old.id where id = (v_result ->> 'appointment_id')::uuid;

  return v_result || jsonb_build_object('message', 'Rescheduled. ' || (v_result ->> 'message'));
end;
$$;
