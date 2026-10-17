-- Row-level security, grants and profile provisioning.
--
-- Model
--   anon / authenticated  : read-only access to published, live, player-facing content;
--                           a player can read their own attempts/results and update a small
--                           set of their own profile columns. Nothing else.
--   service_role          : used only by trusted server code (Next.js server, cron, scripts).
--   Answer keys, sources, guest sessions, roles, corrections, audit log, feedback and rate
--   limits have NO policies for anon/authenticated and their table privileges are revoked.

-- Start from zero for the API roles, then grant explicitly.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all tables in schema private to service_role;
grant execute on all functions in schema private to service_role;

-- Helpers referenced from RLS policies must be executable by API roles.
grant execute on function private.current_game_date() to anon, authenticated;
grant execute on function private.is_set_live(uuid) to anon, authenticated;
grant execute on function private.is_question_live(uuid) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.questions enable row level security;
alter table public.question_answers enable row level security;
alter table public.question_sources enable row level security;
alter table public.daily_sets enable row level security;
alter table public.daily_set_questions enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.official_attempts enable row level security;
alter table public.daily_results enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.question_corrections enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.feedback enable row level security;
alter table private.rate_limits enable row level security;

-- Public, player-facing content -------------------------------------------------
grant select on public.categories to anon, authenticated;
create policy categories_read_active on public.categories
  for select to anon, authenticated using (is_active);

grant select on public.daily_sets to anon, authenticated;
create policy daily_sets_read_live on public.daily_sets
  for select to anon, authenticated
  using (status in ('scheduled', 'published') and game_date <= private.current_game_date());

grant select on public.daily_set_questions to anon, authenticated;
create policy daily_set_questions_read_live on public.daily_set_questions
  for select to anon, authenticated using (private.is_set_live(daily_set_id));

-- Column-level grant: player-facing columns only. Internal workflow columns stay private.
grant select (id, prompt, context, difficulty, category_id, status, image_url, image_alt,
              image_credit, correction_note, corrected_at, is_sample)
  on public.questions to anon, authenticated;
create policy questions_read_live on public.questions
  for select to anon, authenticated using (private.is_question_live(id));

-- Profiles -------------------------------------------------------------------------
grant select (id, username, display_name, avatar_url, is_public, created_at)
  on public.profiles to anon, authenticated;
grant update (username, display_name, avatar_url, is_public) on public.profiles to authenticated;

create policy profiles_read_public_or_self on public.profiles
  for select to anon, authenticated
  using (is_public or id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Own records (read-only) ------------------------------------------------------------
grant select on public.official_attempts to authenticated;
create policy official_attempts_read_own on public.official_attempts
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.daily_results to authenticated;
create policy daily_results_read_own on public.daily_results
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.practice_attempts to authenticated;
create policy practice_attempts_read_own on public.practice_attempts
  for select to authenticated using (user_id = (select auth.uid()));

-- Username rules shared by signup trigger and profile updates --------------------------
create or replace function private.is_reserved_username(p_username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_username = any (array[
    'admin', 'administrator', 'pricele', 'support', 'root', 'system', 'moderator', 'mod',
    'staff', 'null', 'undefined', 'me', 'settings', 'api', 'help', 'official', 'team'
  ])
$$;

create or replace function private.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.username := lower(new.username);
  if private.is_reserved_username(new.username) then
    raise exception 'username_reserved' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.username is distinct from old.username then
    new.username_confirmed := true;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function private.profiles_guard();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Provision a profile for each new auth user. A requested username is used when valid and
-- free; otherwise a random player_xxxxxx handle is assigned that the player can change later.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_display text := nullif(left(btrim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name', '')), 40), '');
  v_username text;
  v_confirmed boolean := false;
  v_attempt integer := 0;
begin
  if v_requested ~ '^[a-z0-9_]{3,20}$' and not private.is_reserved_username(v_requested) then
    v_username := v_requested;
    v_confirmed := true;
  end if;

  loop
    if v_username is null then
      v_username := 'player_' || substr(md5(gen_random_uuid()::text), 1, 8);
      v_confirmed := false;
    end if;
    begin
      insert into public.profiles (id, username, display_name, username_confirmed)
      values (new.id, v_username, v_display, v_confirmed);
      exit;
    exception when unique_violation then
      v_username := null;
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then
        raise;
      end if;
    end;
  end loop;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
