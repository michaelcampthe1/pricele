-- Game logic: scoring, official submissions, results aggregation, practice and guest claiming.
-- Every function here is SECURITY DEFINER and executable only by service_role. The Next.js
-- server authenticates the player (Supabase Auth JWT or a hashed guest-session token) and
-- passes the verified identity in; clients can never call these directly.

-- ---------------------------------------------------------------------------
-- Scoring (authoritative). Exact numeric arithmetic, natural log.
--   S = round(1000 / (1 + |ln(G / A)|))
-- `round` on numeric rounds half away from zero. Mirrored (and parity-tested) by
-- lib/scoring/score.ts, which is used for unit tests and documentation only.
-- ---------------------------------------------------------------------------
create or replace function public.pricele_score(p_guess numeric, p_answer numeric)
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  if p_guess is null or p_answer is null then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_guess <= 0 or p_answer <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_guess > 1000000000000000 or p_answer > 1000000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  return round(1000 / (1 + abs(ln(p_guess) - ln(p_answer))))::integer;
end;
$$;

create or replace function public.pricele_percentage_error(p_guess numeric, p_answer numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- Explicit dividend scale: numeric division otherwise keeps only ~16 significant digits,
  -- which loses precision for very large guess/answer ratios.
  select round(abs(p_guess - p_answer)::numeric(40, 20) * 100 / p_answer, 6)
$$;

create or replace function private.scoring_version()
returns text
language sql
immutable
set search_path = ''
as $$ select 'log-ratio-v1'::text $$;

create or replace function private.normalize_guess(p_guess numeric)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_guess is null or p_guess <> p_guess then
    return null;
  end if;
  -- Guesses carry at most cents. Anything finer is rounded half-up to the cent.
  p_guess := round(p_guess, 2);
  if p_guess < 0.01 or p_guess > 1000000000000000 then
    return null;
  end if;
  return p_guess;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest session validation
-- ---------------------------------------------------------------------------
create or replace function private.guest_session_usable(p_guest_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.guest_sessions g
    where g.id = p_guest_session_id
      and g.revoked_at is null
      and g.claimed_at is null
      and g.expires_at > now()
  )
$$;

-- ---------------------------------------------------------------------------
-- Daily result aggregation. Rebuilds one user's result for one set from their non-voided
-- official attempts. A result exists only when every non-withdrawn question is answered.
-- ---------------------------------------------------------------------------
create or replace function private.refresh_daily_result(p_daily_set_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_date date;
  v_required integer;
  v_answered integer;
begin
  -- Serialize per (set, user) so concurrent final submissions cannot both miss completion.
  perform pg_advisory_xact_lock(hashtextextended(p_daily_set_id::text || ':' || p_user_id::text, 0));

  select s.game_date into v_game_date
  from public.daily_sets s where s.id = p_daily_set_id;

  select count(*) into v_required
  from public.daily_set_questions dsq
  join public.questions q on q.id = dsq.question_id
  where dsq.daily_set_id = p_daily_set_id and q.status <> 'withdrawn';

  select count(*) into v_answered
  from public.official_attempts a
  where a.daily_set_id = p_daily_set_id and a.user_id = p_user_id and not a.voided;

  if v_required = 0 or v_answered < v_required then
    delete from public.daily_results where daily_set_id = p_daily_set_id and user_id = p_user_id;
    return;
  end if;

  insert into public.daily_results as r (
    daily_set_id, game_date, user_id, total_score, easy_score, medium_score, hard_score,
    perfect_guess_count, completed_at
  )
  select
    p_daily_set_id,
    v_game_date,
    p_user_id,
    coalesce(sum(a.score), 0),
    coalesce(sum(a.score) filter (where a.position = 1), 0),
    coalesce(sum(a.score) filter (where a.position = 2), 0),
    coalesce(sum(a.score) filter (where a.position = 3), 0),
    count(*) filter (where a.score = 1000),
    max(a.submitted_at)
  from public.official_attempts a
  where a.daily_set_id = p_daily_set_id and a.user_id = p_user_id and not a.voided
  on conflict (daily_set_id, user_id) do update set
    game_date = excluded.game_date,
    total_score = excluded.total_score,
    easy_score = excluded.easy_score,
    medium_score = excluded.medium_score,
    hard_score = excluded.hard_score,
    perfect_guess_count = excluded.perfect_guess_count,
    completed_at = excluded.completed_at;
end;
$$;

create or replace function private.refresh_set_results(p_daily_set_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct a.user_id from public.official_attempts a
    where a.daily_set_id = p_daily_set_id and a.user_id is not null
    union
    select r.user_id from public.daily_results r where r.daily_set_id = p_daily_set_id
  loop
    perform private.refresh_daily_result(p_daily_set_id, v_user);
  end loop;
end;
$$;

create or replace function private.attempt_json(a public.official_attempts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'attempt_id', a.id,
    'daily_set_id', a.daily_set_id,
    'question_id', a.question_id,
    'position', a.position,
    'guess_amount', a.guess_amount::text,
    'answer_amount', a.answer_snapshot::text,
    'score', a.score,
    'absolute_percentage_error', a.absolute_percentage_error::text,
    'scoring_version', a.scoring_version,
    'voided', a.voided,
    'submitted_at', a.submitted_at
  )
$$;

-- ---------------------------------------------------------------------------
-- Official submission (atomic, idempotent)
-- Returns jsonb: { ok: true, already_submitted, attempt: {...}, set_complete }
--            or  { ok: false, error: <code> }
-- ---------------------------------------------------------------------------
create or replace function public.submit_official_guess(
  p_question_id uuid,
  p_guess numeric,
  p_user_id uuid default null,
  p_guest_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.official_attempts;
  v_inserted public.official_attempts;
  v_set_id uuid;
  v_game_date date;
  v_status public.daily_set_status;
  v_position smallint;
  v_question public.questions;
  v_answer numeric;
  v_guess numeric;
  v_required integer;
  v_answered integer;
begin
  if num_nonnulls(p_user_id, p_guest_session_id) <> 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_identity');
  end if;

  -- Idempotency first: a retried request returns the stored result, never a second score.
  select * into v_existing from public.official_attempts a
  where a.question_id = p_question_id
    and ((p_user_id is not null and a.user_id = p_user_id)
      or (p_guest_session_id is not null and a.guest_session_id = p_guest_session_id));
  if found then
    return jsonb_build_object('ok', true, 'already_submitted', true,
      'attempt', private.attempt_json(v_existing), 'set_complete', null);
  end if;

  if p_user_id is not null then
    if not exists (select 1 from public.profiles p where p.id = p_user_id) then
      return jsonb_build_object('ok', false, 'error', 'unauthorized');
    end if;
    if exists (select 1 from public.profiles p where p.id = p_user_id and p.suspended_at is not null) then
      return jsonb_build_object('ok', false, 'error', 'account_suspended');
    end if;
  else
    if not private.guest_session_usable(p_guest_session_id) then
      return jsonb_build_object('ok', false, 'error', 'guest_session_invalid');
    end if;
  end if;

  v_guess := private.normalize_guess(p_guess);
  if v_guess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_guess');
  end if;

  -- The question must belong to TODAY's live set (Eastern Time, server clock).
  select dsq.position, s.id, s.game_date, s.status
  into v_position, v_set_id, v_game_date, v_status
  from public.daily_set_questions dsq
  join public.daily_sets s on s.id = dsq.daily_set_id
  where dsq.question_id = p_question_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;
  if v_status not in ('scheduled', 'published') then
    return jsonb_build_object('ok', false, 'error', 'set_not_published');
  end if;
  if v_game_date <> private.current_game_date() then
    return jsonb_build_object('ok', false, 'error', 'question_not_current');
  end if;

  select * into v_question from public.questions q where q.id = p_question_id;
  if v_question.status = 'withdrawn' then
    return jsonb_build_object('ok', false, 'error', 'question_withdrawn');
  end if;

  select qa.answer_amount into v_answer from public.question_answers qa where qa.question_id = p_question_id;
  if v_answer is null or v_answer <= 0 then
    return jsonb_build_object('ok', false, 'error', 'answer_unavailable');
  end if;

  insert into public.official_attempts (
    daily_set_id, question_id, position, user_id, guest_session_id, guess_amount,
    answer_snapshot, score, absolute_percentage_error, scoring_version
  ) values (
    v_set_id, p_question_id, v_position, p_user_id, p_guest_session_id, v_guess,
    v_answer, public.pricele_score(v_guess, v_answer),
    public.pricele_percentage_error(v_guess, v_answer), private.scoring_version()
  )
  on conflict do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    -- Lost a race with a concurrent identical request: return the winner's row.
    select * into v_existing from public.official_attempts a
    where a.question_id = p_question_id
      and ((p_user_id is not null and a.user_id = p_user_id)
        or (p_guest_session_id is not null and a.guest_session_id = p_guest_session_id));
    return jsonb_build_object('ok', true, 'already_submitted', true,
      'attempt', private.attempt_json(v_existing), 'set_complete', null);
  end if;

  if p_user_id is not null then
    perform private.refresh_daily_result(v_set_id, p_user_id);
  else
    update public.guest_sessions set last_seen_at = now() where id = p_guest_session_id;
  end if;

  select count(*) into v_required
  from public.daily_set_questions dsq
  join public.questions q on q.id = dsq.question_id
  where dsq.daily_set_id = v_set_id and q.status <> 'withdrawn';
  select count(*) into v_answered
  from public.official_attempts a
  where a.daily_set_id = v_set_id and not a.voided
    and ((p_user_id is not null and a.user_id = p_user_id)
      or (p_guest_session_id is not null and a.guest_session_id = p_guest_session_id));

  return jsonb_build_object('ok', true, 'already_submitted', false,
    'attempt', private.attempt_json(v_inserted), 'set_complete', v_answered >= v_required);
end;
$$;

-- ---------------------------------------------------------------------------
-- Practice submission (archive only: past live sets). One practice guess per question.
-- ---------------------------------------------------------------------------
create or replace function public.submit_practice_guess(
  p_question_id uuid,
  p_guess numeric,
  p_user_id uuid default null,
  p_guest_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.practice_attempts;
  v_inserted public.practice_attempts;
  v_set_id uuid;
  v_game_date date;
  v_status public.daily_set_status;
  v_answer numeric;
  v_guess numeric;
begin
  if num_nonnulls(p_user_id, p_guest_session_id) <> 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_identity');
  end if;

  select * into v_existing from public.practice_attempts a
  where a.question_id = p_question_id
    and ((p_user_id is not null and a.user_id = p_user_id)
      or (p_guest_session_id is not null and a.guest_session_id = p_guest_session_id));
  if found then
    return jsonb_build_object('ok', true, 'already_submitted', true, 'attempt', jsonb_build_object(
      'question_id', v_existing.question_id, 'guess_amount', v_existing.guess_amount::text,
      'answer_amount', v_existing.answer_snapshot::text, 'score', v_existing.score,
      'absolute_percentage_error', v_existing.absolute_percentage_error::text));
  end if;

  if p_guest_session_id is not null and not private.guest_session_usable(p_guest_session_id) then
    return jsonb_build_object('ok', false, 'error', 'guest_session_invalid');
  end if;

  -- An official result is never overwritten or duplicated by practice.
  if exists (
    select 1 from public.official_attempts a
    where a.question_id = p_question_id
      and ((p_user_id is not null and a.user_id = p_user_id)
        or (p_guest_session_id is not null and a.guest_session_id = p_guest_session_id))
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_played_official');
  end if;

  v_guess := private.normalize_guess(p_guess);
  if v_guess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_guess');
  end if;

  select s.id, s.game_date, s.status into v_set_id, v_game_date, v_status
  from public.daily_set_questions dsq
  join public.daily_sets s on s.id = dsq.daily_set_id
  where dsq.question_id = p_question_id;
  if not found or v_status not in ('scheduled', 'published') then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;
  if v_game_date >= private.current_game_date() then
    -- Today's questions are official-only; future questions are invisible.
    return jsonb_build_object('ok', false, 'error', 'practice_not_available');
  end if;
  if exists (select 1 from public.questions q where q.id = p_question_id and q.status = 'withdrawn') then
    return jsonb_build_object('ok', false, 'error', 'question_withdrawn');
  end if;

  select qa.answer_amount into v_answer from public.question_answers qa where qa.question_id = p_question_id;
  if v_answer is null then
    return jsonb_build_object('ok', false, 'error', 'answer_unavailable');
  end if;

  insert into public.practice_attempts (
    daily_set_id, question_id, user_id, guest_session_id, guess_amount, answer_snapshot,
    score, absolute_percentage_error, scoring_version
  ) values (
    v_set_id, p_question_id, p_user_id, p_guest_session_id, v_guess, v_answer,
    public.pricele_score(v_guess, v_answer), public.pricele_percentage_error(v_guess, v_answer),
    private.scoring_version()
  )
  on conflict do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    select * into v_inserted from public.practice_attempts a
    where a.question_id = p_question_id
      and ((p_user_id is not null and a.user_id = p_user_id)
        or (p_guest_session_id is not null and a.guest_session_id = p_guest_session_id));
  end if;

  return jsonb_build_object('ok', true, 'already_submitted', false, 'attempt', jsonb_build_object(
    'question_id', v_inserted.question_id, 'guess_amount', v_inserted.guess_amount::text,
    'answer_amount', v_inserted.answer_snapshot::text, 'score', v_inserted.score,
    'absolute_percentage_error', v_inserted.absolute_percentage_error::text));
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest claiming
-- Transfers a guest session's official attempts to an authenticated user, one daily set at
-- a time, inside a single transaction. A set is skipped when the user already has any
-- official attempt in it (no merging, no double counting). Attempts are re-validated: they
-- must have been submitted on the set's own Eastern Time game date. Practice attempts are
-- never transferred into official records.
-- ---------------------------------------------------------------------------
create or replace function public.claim_guest_session(p_guest_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.guest_sessions;
  v_set record;
  v_claimed_sets integer := 0;
  v_skipped_sets integer := 0;
  v_claimed_attempts integer := 0;
  v_moved integer;
begin
  if p_guest_session_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_identity');
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.suspended_at is null) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_session from public.guest_sessions g where g.id = p_guest_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'guest_session_invalid');
  end if;
  if v_session.claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'guest_session_already_claimed');
  end if;
  if v_session.revoked_at is not null or v_session.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'guest_session_invalid');
  end if;

  for v_set in
    select distinct a.daily_set_id, s.game_date, s.status
    from public.official_attempts a
    join public.daily_sets s on s.id = a.daily_set_id
    where a.guest_session_id = p_guest_session_id
    order by s.game_date
  loop
    if v_set.status not in ('scheduled', 'published')
       or exists (select 1 from public.official_attempts a
                  where a.daily_set_id = v_set.daily_set_id and a.user_id = p_user_id)
       or exists (select 1 from public.official_attempts a
                  where a.daily_set_id = v_set.daily_set_id
                    and a.guest_session_id = p_guest_session_id
                    and (a.submitted_at at time zone 'America/New_York')::date <> v_set.game_date)
    then
      v_skipped_sets := v_skipped_sets + 1;
      continue;
    end if;

    update public.official_attempts a
    set user_id = p_user_id,
        guest_session_id = null,
        claimed_from_guest_session_id = p_guest_session_id
    where a.daily_set_id = v_set.daily_set_id and a.guest_session_id = p_guest_session_id;
    get diagnostics v_moved = row_count;

    v_claimed_attempts := v_claimed_attempts + v_moved;
    v_claimed_sets := v_claimed_sets + 1;
    perform private.refresh_daily_result(v_set.daily_set_id, p_user_id);
  end loop;

  -- Guest practice attempts follow the player only where it cannot collide with their own.
  update public.practice_attempts pa
  set user_id = p_user_id, guest_session_id = null
  where pa.guest_session_id = p_guest_session_id
    and not exists (select 1 from public.practice_attempts mine
                    where mine.user_id = p_user_id and mine.question_id = pa.question_id)
    and not exists (select 1 from public.official_attempts o
                    where o.user_id = p_user_id and o.question_id = pa.question_id);

  update public.guest_sessions
  set claimed_by = p_user_id, claimed_at = now()
  where id = p_guest_session_id;

  return jsonb_build_object('ok', true, 'claimed_sets', v_claimed_sets,
    'skipped_sets', v_skipped_sets, 'claimed_attempts', v_claimed_attempts);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window, shared across all server instances)
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into private.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily maintenance (called by the authenticated cron route)
-- ---------------------------------------------------------------------------
create or replace function public.run_daily_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promoted integer;
  v_guest_deleted integer;
  v_limits_deleted integer;
begin
  -- Scheduled sets whose date has arrived become published (visibility is already date-gated).
  with promoted as (
    update public.daily_sets
    set status = 'published', went_live_at = coalesce(went_live_at, now())
    where status = 'scheduled' and game_date <= private.current_game_date()
    returning id, game_date
  )
  select count(*) into v_promoted from promoted;

  update public.daily_sets set went_live_at = now()
  where status = 'published' and went_live_at is null and game_date <= private.current_game_date();

  -- Unclaimed guest sessions are removed 30 days after expiry (their attempts cascade).
  delete from public.guest_sessions
  where claimed_at is null and expires_at < now() - interval '30 days';
  get diagnostics v_guest_deleted = row_count;

  delete from private.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_limits_deleted = row_count;

  if v_promoted > 0 then
    insert into public.admin_audit_log (admin_user_id, action, entity_type, details)
    values (null, 'daily_sets.auto_publish', 'daily_set', jsonb_build_object('count', v_promoted));
  end if;

  return jsonb_build_object(
    'promoted_sets', v_promoted,
    'deleted_guest_sessions', v_guest_deleted,
    'deleted_rate_limit_rows', v_limits_deleted,
    'game_date', private.current_game_date(),
    'upcoming', (
      select coalesce(jsonb_agg(jsonb_build_object('game_date', d::date, 'status', s.status) order by d), '[]'::jsonb)
      from generate_series(private.current_game_date(), private.current_game_date() + 6, interval '1 day') d
      left join public.daily_sets s on s.game_date = d::date and s.status <> 'withdrawn'
    )
  );
end;
$$;

grant execute on function public.pricele_score(numeric, numeric) to service_role;
grant execute on function public.pricele_percentage_error(numeric, numeric) to service_role;
grant execute on function public.submit_official_guess(uuid, numeric, uuid, uuid) to service_role;
grant execute on function public.submit_practice_guess(uuid, numeric, uuid, uuid) to service_role;
grant execute on function public.claim_guest_session(uuid, uuid) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.run_daily_maintenance() to service_role;
grant execute on all functions in schema private to service_role;
