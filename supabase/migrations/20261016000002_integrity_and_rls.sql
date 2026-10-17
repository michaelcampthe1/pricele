-- Integrity triggers (history protection) and row-level security.

-- ---------------------------------------------------------------------------
-- Published content is immutable outside the correction workflow.
-- ---------------------------------------------------------------------------
create or replace function pricele.guard_published_question()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' or exists (
      select 1 from public.daily_set_questions where question_id = old.id
    ) then
      raise exception 'PRICELE_IMMUTABLE: questions assigned to a daily set cannot be deleted';
    end if;
    return old;
  end if;

  if old.status = 'published' and (
       new.prompt is distinct from old.prompt
    or new.context is distinct from old.context
    or new.difficulty is distinct from old.difficulty
    or new.category_id is distinct from old.category_id
    or new.image_url is distinct from old.image_url
    or new.status is distinct from old.status and coalesce(current_setting('pricele.allow_status_change', true), '') <> 'on'
  ) then
    raise exception 'PRICELE_IMMUTABLE: published questions cannot be edited; use the correction workflow';
  end if;
  return new;
end;
$$;

create trigger questions_guard_published
  before update or delete on public.questions
  for each row execute function pricele.guard_published_question();

create or replace function pricele.guard_published_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.questions where id = coalesce(new.question_id, old.question_id);
  if v_status = 'published' then
    if tg_op = 'DELETE' then
      raise exception 'PRICELE_IMMUTABLE: answer keys of published questions cannot be deleted';
    end if;
    if (new.answer_amount is distinct from old.answer_amount
        or new.answer_definition is distinct from old.answer_definition
        or new.reference_date is distinct from old.reference_date
        or new.verification_status is distinct from old.verification_status)
       and coalesce(current_setting('pricele.correction_in_progress', true), '') <> 'on' then
      raise exception 'PRICELE_IMMUTABLE: published answers change only through the correction workflow';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger question_answers_guard_published
  before update or delete on public.question_answers
  for each row execute function pricele.guard_published_answer();

create or replace function pricele.guard_published_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.questions where id = old.question_id and status = 'published') then
    raise exception 'PRICELE_IMMUTABLE: sources of published questions cannot be removed or edited';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger question_sources_guard_published
  before update or delete on public.question_sources
  for each row execute function pricele.guard_published_source();

-- Daily set membership is frozen once a set is scheduled/published, and the
-- position must match the question's difficulty (1=easy, 2=medium, 3=hard).
create or replace function pricele.guard_daily_set_questions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_set_status text;
  v_difficulty text;
  v_q_status text;
begin
  select status into v_set_status from public.daily_sets
   where id = coalesce(new.daily_set_id, old.daily_set_id);

  if v_set_status is distinct from 'draft' and v_set_status is not null then
    raise exception 'PRICELE_IMMUTABLE: questions of a % daily set cannot change', v_set_status;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select difficulty, status into v_difficulty, v_q_status from public.questions where id = new.question_id;
    if v_q_status is distinct from 'approved' then
      raise exception 'PRICELE_INVALID: only approved questions can be assigned to a daily set';
    end if;
    if new.position <> (case v_difficulty when 'easy' then 1 when 'medium' then 2 else 3 end) then
      raise exception 'PRICELE_INVALID: position % does not match difficulty %', new.position, v_difficulty;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger daily_set_questions_guard
  before insert or update or delete on public.daily_set_questions
  for each row execute function pricele.guard_daily_set_questions();

-- Prevent deleting published history.
create or replace function pricele.guard_daily_set_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('scheduled', 'published') then
    raise exception 'PRICELE_IMMUTABLE: published daily sets cannot be deleted';
  end if;
  return old;
end;
$$;

create trigger daily_sets_guard_delete
  before delete on public.daily_sets
  for each row execute function pricele.guard_daily_set_delete();

-- ---------------------------------------------------------------------------
-- Live-content helper used by RLS (security definer avoids recursive policies).
-- ---------------------------------------------------------------------------
create or replace function pricele.now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  -- pricele.test_now lets the automated test suite simulate dates. The server role cannot
  -- set it for other sessions, and production code never sets it.
  select coalesce(nullif(current_setting('pricele.test_now', true), '')::timestamptz, now());
$$;

create or replace function pricele.current_game_date()
returns date
language sql
stable
set search_path = ''
as $$
  select (pricele.now() at time zone 'America/New_York')::date;
$$;

create or replace function pricele.is_set_live(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.daily_sets
     where id = p_set_id
       and status in ('scheduled', 'published')
       and game_date <= pricele.current_game_date()
  );
$$;

create or replace function pricele.is_question_live(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.daily_set_questions dsq
      join public.daily_sets ds on ds.id = dsq.daily_set_id
     where dsq.question_id = p_question_id
       and ds.status in ('scheduled', 'published')
       and ds.game_date <= pricele.current_game_date()
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants broad default privileges to anon/authenticated on
-- new public tables; revoke everything and grant back only what is intended.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema pricele from public;
alter default privileges in schema pricele revoke execute on functions from public;

grant usage on schema pricele to anon, authenticated;
grant execute on function pricele.is_set_live(uuid) to anon, authenticated;
grant execute on function pricele.is_question_live(uuid) to anon, authenticated;
grant execute on function pricele.now() to anon, authenticated;
grant execute on function pricele.current_game_date() to anon, authenticated;

-- Enable RLS on every table.
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_moderation enable row level security;
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
alter table public.official_attempt_revisions enable row level security;
alter table public.question_reports enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.rate_limits enable row level security;

-- Public, safe, player-facing content.
grant select on public.categories to anon, authenticated;
create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_active);

grant select (id, game_date, status) on public.daily_sets to anon, authenticated;
create policy daily_sets_live_read on public.daily_sets
  for select to anon, authenticated using (pricele.is_set_live(id));

grant select (daily_set_id, question_id, position) on public.daily_set_questions to anon, authenticated;
create policy daily_set_questions_live_read on public.daily_set_questions
  for select to anon, authenticated using (pricele.is_set_live(daily_set_id));

grant select (id, prompt, context, difficulty, category_id, image_url, image_alt, image_credit)
  on public.questions to anon, authenticated;
create policy questions_live_read on public.questions
  for select to anon, authenticated using (pricele.is_question_live(id));

-- Public profiles expose only non-sensitive columns.
grant select (id, username, display_name, avatar_url, created_at) on public.profiles to anon, authenticated;
create policy profiles_public_read on public.profiles
  for select to anon, authenticated using (is_public);
grant select (is_public, updated_at) on public.profiles to authenticated;
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = auth.uid());

-- Players may read their own official results/attempts. They can never write them.
grant select on public.daily_results to authenticated;
create policy daily_results_self_read on public.daily_results
  for select to authenticated using (user_id = auth.uid());

grant select on public.official_attempts to authenticated;
create policy official_attempts_self_read on public.official_attempts
  for select to authenticated using (user_id = auth.uid());

grant select on public.practice_attempts to authenticated;
create policy practice_attempts_self_read on public.practice_attempts
  for select to authenticated using (user_id = auth.uid());

-- Deliberately NO grants or policies for: question_answers, question_sources (until reveal),
-- user_roles, user_moderation, guest_sessions, question_corrections, official_attempt_revisions,
-- question_reports, admin_audit_log, rate_limits. These are reachable only through
-- privileged functions in the private pricele schema, which only pricele_app may execute.
