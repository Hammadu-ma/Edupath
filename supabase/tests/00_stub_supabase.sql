-- LOCAL TEST HARNESS ONLY. Mimics the parts of Supabase the migrations rely on. Never run against a real project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create schema if not exists test;
create or replace function test.expect_error(label text, q text, pat text default null) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if pat is not null and sqlerrm not ilike '%'||pat||'%' then raise exception 'FAIL % (wrong error: %)', label, sqlerrm; end if;
    raise notice 'PASS  % [denied: %]', label, left(sqlerrm, 70); return;
  end;
  raise exception 'FAIL % (expected an error, got success)', label;
end $$;
create or replace function test.expect_ok(label text, q text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise exception 'FAIL % (unexpected error: %)', label, sqlerrm; end;
  raise notice 'PASS  %', label;
end $$;
create or replace function test.expect_count(label text, q text, n int) returns void language plpgsql as $$
declare c int;
begin
  execute 'select count(*) from (' || q || ') s' into c;
  if c <> n then raise exception 'FAIL % (expected % rows, got %)', label, n, c; end if;
  raise notice 'PASS  % [% rows]', label, c;
end $$;
grant usage on schema test to anon, authenticated;
create or replace function test.expect_affected(label text, q text, n int) returns void language plpgsql as $$
declare c int;
begin
  execute q; get diagnostics c = row_count;
  if c <> n then raise exception 'FAIL % (expected % rows affected, got %)', label, n, c; end if;
  raise notice 'PASS  % [% rows affected]', label, c;
end $$;
