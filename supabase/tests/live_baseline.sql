-- Replica of the hosted EduPath project's schema as found on 2026-10-26 (migration "edupath_initial_schema").
create extension if not exists pgcrypto;
create type public.app_role as enum ('student','parent','tutor','mentor','admin');
create type public.verification_status as enum ('incomplete','pending','verified','rejected');
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, role public.app_role not null default 'student', display_name text not null default '', preferred_language text not null default 'en', education_level text, grade_or_course text, general_area text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.tutor_profiles (user_id uuid primary key references public.profiles(id), bio text not null default '', subjects text[] not null default '{}', grade_levels text[] not null default '{}', languages text[] not null default '{}', teaching_modes text[] not null default '{}', service_area text, travel_radius_km integer check (travel_radius_km is null or (travel_radius_km >= 0 and travel_radius_km <= 200)), hourly_rate numeric check (hourly_rate is null or hourly_rate >= 0), currency text not null default 'ETB', verification_status public.verification_status not null default 'incomplete', is_public boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.profiles enable row level security; alter table public.tutor_profiles enable row level security;
create policy "Users can read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users can create own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users can read own tutor profile" on public.tutor_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create own tutor profile" on public.tutor_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own tutor profile" on public.tutor_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
