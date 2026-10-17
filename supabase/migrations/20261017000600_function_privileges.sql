-- Authoritative function privileges.
--
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default, and a per-schema
-- ALTER DEFAULT PRIVILEGES cannot remove that global default. Without this migration every
-- SECURITY DEFINER function would be callable by anon/authenticated through the API, e.g.
-- submit_official_guess with someone else's p_user_id. This file revokes everything and
-- re-grants the minimum. Any future migration that adds a function must re-run the same
-- pattern (tests/integration/security.test.ts enforces it).

alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

-- Helpers evaluated inside RLS policies run with the caller's privileges.
grant execute on function private.current_game_date() to anon, authenticated;
grant execute on function private.is_set_live(uuid) to anon, authenticated;
grant execute on function private.is_question_live(uuid) to anon, authenticated;

-- Trigger functions (invoked by the table owner context, listed for completeness).
grant execute on function private.set_updated_at() to anon, authenticated;
grant execute on function private.profiles_guard() to authenticated;
grant execute on function private.is_reserved_username(text) to authenticated;

-- Public leaderboards return only public-safe columns.
grant execute on function public.leaderboard_daily(date, integer, integer, text) to anon, authenticated;
grant execute on function public.leaderboard_weekly(date, integer, integer, text) to anon, authenticated;
grant execute on function public.leaderboard_alltime(integer, integer, text) to anon, authenticated;
