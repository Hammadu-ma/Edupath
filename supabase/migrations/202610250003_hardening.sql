-- Hardening after the Supabase security advisor run on the hosted project.
-- 1) Trigger functions must not be callable through the REST API.
revoke execute on function public.on_message_insert() from public, anon, authenticated;
-- 2) Keep extensions out of the public (API-exposed) schema.
create schema if not exists extensions;
alter extension btree_gist set schema extensions;
