-- EduPath marketplace: roles on signup, availability, bookings, favorites, reviews,
-- messaging, notifications and admin verification.
-- Incremental and non-destructive: requires 202610250001_initial_foundation.sql to be applied first.
-- Nothing here drops tables or deletes data. Old overly-narrow tutor policies are replaced.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.booking_status as enum ('pending','accepted','rejected','cancelled','completed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end $$;

-- Admins live in their own table so the 'admin' role can never be self-assigned through user_roles.
-- Provision with SQL (see README): insert into public.admins(user_id) values ('<auth user uuid>');
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
drop policy if exists admins_select_self on public.admins;
create policy admins_select_self on public.admins for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.has_role(p_user uuid, p_role public.app_role) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_roles where user_id = p_user and role = p_role);
$$;

-- ---------------------------------------------------------------------------
-- Tutor profile extensions
-- ---------------------------------------------------------------------------
alter table public.tutor_profiles
  add column if not exists kind text not null default 'tutor',
  add column if not exists university text,
  add column if not exists field_of_study text,
  add column if not exists qualifications text,
  add column if not exists accepting_bookings boolean not null default true,
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_note text;

do $$ begin
  alter table public.tutor_profiles add constraint tutor_kind_check check (kind in ('tutor','mentor'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tutor_profiles add constraint tutor_modes_check
    check (teaching_modes <@ array['in_person','online']::text[]);
exception when duplicate_object then null; end $$;

create index if not exists tutor_profiles_search_idx on public.tutor_profiles (is_searchable, verification_status);
create index if not exists tutor_profiles_subjects_gin on public.tutor_profiles using gin (subjects);
create index if not exists tutor_profiles_levels_gin on public.tutor_profiles using gin (grade_levels);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists tutor_profiles_updated_at on public.tutor_profiles;
create trigger tutor_profiles_updated_at before update on public.tutor_profiles for each row execute function public.set_updated_at();

-- Owners may edit their profile at any verification stage, but never the verification fields.
-- Column privileges + trigger (defence in depth). Trusted RPCs run as the function owner and pass the trigger.
drop policy if exists tutors_insert_own_draft on public.tutor_profiles;
drop policy if exists tutors_update_own_draft on public.tutor_profiles;
drop policy if exists tutors_update_own on public.tutor_profiles;
create policy tutors_update_own on public.tutor_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists tutors_select_admin on public.tutor_profiles;
create policy tutors_select_admin on public.tutor_profiles for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.tutor_profiles from anon, authenticated;
grant update (headline, bio, teaching_modes, subjects, grade_levels, languages, hourly_rate_etb,
  service_area, travel_radius_km, university, field_of_study, qualifications, accepting_bookings)
  on public.tutor_profiles to authenticated;

create or replace function public.guard_tutor_profile() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon','authenticated') then
    if new.verification_status is distinct from old.verification_status
       or new.is_searchable is distinct from old.is_searchable
       or new.verification_submitted_at is distinct from old.verification_submitted_at
       or new.verification_note is distinct from old.verification_note
       or new.kind is distinct from old.kind
       or new.user_id is distinct from old.user_id then
      raise exception 'Verification fields can only be changed by EduPath staff.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tutor_profiles_guard on public.tutor_profiles;
create trigger tutor_profiles_guard before update on public.tutor_profiles
  for each row execute function public.guard_tutor_profile();

-- Profiles: only display name and language are editable.
revoke all on public.profiles, public.user_roles from anon;
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, preferred_language) on public.profiles to authenticated;
drop policy if exists profiles_insert_own on public.profiles;
revoke insert, update, delete on public.user_roles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signup: create profile + (non-admin) role from signup metadata. Roles can never include admin.
-- Tutor/mentor accounts are NOT public until an admin verifies them.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r text := lower(coalesce(new.raw_user_meta_data->>'role', 'student'));
  nm text;
begin
  if r not in ('student','parent','tutor','mentor') then r := 'student'; end if;
  nm := left(trim(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(coalesce(new.email,''), '@', 1))), 100);
  if nm is null or nm = '' then nm := 'EduPath user'; end if;
  insert into public.profiles (id, display_name) values (new.id, nm) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, r::public.app_role) on conflict do nothing;
  if r in ('tutor','mentor') then
    insert into public.tutor_profiles (user_id, kind) values (new.id, case when r = 'mentor' then 'mentor' else 'tutor' end)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill accounts created before this migration (default role: student; no data is changed or removed).
insert into public.profiles (id, display_name)
  select u.id, left(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), split_part(coalesce(u.email,''), '@', 1), 'EduPath user'), 100)
  from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);
insert into public.user_roles (user_id, role)
  select p.id, 'student' from public.profiles p
  where not exists (select 1 from public.user_roles r where r.user_id = p.id);

-- An existing student/parent may also offer tutoring/mentoring (still needs admin verification).
create or replace function public.become_tutor(p_kind text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Please sign in.' using errcode = '28000'; end if;
  if p_kind not in ('tutor','mentor') then raise exception 'Invalid kind.'; end if;
  insert into public.user_roles (user_id, role) values (uid, p_kind::public.app_role) on conflict do nothing;
  insert into public.tutor_profiles (user_id, kind) values (uid, p_kind) on conflict (user_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Availability (weekly recurring windows in Africa/Addis_Ababa local time; weekday 0 = Sunday)
-- ---------------------------------------------------------------------------
create table if not exists public.tutor_availability (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles(user_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_min smallint not null check (start_min between 0 and 1439 and start_min % 30 = 0),
  end_min smallint not null check (end_min between 1 and 1440 and end_min % 30 = 0),
  created_at timestamptz not null default now(),
  check (end_min > start_min),
  exclude using gist (tutor_id with =, weekday with =, int4range(start_min, end_min) with &&)
);
create index if not exists tutor_availability_tutor_idx on public.tutor_availability (tutor_id, weekday);
alter table public.tutor_availability enable row level security;
revoke all on public.tutor_availability from anon, authenticated;
grant select on public.tutor_availability to anon, authenticated;
grant insert, delete on public.tutor_availability to authenticated;

create policy availability_select_public_or_own on public.tutor_availability for select to anon, authenticated using (
  tutor_id = (select auth.uid())
  or exists (select 1 from public.tutor_profiles t where t.user_id = tutor_id and t.is_searchable and t.verification_status = 'verified')
);
create policy availability_insert_own on public.tutor_availability for insert to authenticated
  with check (tutor_id = (select auth.uid()));
create policy availability_delete_own on public.tutor_availability for delete to authenticated
  using (tutor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles(user_id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 100),
  mode text not null check (mode in ('in_person','online')),
  starts_at timestamptz not null,
  duration_minutes smallint not null check (duration_minutes in (30,60,90,120)),
  ends_at timestamptz not null,
  note text check (note is null or char_length(note) <= 500),
  price_etb integer not null check (price_etb >= 0),
  status public.booking_status not null default 'pending',
  cancelled_by uuid references public.profiles(id),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (student_id <> tutor_id),
  check (ends_at = starts_at + (duration_minutes * interval '1 minute')),
  -- A tutor cannot be double booked and a learner cannot hold two overlapping live requests.
  constraint bookings_no_tutor_overlap exclude using gist (tutor_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status in ('pending','accepted')),
  constraint bookings_no_student_overlap exclude using gist (student_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status in ('pending','accepted'))
);
create index if not exists bookings_student_idx on public.bookings (student_id, starts_at desc);
create index if not exists bookings_tutor_idx on public.bookings (tutor_id, status, starts_at);
drop trigger if exists bookings_updated_at on public.bookings;
create trigger bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();

-- Valid status transitions are enforced in the database, whatever code issues the UPDATE.
create or replace function public.validate_booking_transition() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status then
    if not ((old.status = 'pending'  and new.status in ('accepted','rejected','cancelled'))
         or (old.status = 'accepted' and new.status in ('cancelled','completed'))) then
      raise exception 'Invalid booking status change: % -> %', old.status, new.status using errcode = '23514';
    end if;
  end if;
  if new.student_id <> old.student_id or new.tutor_id <> old.tutor_id or new.starts_at <> old.starts_at
     or new.duration_minutes <> old.duration_minutes or new.price_etb <> old.price_etb then
    raise exception 'Booking details cannot be changed after creation.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists bookings_validate_transition on public.bookings;
create trigger bookings_validate_transition before update on public.bookings
  for each row execute function public.validate_booking_transition();

alter table public.bookings enable row level security;
revoke all on public.bookings from anon, authenticated;
grant select on public.bookings to authenticated;     -- all writes go through the RPCs below
create policy bookings_select_participants on public.bookings for select to authenticated
  using ((select auth.uid()) in (student_id, tutor_id));
create policy bookings_select_admin on public.bookings for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Conversations & messages (one conversation per booking)
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists conversations_student_idx on public.conversations (student_id, last_message_at desc);
create index if not exists conversations_tutor_idx on public.conversations (tutor_id, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

create or replace function public.can_message(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.conversations c join public.bookings b on b.id = c.booking_id
    where c.id = p_conversation and auth.uid() in (c.student_id, c.tutor_id)
      and b.status in ('pending','accepted','completed'));
$$;
create or replace function public.is_participant(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.conversations c where c.id = p_conversation and auth.uid() in (c.student_id, c.tutor_id));
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
revoke all on public.conversations, public.messages from anon, authenticated;
grant select on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
create policy conversations_select_participants on public.conversations for select to authenticated
  using ((select auth.uid()) in (student_id, tutor_id));
create policy messages_select_participants on public.messages for select to authenticated
  using (public.is_participant(conversation_id));
create policy messages_insert_participants on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.can_message(conversation_id));

-- ---------------------------------------------------------------------------
-- Notifications (written only by trusted functions/triggers)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  ref_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text, p_ref uuid default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (user_id, type, title, body, link, ref_id) values (p_user, p_type, p_title, p_body, p_link, p_ref);
$$;
revoke execute on function public.notify(uuid, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.notifications set is_read = true
  where user_id = auth.uid() and not is_read and (p_ids is null or id = any (p_ids));
$$;

create or replace function public.on_message_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.conversations; other uuid; sender text;
begin
  select * into c from public.conversations where id = new.conversation_id;
  update public.conversations set last_message_at = new.created_at where id = c.id;
  other := case when new.sender_id = c.student_id then c.tutor_id else c.student_id end;
  if not exists (select 1 from public.notifications n where n.user_id = other and n.type = 'message' and n.ref_id = c.id and not n.is_read) then
    select display_name into sender from public.profiles where id = new.sender_id;
    perform public.notify(other, 'message', 'New message from ' || coalesce(sender, 'EduPath user'), left(new.body, 120), '/messages/' || c.id, c.id);
  end if;
  return new;
end $$;
drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert after insert on public.messages for each row execute function public.on_message_insert();

create or replace function public.mark_conversation_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_participant(p_conversation) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  update public.messages set read_at = now() where conversation_id = p_conversation and sender_id <> auth.uid() and read_at is null;
  update public.notifications set is_read = true where user_id = auth.uid() and type = 'message' and ref_id = p_conversation and not is_read;
end $$;

-- ---------------------------------------------------------------------------
-- Booking RPCs (the only way to create/change bookings)
-- ---------------------------------------------------------------------------
create or replace function public.request_booking(
  p_tutor uuid, p_subject text, p_mode text, p_starts_at timestamptz, p_duration integer, p_note text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  t public.tutor_profiles;
  v_local timestamp; v_smin int; v_emin int; v_dow int;
  v_price int; v_id uuid; v_name text; v_conv uuid;
begin
  if uid is null then raise exception 'Please sign in to book.' using errcode = '28000'; end if;
  if not (public.has_role(uid, 'student') or public.has_role(uid, 'parent')) then
    raise exception 'Only student or parent accounts can request sessions.' using errcode = '42501';
  end if;
  if p_tutor = uid then raise exception 'You cannot book yourself.'; end if;
  select * into t from public.tutor_profiles where user_id = p_tutor;
  if not found or not t.is_searchable or t.verification_status <> 'verified' then
    raise exception 'This tutor is not available for booking.';
  end if;
  if not t.accepting_bookings then raise exception 'This tutor is not accepting new bookings right now.'; end if;
  if t.hourly_rate_etb is null then raise exception 'This tutor has not set a price yet.'; end if;
  if p_duration not in (30,60,90,120) then raise exception 'Choose a session length of 30, 60, 90 or 120 minutes.'; end if;
  if p_mode not in ('in_person','online') or not (p_mode = any (t.teaching_modes)) then
    raise exception 'This tutor does not offer that session type.';
  end if;
  p_subject := btrim(coalesce(p_subject, ''));
  if p_subject = '' or not exists (select 1 from unnest(t.subjects) s where lower(s) = lower(p_subject)) then
    raise exception 'Choose one of the tutor''s subjects.';
  end if;
  p_note := nullif(btrim(coalesce(p_note, '')), '');
  if p_note is not null and char_length(p_note) > 500 then raise exception 'Notes can be at most 500 characters.'; end if;
  if p_starts_at < now() + interval '1 hour' then raise exception 'Sessions must be booked at least 1 hour ahead.'; end if;
  if p_starts_at > now() + interval '60 days' then raise exception 'Sessions can be booked up to 60 days ahead.'; end if;

  v_local := p_starts_at at time zone 'Africa/Addis_Ababa';
  if extract(second from v_local) <> 0 or (extract(minute from v_local)::int % 30) <> 0 then
    raise exception 'Sessions must start on the hour or half hour.';
  end if;
  v_smin := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_emin := v_smin + p_duration;
  v_dow := extract(dow from v_local)::int;
  if not exists (select 1 from public.tutor_availability a
                 where a.tutor_id = p_tutor and a.weekday = v_dow and a.start_min <= v_smin and a.end_min >= v_emin) then
    raise exception 'That time is outside the tutor''s availability.';
  end if;

  v_price := round(t.hourly_rate_etb * p_duration / 60.0);
  begin
    insert into public.bookings (student_id, tutor_id, subject, mode, starts_at, duration_minutes, ends_at, note, price_etb)
    values (uid, p_tutor, p_subject, p_mode, p_starts_at, p_duration,
            p_starts_at + (p_duration * interval '1 minute'), p_note, v_price)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'That time slot is no longer available. Please pick another.' using errcode = '23P01';
  end;

  insert into public.conversations (booking_id, student_id, tutor_id) values (v_id, uid, p_tutor) returning id into v_conv;
  select display_name into v_name from public.profiles where id = uid;
  perform public.notify(p_tutor, 'booking_request', 'New booking request',
    coalesce(v_name, 'A learner') || ' requested ' || p_subject || '.', '/bookings', v_id);
  return v_id;
end $$;

create or replace function public.respond_booking(p_booking uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); b public.bookings; v_name text;
begin
  if uid is null then raise exception 'Please sign in.' using errcode = '28000'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.tutor_id <> uid then raise exception 'Booking not found.' using errcode = '42501'; end if;
  if b.status <> 'pending' then raise exception 'Only pending requests can be answered.'; end if;
  if p_accept and b.starts_at <= now() then raise exception 'This session time has already passed.'; end if;
  update public.bookings set status = case when p_accept then 'accepted' else 'rejected' end::public.booking_status, responded_at = now() where id = b.id;
  select display_name into v_name from public.profiles where id = uid;
  perform public.notify(b.student_id, case when p_accept then 'booking_accepted' else 'booking_rejected' end,
    case when p_accept then 'Booking accepted' else 'Booking declined' end,
    coalesce(v_name, 'Your tutor') || (case when p_accept then ' accepted' else ' declined' end) || ' your ' || b.subject || ' request.',
    '/bookings', b.id);
end $$;

create or replace function public.cancel_booking(p_booking uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); b public.bookings; other uuid; v_name text;
begin
  if uid is null then raise exception 'Please sign in.' using errcode = '28000'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found or uid not in (b.student_id, b.tutor_id) then raise exception 'Booking not found.' using errcode = '42501'; end if;
  if b.status not in ('pending','accepted') then raise exception 'This booking can no longer be cancelled.'; end if;
  if b.status = 'accepted' and b.starts_at <= now() then raise exception 'Sessions that have started cannot be cancelled.'; end if;
  p_reason := left(nullif(btrim(coalesce(p_reason, '')), ''), 300);
  update public.bookings set status = 'cancelled', cancelled_by = uid, cancel_reason = p_reason where id = b.id;
  other := case when uid = b.student_id then b.tutor_id else b.student_id end;
  select display_name into v_name from public.profiles where id = uid;
  perform public.notify(other, 'booking_cancelled', 'Booking cancelled',
    coalesce(v_name, 'The other party') || ' cancelled the ' || b.subject || ' session.', '/bookings', b.id);
end $$;

create or replace function public.complete_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); b public.bookings;
begin
  if uid is null then raise exception 'Please sign in.' using errcode = '28000'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.tutor_id <> uid then raise exception 'Booking not found.' using errcode = '42501'; end if;
  if b.status <> 'accepted' then raise exception 'Only accepted sessions can be completed.'; end if;
  if b.starts_at > now() then raise exception 'You can complete a session once it has started.'; end if;
  update public.bookings set status = 'completed' where id = b.id;
  perform public.notify(b.student_id, 'booking_completed', 'Session completed',
    'Your ' || b.subject || ' session is complete. You can now leave a review.', '/bookings', b.id);
end $$;

-- Busy ranges only (no identities) so the booking form can hide taken slots.
create or replace function public.tutor_busy_slots(p_tutor uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.starts_at, b.ends_at from public.bookings b
  where b.tutor_id = p_tutor and b.status in ('pending','accepted')
    and b.starts_at < p_to and b.ends_at > p_from
    and exists (select 1 from public.tutor_profiles t where t.user_id = p_tutor and t.is_searchable and t.verification_status = 'verified');
$$;

-- ---------------------------------------------------------------------------
-- Favorites
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tutor_id),
  check (user_id <> tutor_id)
);
alter table public.favorites enable row level security;
revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
create policy favorites_select_own on public.favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy favorites_insert_own on public.favorites for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.tutor_profiles t where t.user_id = tutor_id and t.is_searchable and t.verification_status = 'verified'));
create policy favorites_delete_own on public.favorites for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Reviews: only the learner of a COMPLETED booking, once per booking.
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles(user_id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reviews_tutor_idx on public.reviews (tutor_id, created_at desc);
drop trigger if exists reviews_updated_at on public.reviews;
create trigger reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select, insert, delete on public.reviews to authenticated;
grant update (rating, comment) on public.reviews to authenticated;

create policy reviews_select_participants on public.reviews for select to authenticated
  using ((select auth.uid()) in (student_id, tutor_id) or public.is_admin());
create policy reviews_insert_completed on public.reviews for insert to authenticated with check (
  student_id = (select auth.uid())
  and exists (select 1 from public.bookings b where b.id = booking_id and b.student_id = (select auth.uid())
              and b.tutor_id = reviews.tutor_id and b.status = 'completed'));
create policy reviews_update_own on public.reviews for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy reviews_delete_own_or_admin on public.reviews for delete to authenticated
  using (student_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Public read models (expose only public columns; owner-rights views by design)
-- ---------------------------------------------------------------------------
create or replace view public.public_tutors as
select t.user_id, t.kind, p.display_name, t.headline, t.bio, t.teaching_modes, t.subjects, t.grade_levels,
       t.languages, t.hourly_rate_etb, t.service_area, t.travel_radius_km, t.university, t.field_of_study,
       t.qualifications, t.accepting_bookings,
       coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.tutor_id = t.user_id), 0) as avg_rating,
       (select count(*) from public.reviews r where r.tutor_id = t.user_id)::int as review_count,
       coalesce((select array_agg(distinct a.weekday order by a.weekday) from public.tutor_availability a where a.tutor_id = t.user_id), '{}'::smallint[]) as available_days
from public.tutor_profiles t join public.profiles p on p.id = t.user_id
where t.is_searchable and t.verification_status = 'verified';
grant select on public.public_tutors to anon, authenticated;

create or replace view public.public_reviews as
select r.id, r.tutor_id, r.rating, r.comment, r.created_at, split_part(p.display_name, ' ', 1) as reviewer_first_name
from public.reviews r join public.profiles p on p.id = r.student_id
where exists (select 1 from public.tutor_profiles t where t.user_id = r.tutor_id and t.is_searchable and t.verification_status = 'verified');
grant select on public.public_reviews to anon, authenticated;

create or replace view public.booking_details as
select b.id, b.student_id, b.tutor_id, b.subject, b.mode, b.starts_at, b.ends_at, b.duration_minutes, b.note,
       b.price_etb, b.status, b.cancelled_by, b.cancel_reason, b.responded_at, b.created_at,
       sp.display_name as student_name, tp.display_name as tutor_name, c.id as conversation_id,
       (r.id is not null) as has_review
from public.bookings b
join public.profiles sp on sp.id = b.student_id
join public.profiles tp on tp.id = b.tutor_id
left join public.conversations c on c.booking_id = b.id
left join public.reviews r on r.booking_id = b.id
where auth.uid() in (b.student_id, b.tutor_id);
revoke all on public.booking_details from anon;
grant select on public.booking_details to authenticated;

create or replace view public.my_conversations as
select c.id, c.booking_id, c.last_message_at, c.student_id, c.tutor_id,
       case when auth.uid() = c.student_id then tp.display_name else sp.display_name end as other_name,
       b.subject, b.status as booking_status, b.starts_at,
       (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.read_at is null)::int as unread
from public.conversations c
join public.bookings b on b.id = c.booking_id
join public.profiles sp on sp.id = c.student_id
join public.profiles tp on tp.id = c.tutor_id
where auth.uid() in (c.student_id, c.tutor_id);
revoke all on public.my_conversations from anon;
grant select on public.my_conversations to authenticated;

-- ---------------------------------------------------------------------------
-- Tutor verification workflow
-- ---------------------------------------------------------------------------
create or replace function public.submit_for_verification() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); t public.tutor_profiles; a uuid; v_name text;
begin
  if uid is null then raise exception 'Please sign in.' using errcode = '28000'; end if;
  select * into t from public.tutor_profiles where user_id = uid;
  if not found then raise exception 'You do not have a tutor or mentor profile.' using errcode = '42501'; end if;
  if t.verification_status not in ('incomplete','rejected') then raise exception 'Your profile is already submitted or verified.'; end if;
  if coalesce(btrim(t.headline), '') = '' or char_length(coalesce(t.bio, '')) < 30
     or cardinality(t.subjects) = 0 or cardinality(t.grade_levels) = 0 or cardinality(t.teaching_modes) = 0
     or t.hourly_rate_etb is null or coalesce(btrim(t.service_area), '') = '' or coalesce(btrim(t.qualifications), '') = '' then
    raise exception 'Complete your headline, bio (30+ characters), subjects, levels, session types, price, location and qualifications first.';
  end if;
  update public.tutor_profiles set verification_status = 'pending', verification_submitted_at = now(), verification_note = null where user_id = uid;
  select display_name into v_name from public.profiles where id = uid;
  for a in select user_id from public.admins loop
    perform public.notify(a, 'verification_submitted', 'Tutor awaiting review', coalesce(v_name, 'A tutor') || ' submitted a profile for verification.', '/admin', uid);
  end loop;
end $$;

create or replace function public.admin_list_tutors(p_status public.verification_status default null)
returns table (user_id uuid, kind text, display_name text, email text, headline text, bio text, subjects text[], grade_levels text[],
               hourly_rate_etb integer, service_area text, university text, field_of_study text, qualifications text,
               verification_status public.verification_status, verification_note text, verification_submitted_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Not allowed.' using errcode = '42501'; end if;
  return query
    select t.user_id, t.kind, p.display_name, u.email::text, t.headline, t.bio, t.subjects, t.grade_levels, t.hourly_rate_etb,
           t.service_area, t.university, t.field_of_study, t.qualifications, t.verification_status, t.verification_note, t.verification_submitted_at
    from public.tutor_profiles t join public.profiles p on p.id = t.user_id join auth.users u on u.id = t.user_id
    where (p_status is null or t.verification_status = p_status)
    order by t.verification_submitted_at nulls last, p.display_name;
end $$;

create or replace function public.admin_set_verification(p_user uuid, p_status public.verification_status, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p_status not in ('verified','rejected','pending') then raise exception 'Invalid status.'; end if;
  update public.tutor_profiles
     set verification_status = p_status, is_searchable = (p_status = 'verified'),
         verification_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500)
   where user_id = p_user;
  if not found then raise exception 'Tutor not found.'; end if;
  perform public.notify(p_user, 'verification_' || p_status::text,
    case p_status when 'verified' then 'You are verified' when 'rejected' then 'Verification needs changes' else 'Verification pending' end,
    case p_status when 'verified' then 'Your profile is now visible to learners.'
                  else coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Please review your profile and resubmit.') end,
    '/dashboard', p_user);
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing is callable by anon; signed-in users get only the intended entry points.
-- ---------------------------------------------------------------------------
revoke execute on function public.request_booking(uuid, text, text, timestamptz, integer, text) from public, anon;
revoke execute on function public.respond_booking(uuid, boolean) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.complete_booking(uuid) from public, anon;
revoke execute on function public.become_tutor(text) from public, anon;
revoke execute on function public.submit_for_verification() from public, anon;
revoke execute on function public.admin_list_tutors(public.verification_status) from public, anon;
revoke execute on function public.admin_set_verification(uuid, public.verification_status, text) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.can_message(uuid) from public, anon;
revoke execute on function public.is_participant(uuid) from public, anon;
revoke execute on function public.tutor_busy_slots(uuid, timestamptz, timestamptz) from public;
grant execute on function public.request_booking(uuid, text, text, timestamptz, integer, text) to authenticated;
grant execute on function public.respond_booking(uuid, boolean) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;
grant execute on function public.become_tutor(text) to authenticated;
grant execute on function public.submit_for_verification() to authenticated;
grant execute on function public.admin_list_tutors(public.verification_status) to authenticated;
grant execute on function public.admin_set_verification(uuid, public.verification_status, text) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_message(uuid) to authenticated;
grant execute on function public.is_participant(uuid) to authenticated;
grant execute on function public.tutor_busy_slots(uuid, timestamptz, timestamptz) to anon, authenticated;
