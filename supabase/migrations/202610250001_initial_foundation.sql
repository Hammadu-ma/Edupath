-- EduPath initial schema foundation.
-- Apply only after reviewing the schema and policies for your chosen pilot requirements.
create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'parent', 'tutor', 'mentor', 'admin');
create type public.verification_status as enum ('incomplete', 'pending', 'verified', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  preferred_language text not null default 'en' check (preferred_language in ('en','am','om')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role <> 'admin'),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.tutor_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  headline text,
  bio text,
  teaching_modes text[] not null default '{}',
  subjects text[] not null default '{}',
  grade_levels text[] not null default '{}',
  languages text[] not null default '{}',
  hourly_rate_etb integer check (hourly_rate_etb is null or hourly_rate_etb >= 0),
  service_area text,
  travel_radius_km numeric(5,2) check (travel_radius_km is null or travel_radius_km >= 0),
  verification_status public.verification_status not null default 'incomplete',
  is_searchable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_searchable or verification_status = 'verified')
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.tutor_profiles enable row level security;

-- A user may read/update their own profile. No client-side role escalation.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "roles_select_own" on public.user_roles
  for select to authenticated using ((select auth.uid()) = user_id);
-- Role creation is intentionally server-controlled: no client INSERT/UPDATE/DELETE policies.

-- Public can see only verified, searchable tutor cards. Owners can see their own draft profile.
create policy "tutors_select_verified_or_own" on public.tutor_profiles
  for select to anon, authenticated using (
    (is_searchable = true and verification_status = 'verified')
    or (select auth.uid()) = user_id
  );
create policy "tutors_insert_own_draft" on public.tutor_profiles
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and verification_status = 'incomplete'
    and is_searchable = false
  );
create policy "tutors_update_own_draft" on public.tutor_profiles
  for update to authenticated using (
    (select auth.uid()) = user_id and verification_status in ('incomplete','rejected') and is_searchable = false
  ) with check (
    (select auth.uid()) = user_id and verification_status in ('incomplete','rejected') and is_searchable = false
  );

-- Important: verification_status and is_searchable must be changed only by a trusted server-side
-- process with a narrowly scoped privilege model. Do not use client-supplied user metadata for roles.
