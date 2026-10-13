-- Sample clinic data. Edit names, services, prices and hours to match the real clinic.

insert into public.clinic_settings (clinic_name, timezone, slot_interval_min, phone, address)
values ('Bright Smile Dental', 'America/New_York', 30, '+15550100000', '123 Main Street');

insert into public.dentists (full_name, specialty) values
  ('Dr. Sarah Ahmed', 'General Dentistry'),
  ('Dr. Omar Malik', 'Endodontics'),
  ('Dr. Emily Chen', 'Cosmetic Dentistry');

insert into public.services (name, description, duration_min, price) values
  ('Consultation', 'First visit and examination', 30, 50.00),
  ('Checkup & Cleaning', 'Routine exam, scaling and polishing', 60, 120.00),
  ('Filling', 'Cavity filling', 60, 150.00),
  ('Tooth Extraction', 'Simple tooth removal', 45, 180.00),
  ('Root Canal', 'Root canal treatment', 90, 700.00),
  ('Teeth Whitening', 'In-office whitening', 90, 350.00),
  ('Emergency Visit', 'Toothache, swelling or broken tooth', 30, 100.00);

-- Mon-Fri 9:00-13:00 and 14:00-17:00 (lunch break 13-14) for every dentist
insert into public.working_hours (dentist_id, weekday, start_time, end_time)
select d.id, wd, t.start_time, t.end_time
from public.dentists d
cross join generate_series(1, 5) as wd
cross join (values ('09:00'::time, '13:00'::time), ('14:00'::time, '17:00'::time)) as t (start_time, end_time);

-- Saturday 10:00-14:00 for Dr. Sarah Ahmed only
insert into public.working_hours (dentist_id, weekday, start_time, end_time)
select d.id, 6, '10:00', '14:00'
from public.dentists d
where d.full_name = 'Dr. Sarah Ahmed';
