-- Staff invites: when a Supabase Auth user is created with an invited email,
-- they are added to public.staff automatically (no manual step after sign-up).

create table public.staff_invites (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.staff_invites enable row level security;

create or replace function public.add_invited_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.staff_invites i where i.email = lower(new.email)) then
    insert into public.staff (user_id, email) values (new.id, lower(new.email))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.add_invited_staff() from public, anon, authenticated;

create trigger on_auth_user_created_add_staff
  after insert on auth.users
  for each row execute function public.add_invited_staff();

insert into public.staff_invites (email) values ('admin@dental.com');

-- 011 (applied separately): only confirmed emails are added, so nobody can claim an
-- invite by signing up with that address.
create or replace function public.add_invited_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and exists (select 1 from public.staff_invites i where i.email = lower(new.email)) then
    insert into public.staff (user_id, email) values (new.id, lower(new.email))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger on_auth_user_created_add_staff on auth.users;
create trigger on_auth_user_confirmed_add_staff
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.add_invited_staff();
