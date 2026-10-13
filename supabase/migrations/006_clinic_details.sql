-- Real clinic details (Karachi). Applied with execute_sql on 2026-10-13.
update public.clinic_settings
set clinic_name = 'Airways Dental Clinic',
    address = 'Block 7, Gulshan-e-Iqbal, near Maskan Chowrangi, Karachi',
    timezone = 'Asia/Karachi',
    phone = null,
    updated_at = now()
where id;
