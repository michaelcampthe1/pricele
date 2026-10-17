-- Player-facing game logic. Every function here is SECURITY DEFINER, uses an empty
-- search_path with fully-qualified names, and is executable only by pricele_app.
-- Identity is supplied by the trusted Next.js server: either an authenticated user id
-- (verified with Supabase Auth on the server) or the SHA-256 hash of a guest cookie token.

-- ---------------------------------------------------------------------------
-- Scoring (authoritative implementation; mirrored and parity-tested in lib/scoring)
-- ---------------------------------------------------------------------------
create or replace function pricele.scoring_version()
returns text language sql immutable set search_path = '' as $$ select 'log-v1'::text $$;

create or replace function pricele.max_amount()
returns numeric language sql immutable set search_path = '' as $$ select 1000000000000000::numeric $$;

-- S = round(1000 / (1 + |ln(G) - ln(A)|)), natural log, exact NUMERIC arithmetic.
create or replace function pricele.score(p_guess numeric, p_answer numeric)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_guess is null or p_answer is null or p_guess <= 0 or p_answer <= 0 then
    raise exception 'PRICELE_INVALID: guess and answer must be positive';
  end if;
  if p_guess > pricele.max_amount() or p_answer > pricele.max_amount() then
    raise exception 'PRICELE_INVALID: amount exceeds maximum';
  end if;
  return round(1000::numeric / (1 + abs(ln(p_guess) - ln(p_answer))))::integer;
end;
$$;

-- |G - A| / A * 100, stored with 6 decimal places.
create or replace function pricele.percentage_error(p_guess numeric, p_answer numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((abs(p_guess - p_answer) * 100)::numeric(60, 20) / p_answer, 6);
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function pricele.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.user_roles where user_id = p_user_id and role = 'admin'
  );
$$;

create or replace function pricele.is_suspended(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_moderation where user_id = p_user_id and suspended_at is not null
  );
$$;

-- Fixed-window limiter. Returns true when the hit is allowed.
create or replace function pricele.rate_limit(p_bucket text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_bucket is null or char_length(p_bucket) > 200 or p_window_seconds < 1 or p_max < 1 then
    raise exception 'PRICELE_INVALID: bad rate limit arguments';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  -- Opportunistic cleanup of old windows (cheap, indexed).
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;

-- Guest sessions -------------------------------------------------------------
create or replace function pricele.create_guest_session(p_token_hash bytea, p_ttl_days integer default 30)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    raise exception 'PRICELE_INVALID: token hash must be 32 bytes';
  end if;
  if p_ttl_days not between 1 and 90 then
    raise exception 'PRICELE_INVALID: ttl out of range';
  end if;
  insert into public.guest_sessions (token_hash, expires_at)
  values (p_token_hash, now() + make_interval(days => p_ttl_days))
  returning id into v_id;
  return v_id;
end;
$$;

-- Returns the guest session id when the token is valid (unexpired, unrevoked, unclaimed).
create or replace function pricele.resolve_guest(p_token_hash bytea)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.guest_sessions
   where p_token_hash is not null
     and token_hash = p_token_hash
     and expires_at > now()
     and revoked_at is null
     and claimed_at is null;
$$;

-- Resolves (user | guest) identity. Raises on invalid combinations.
create or replace function pricele.resolve_player(p_user_id uuid, p_guest_hash bytea, out o_user_id uuid, out o_guest_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is not null then
    if not exists (select 1 from public.profiles where id = p_user_id) then
      raise exception 'PRICELE_UNAUTHORIZED: unknown user';
    end if;
    o_user_id := p_user_id;
    return;
  end if;
  if p_guest_hash is not null then
    o_guest_id := pricele.resolve_guest(p_guest_hash);
    if o_guest_id is null then
      raise exception 'PRICELE_GUEST_EXPIRED: guest session is invalid or expired';
    end if;
    return;
  end if;
  raise exception 'PRICELE_UNAUTHORIZED: no player identity';
end;
$$;

-- Answer reveal payload for a question (only ever returned after an attempt exists,
-- or for an archive question whose game date has passed).
create or replace function pricele.reveal_payload(p_question_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'answer', qa.answer_amount::text,
    'answerDefinition', qa.answer_definition,
    'referenceDate', qa.reference_date,
    'referencePeriod', qa.reference_period,
    'explanation', qa.explanation,
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', s.title, 'publisher', s.publisher, 'url', s.source_url, 'publishedAt', s.published_at
      ) order by s.created_at)
      from public.question_sources s where s.question_id = qa.question_id
    ), '[]'::jsonb),
    'corrections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'oldAnswer', c.old_answer::text, 'newAnswer', c.new_answer::text,
        'reason', c.reason, 'sourceUrl', c.source_url, 'correctedAt', c.created_at
      ) order by c.created_at)
      from public.question_corrections c where c.question_id = qa.question_id
    ), '[]'::jsonb)
  )
  from public.question_answers qa
  where qa.question_id = p_question_id;
$$;

create or replace function pricele.attempt_payload(
  p_guess numeric, p_answer numeric, p_score integer, p_error numeric, p_submitted timestamptz
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'guess', p_guess::text,
    'answerSnapshot', p_answer::text,
    'score', p_score,
    'percentageError', p_error::text,
    'submittedAt', p_submitted
  );
$$;

-- Recompute a user's daily result for a set from authoritative attempts.
-- Creates/updates the row when all three are complete; removes it otherwise.
create or replace function pricele.refresh_daily_result(p_user_id uuid, p_set_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_easy integer; v_medium integer; v_hard integer;
  v_perfect integer;
  v_completed timestamptz;
  v_date date;
begin
  select count(*),
         coalesce(sum(a.score) filter (where dsq.position = 1), 0),
         coalesce(sum(a.score) filter (where dsq.position = 2), 0),
         coalesce(sum(a.score) filter (where dsq.position = 3), 0),
         count(*) filter (where a.score = 1000),
         max(a.submitted_at)
    into v_count, v_easy, v_medium, v_hard, v_perfect, v_completed
    from public.official_attempts a
    join public.daily_set_questions dsq
      on dsq.daily_set_id = a.daily_set_id and dsq.question_id = a.question_id
   where a.user_id = p_user_id and a.daily_set_id = p_set_id;

  if v_count = 3 then
    select game_date into v_date from public.daily_sets where id = p_set_id;
    insert into public.daily_results
      (daily_set_id, game_date, user_id, total_score, easy_score, medium_score, hard_score,
       perfect_guess_count, completed_at)
    values (p_set_id, v_date, p_user_id, v_easy + v_medium + v_hard, v_easy, v_medium, v_hard,
            v_perfect, v_completed)
    on conflict (daily_set_id, user_id) do update set
      total_score = excluded.total_score,
      easy_score = excluded.easy_score,
      medium_score = excluded.medium_score,
      hard_score = excluded.hard_score,
      perfect_guess_count = excluded.perfect_guess_count,
      completed_at = excluded.completed_at,
      game_date = excluded.game_date;
  else
    delete from public.daily_results where user_id = p_user_id and daily_set_id = p_set_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Streaks: consecutive *game days* (dates that had a live daily set), counted on
-- America/New_York dates. Days with no published set neither extend nor break a streak.
-- An unfinished current day never resets a streak before it ends.
-- ---------------------------------------------------------------------------
create or replace function pricele.user_streaks(p_user_id uuid, out current_streak integer, out best_streak integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := pricele.current_game_date();
  v_latest_idx bigint;
  v_latest_date date;
begin
  current_streak := 0;
  best_streak := 0;

  with game_days as (
    select ds.id, ds.game_date, row_number() over (order by ds.game_date) as idx
      from public.daily_sets ds
     where ds.status in ('scheduled', 'published') and ds.game_date <= v_today
  ),
  done as (
    select gd.idx, gd.idx - row_number() over (order by gd.idx) as grp
      from game_days gd
      join public.daily_results dr on dr.daily_set_id = gd.id and dr.user_id = p_user_id
  ),
  islands as (
    select grp, count(*) as len, max(idx) as last_idx from done group by grp
  )
  select coalesce(max(len), 0) into best_streak from islands;

  select max(idx), max(game_date) into v_latest_idx, v_latest_date from (
    select row_number() over (order by ds.game_date) as idx, ds.game_date
      from public.daily_sets ds
     where ds.status in ('scheduled', 'published') and ds.game_date <= v_today
  ) t;

  if v_latest_idx is null then
    return;
  end if;

  with game_days as (
    select ds.id, ds.game_date, row_number() over (order by ds.game_date) as idx
      from public.daily_sets ds
     where ds.status in ('scheduled', 'published') and ds.game_date <= v_today
  ),
  done as (
    select gd.idx, gd.idx - row_number() over (order by gd.idx) as grp
      from game_days gd
      join public.daily_results dr on dr.daily_set_id = gd.id and dr.user_id = p_user_id
  ),
  islands as (
    select grp, count(*) as len, max(idx) as last_idx from done group by grp
  )
  select coalesce(max(len) filter (
           where last_idx = v_latest_idx
              or (last_idx = v_latest_idx - 1 and v_latest_date = v_today)
         ), 0)
    into current_streak
    from islands;
end;
$$;

-- ---------------------------------------------------------------------------
-- Game state for a date. For today: official play state. Answers are included
-- only for questions the player has already submitted.
-- ---------------------------------------------------------------------------
create or replace function pricele.game_state(p_user_id uuid, p_guest_hash bytea, p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := pricele.current_game_date();
  v_date date := coalesce(p_date, v_today);
  v_set record;
  v_guest_id uuid;
  v_questions jsonb;
begin
  if p_user_id is null and p_guest_hash is not null then
    v_guest_id := pricele.resolve_guest(p_guest_hash);
  end if;

  select id, game_date into v_set
    from public.daily_sets
   where game_date = v_date and status in ('scheduled', 'published') and game_date <= v_today;

  if v_set.id is null then
    return jsonb_build_object('available', false, 'gameDate', v_date, 'today', v_today);
  end if;

  select jsonb_agg(q order by (q->>'position')::int) into v_questions
  from (
    select jsonb_build_object(
      'id', qn.id,
      'position', dsq.position,
      'difficulty', qn.difficulty,
      'prompt', qn.prompt,
      'context', qn.context,
      'imageUrl', qn.image_url,
      'imageAlt', qn.image_alt,
      'imageCredit', qn.image_credit,
      'category', c.name,
      'isSample', qn.is_sample,
      'attempt', case when a.id is null then null else
        pricele.attempt_payload(a.guess_amount, a.answer_snapshot, a.score, a.absolute_percentage_error, a.submitted_at)
        || jsonb_build_object('reveal', pricele.reveal_payload(qn.id))
      end
    ) as q
    from public.daily_set_questions dsq
    join public.questions qn on qn.id = dsq.question_id
    join public.categories c on c.id = qn.category_id
    left join public.official_attempts a
      on a.question_id = qn.id
     and ((p_user_id is not null and a.user_id = p_user_id)
       or (v_guest_id is not null and a.guest_session_id = v_guest_id))
    where dsq.daily_set_id = v_set.id
  ) s;

  return jsonb_build_object(
    'available', true,
    'setId', v_set.id,
    'gameDate', v_set.game_date,
    'today', v_today,
    'isToday', v_set.game_date = v_today,
    'questions', coalesce(v_questions, '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Official guess submission — atomic and idempotent.
-- Returns {ok:true, duplicate:bool, attempt:{...reveal}, progress:{...}} or {ok:false, error:code}.
-- ---------------------------------------------------------------------------
create or replace function pricele.submit_official_guess(
  p_user_id uuid, p_guest_hash bytea, p_question_id uuid, p_guess numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := pricele.current_game_date();
  v_user uuid;
  v_guest uuid;
  v_set_id uuid;
  v_set_date date;
  v_answer numeric(20, 2);
  v_verified text;
  v_score integer;
  v_error numeric;
  v_attempt public.official_attempts%rowtype;
  v_duplicate boolean := false;
  v_answered integer;
  v_total integer;
begin
  if p_guess is null or p_guess <= 0 or p_guess > pricele.max_amount() or p_guess <> round(p_guess, 2) then
    return jsonb_build_object('ok', false, 'error', 'invalid_guess');
  end if;

  begin
    select o_user_id, o_guest_id into v_user, v_guest from pricele.resolve_player(p_user_id, p_guest_hash);
  exception when others then
    if sqlerrm like 'PRICELE_GUEST_EXPIRED%' then
      return jsonb_build_object('ok', false, 'error', 'guest_expired');
    end if;
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end;

  if v_user is not null and pricele.is_suspended(v_user) then
    return jsonb_build_object('ok', false, 'error', 'suspended');
  end if;

  if not exists (select 1 from public.questions where id = p_question_id) then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;

  select ds.id, ds.game_date into v_set_id, v_set_date
    from public.daily_set_questions dsq
    join public.daily_sets ds on ds.id = dsq.daily_set_id
   where dsq.question_id = p_question_id
     and ds.status in ('scheduled', 'published');

  if v_set_id is null then
    return jsonb_build_object('ok', false, 'error', 'set_not_published');
  end if;
  if v_set_date <> v_today then
    return jsonb_build_object('ok', false, 'error', 'not_current_set');
  end if;

  -- Serialize submissions per player+set so completion is computed exactly once.
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(v_user::text, 'g:' || v_guest::text) || ':' || v_set_id::text, 0)
  );

  select * into v_attempt from public.official_attempts
   where question_id = p_question_id
     and ((v_user is not null and user_id = v_user) or (v_guest is not null and guest_session_id = v_guest));

  if v_attempt.id is not null then
    v_duplicate := true;
  else
    select answer_amount, verification_status into v_answer, v_verified
      from public.question_answers where question_id = p_question_id;
    if v_answer is null or v_verified <> 'verified' then
      return jsonb_build_object('ok', false, 'error', 'set_not_published');
    end if;

    v_score := pricele.score(p_guess, v_answer);
    v_error := pricele.percentage_error(p_guess, v_answer);

    insert into public.official_attempts
      (daily_set_id, question_id, user_id, guest_session_id, guess_amount, answer_snapshot,
       score, absolute_percentage_error, scoring_version, submitted_at)
    values
      (v_set_id, p_question_id, v_user, v_guest, p_guess, v_answer,
       v_score, v_error, pricele.scoring_version(), now())
    on conflict do nothing
    returning * into v_attempt;

    if v_attempt.id is null then
      -- Lost a race with an identical request: return the stored attempt.
      v_duplicate := true;
      select * into v_attempt from public.official_attempts
       where question_id = p_question_id
         and ((v_user is not null and user_id = v_user) or (v_guest is not null and guest_session_id = v_guest));
    end if;

    if v_user is not null then
      perform pricele.refresh_daily_result(v_user, v_set_id);
    end if;
  end if;

  if v_guest is not null then
    update public.guest_sessions set last_seen_at = now() where id = v_guest;
  end if;

  select count(*), coalesce(sum(score), 0) into v_answered, v_total
    from public.official_attempts
   where daily_set_id = v_set_id
     and ((v_user is not null and user_id = v_user) or (v_guest is not null and guest_session_id = v_guest));

  return jsonb_build_object(
    'ok', true,
    'duplicate', v_duplicate,
    'attempt', pricele.attempt_payload(v_attempt.guess_amount, v_attempt.answer_snapshot, v_attempt.score,
                                       v_attempt.absolute_percentage_error, v_attempt.submitted_at)
               || jsonb_build_object('questionId', p_question_id, 'reveal', pricele.reveal_payload(p_question_id)),
    'progress', jsonb_build_object('answered', v_answered, 'total', v_total, 'completed', v_answered = 3,
                                   'setId', v_set_id, 'gameDate', v_set_date)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Practice (archive) guesses. Stored separately; never touch official aggregates.
-- ---------------------------------------------------------------------------
create or replace function pricele.submit_practice_guess(
  p_user_id uuid, p_guest_hash bytea, p_question_id uuid, p_guess numeric
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := pricele.current_game_date();
  v_user uuid;
  v_guest uuid;
  v_set_id uuid;
  v_set_date date;
  v_answer numeric(20, 2);
  v_row public.practice_attempts%rowtype;
  v_duplicate boolean := false;
begin
  if p_guess is null or p_guess <= 0 or p_guess > pricele.max_amount() or p_guess <> round(p_guess, 2) then
    return jsonb_build_object('ok', false, 'error', 'invalid_guess');
  end if;

  begin
    select o_user_id, o_guest_id into v_user, v_guest from pricele.resolve_player(p_user_id, p_guest_hash);
  exception when others then
    if sqlerrm like 'PRICELE_GUEST_EXPIRED%' then
      return jsonb_build_object('ok', false, 'error', 'guest_expired');
    end if;
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end;

  select ds.id, ds.game_date into v_set_id, v_set_date
    from public.daily_set_questions dsq
    join public.daily_sets ds on ds.id = dsq.daily_set_id
   where dsq.question_id = p_question_id and ds.status in ('scheduled', 'published');

  if v_set_id is null then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;
  if v_set_date >= v_today then
    return jsonb_build_object('ok', false, 'error', 'not_archived');
  end if;

  -- An official result always wins; practice never replaces it.
  if exists (
    select 1 from public.official_attempts
     where question_id = p_question_id
       and ((v_user is not null and user_id = v_user) or (v_guest is not null and guest_session_id = v_guest))
  ) then
    return jsonb_build_object('ok', false, 'error', 'official_exists');
  end if;

  select * into v_row from public.practice_attempts
   where question_id = p_question_id
     and ((v_user is not null and user_id = v_user) or (v_guest is not null and guest_session_id = v_guest));

  if v_row.id is not null then
    v_duplicate := true;
  else
    select answer_amount into v_answer from public.question_answers where question_id = p_question_id;
    insert into public.practice_attempts
      (daily_set_id, question_id, user_id, guest_session_id, guess_amount, answer_snapshot, score,
       absolute_percentage_error, scoring_version)
    values
      (v_set_id, p_question_id, v_user, v_guest, p_guess, v_answer, pricele.score(p_guess, v_answer),
       pricele.percentage_error(p_guess, v_answer), pricele.scoring_version())
    on conflict do nothing
    returning * into v_row;
    if v_row.id is null then
      v_duplicate := true;
      select * into v_row from public.practice_attempts
       where question_id = p_question_id
         and ((v_user is not null and user_id = v_user) or (v_guest is not null and guest_session_id = v_guest));
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', v_duplicate,
    'attempt', pricele.attempt_payload(v_row.guess_amount, v_row.answer_snapshot, v_row.score,
                                       v_row.absolute_percentage_error, v_row.submitted_at)
               || jsonb_build_object('questionId', p_question_id, 'practice', true,
                                     'reveal', pricele.reveal_payload(p_question_id))
  );
end;
$$;

-- Reveal an archive answer without guessing (past dates only).
create or replace function pricele.reveal_archive_answer(p_question_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.daily_set_questions dsq
      join public.daily_sets ds on ds.id = dsq.daily_set_id
     where dsq.question_id = p_question_id
       and ds.status in ('scheduled', 'published')
       and ds.game_date < pricele.current_game_date()
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_archived');
  end if;
  return jsonb_build_object('ok', true, 'reveal', pricele.reveal_payload(p_question_id));
end;
$$;

-- Archive set detail: official + practice attempts for the viewer. Past dates only.
create or replace function pricele.archive_state(p_user_id uuid, p_guest_hash bytea, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := pricele.current_game_date();
  v_set record;
  v_guest uuid;
  v_questions jsonb;
begin
  if p_user_id is null and p_guest_hash is not null then
    v_guest := pricele.resolve_guest(p_guest_hash);
  end if;

  select id, game_date into v_set from public.daily_sets
   where game_date = p_date and status in ('scheduled', 'published') and game_date < v_today;
  if v_set.id is null then
    return jsonb_build_object('available', false, 'gameDate', p_date, 'today', v_today);
  end if;

  select jsonb_agg(q order by (q->>'position')::int) into v_questions
  from (
    select jsonb_build_object(
      'id', qn.id,
      'position', dsq.position,
      'difficulty', qn.difficulty,
      'prompt', qn.prompt,
      'context', qn.context,
      'imageUrl', qn.image_url,
      'imageAlt', qn.image_alt,
      'imageCredit', qn.image_credit,
      'category', c.name,
      'isSample', qn.is_sample,
      'official', case when oa.id is null then null else
        pricele.attempt_payload(oa.guess_amount, oa.answer_snapshot, oa.score, oa.absolute_percentage_error, oa.submitted_at) end,
      'practice', case when pa.id is null then null else
        pricele.attempt_payload(pa.guess_amount, pa.answer_snapshot, pa.score, pa.absolute_percentage_error, pa.submitted_at) end,
      'reveal', case when oa.id is not null or pa.id is not null then pricele.reveal_payload(qn.id) end
    ) as q
    from public.daily_set_questions dsq
    join public.questions qn on qn.id = dsq.question_id
    join public.categories c on c.id = qn.category_id
    left join public.official_attempts oa on oa.question_id = qn.id
      and ((p_user_id is not null and oa.user_id = p_user_id) or (v_guest is not null and oa.guest_session_id = v_guest))
    left join public.practice_attempts pa on pa.question_id = qn.id
      and ((p_user_id is not null and pa.user_id = p_user_id) or (v_guest is not null and pa.guest_session_id = v_guest))
    where dsq.daily_set_id = v_set.id
  ) s;

  return jsonb_build_object(
    'available', true,
    'setId', v_set.id,
    'gameDate', v_set.game_date,
    'today', v_today,
    'questions', coalesce(v_questions, '[]'::jsonb)
  );
end;
$$;

-- Archive listing with keyset pagination (strictly before p_before, newest first).
create or replace function pricele.archive_list(p_user_id uuid, p_guest_hash bytea, p_before date, p_limit integer)
returns table (
  game_date date,
  set_id uuid,
  difficulties text[],
  official_answered integer,
  official_total integer,
  practice_answered integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := pricele.current_game_date();
  v_guest uuid;
begin
  if p_user_id is null and p_guest_hash is not null then
    v_guest := pricele.resolve_guest(p_guest_hash);
  end if;
  return query
  select ds.game_date,
         ds.id,
         array(select q.difficulty from public.daily_set_questions d2
                 join public.questions q on q.id = d2.question_id
                where d2.daily_set_id = ds.id order by d2.position),
         (select count(*)::int from public.official_attempts a where a.daily_set_id = ds.id
            and ((p_user_id is not null and a.user_id = p_user_id) or (v_guest is not null and a.guest_session_id = v_guest))),
         (select coalesce(sum(a.score), 0)::int from public.official_attempts a where a.daily_set_id = ds.id
            and ((p_user_id is not null and a.user_id = p_user_id) or (v_guest is not null and a.guest_session_id = v_guest))),
         (select count(*)::int from public.practice_attempts a where a.daily_set_id = ds.id
            and ((p_user_id is not null and a.user_id = p_user_id) or (v_guest is not null and a.guest_session_id = v_guest)))
    from public.daily_sets ds
   where ds.status in ('scheduled', 'published')
     and ds.game_date < v_today
     and (p_before is null or ds.game_date < p_before)
   order by ds.game_date desc
   limit least(greatest(coalesce(p_limit, 20), 1), 60);
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards. Ranking: total desc, perfect desc, hard desc, final submission asc.
-- rank() gives equal positions only when all four tie-break values are identical;
-- display order then falls back to username (deterministic, not a competitive advantage).
-- Suspended users are excluded. Private profiles appear without their username.
-- ---------------------------------------------------------------------------
create or replace function pricele.leaderboard_daily(p_date date, p_limit integer default 50, p_offset integer default 0)
returns table (
  rank bigint, user_id uuid, username text, display_name text, avatar_url text, is_public boolean,
  total_score integer, easy_score integer, medium_score integer, hard_score integer,
  perfect_guesses integer, completed_at timestamptz, participants bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select rank() over (order by dr.total_score desc, dr.perfect_guess_count desc, dr.hard_score desc, dr.completed_at asc),
           dr.user_id,
           case when p.is_public then p.username end,
           case when p.is_public then p.display_name end,
           case when p.is_public then p.avatar_url end,
           p.is_public,
           dr.total_score, dr.easy_score, dr.medium_score, dr.hard_score,
           dr.perfect_guess_count, dr.completed_at,
           count(*) over ()
      from public.daily_results dr
      join public.profiles p on p.id = dr.user_id
      join public.daily_sets ds on ds.id = dr.daily_set_id and ds.status in ('scheduled', 'published')
     where dr.game_date = p_date
       and not exists (select 1 from public.user_moderation m where m.user_id = dr.user_id and m.suspended_at is not null)
  ) r
  order by 1, 3 nulls last, 2
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Period leaderboard over [p_from, p_to] game dates (inclusive). Null bounds = all-time.
create or replace function pricele.leaderboard_period(p_from date, p_to date, p_limit integer default 50, p_offset integer default 0)
returns table (
  rank bigint, user_id uuid, username text, display_name text, avatar_url text, is_public boolean,
  total_score bigint, games_completed bigint, perfect_guesses bigint, hard_score bigint,
  final_submission_at timestamptz, participants bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select dr.user_id,
           sum(dr.total_score) as total_score,
           count(*) as games,
           sum(dr.perfect_guess_count) as perfect,
           sum(dr.hard_score) as hard,
           max(dr.completed_at) as final_at
      from public.daily_results dr
      join public.daily_sets ds on ds.id = dr.daily_set_id and ds.status in ('scheduled', 'published')
     where (p_from is null or dr.game_date >= p_from)
       and (p_to is null or dr.game_date <= p_to)
       and not exists (select 1 from public.user_moderation m where m.user_id = dr.user_id and m.suspended_at is not null)
     group by dr.user_id
  )
  select * from (
    select rank() over (order by a.total_score desc, a.perfect desc, a.hard desc, a.final_at asc),
           a.user_id,
           case when p.is_public then p.username end,
           case when p.is_public then p.display_name end,
           case when p.is_public then p.avatar_url end,
           p.is_public,
           a.total_score, a.games, a.perfect, a.hard, a.final_at,
           count(*) over ()
      from agg a
      join public.profiles p on p.id = a.user_id
  ) r
  order by 1, 3 nulls last, 2
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function pricele.user_daily_rank(p_user_id uuid, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('rank', r.rank, 'participants', r.participants)
    from (
      select dr.user_id,
             rank() over (order by dr.total_score desc, dr.perfect_guess_count desc, dr.hard_score desc, dr.completed_at asc) as rank,
             count(*) over () as participants
        from public.daily_results dr
       where dr.game_date = p_date
         and not exists (select 1 from public.user_moderation m where m.user_id = dr.user_id and m.suspended_at is not null)
    ) r
   where r.user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- Profiles and statistics
-- ---------------------------------------------------------------------------
create or replace function pricele.profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with res as (
    select * from public.daily_results dr
     where dr.user_id = p_user_id
       and exists (select 1 from public.daily_sets ds where ds.id = dr.daily_set_id and ds.status in ('scheduled', 'published'))
  ),
  att as (
    select a.score, a.absolute_percentage_error, q.difficulty
      from public.official_attempts a
      join public.questions q on q.id = a.question_id
     where a.user_id = p_user_id
  ),
  s as (select * from pricele.user_streaks(p_user_id))
  select jsonb_build_object(
    'totalPoints', (select coalesce(sum(total_score), 0) from res),
    'gamesCompleted', (select count(*) from res),
    'averageDailyScore', (select round(avg(total_score), 1) from res),
    'highestDailyScore', (select max(total_score) from res),
    'questionsAnswered', (select count(*) from att),
    'averageQuestionScore', (select round(avg(score), 1) from att),
    'perfectGuesses', (select count(*) from att where score = 1000),
    'medianPercentageError', (select round(percentile_cont(0.5) within group (order by absolute_percentage_error)::numeric, 2) from att),
    'averagePercentageError', (select round(avg(absolute_percentage_error), 2) from att),
    'byDifficulty', (select coalesce(jsonb_object_agg(difficulty, jsonb_build_object('answered', n, 'averageScore', avg_score)), '{}'::jsonb)
                       from (select difficulty, count(*) as n, round(avg(score), 1) as avg_score from att group by difficulty) d),
    'currentStreak', (select current_streak from s),
    'bestStreak', (select best_streak from s),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
                  'gameDate', game_date, 'total', total_score, 'easy', easy_score, 'medium', medium_score, 'hard', hard_score
                ) order by game_date desc), '[]'::jsonb)
                 from (select * from res order by game_date desc limit 14) r)
  );
$$;

create or replace function pricele.get_profile(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatarUrl', p.avatar_url,
    'isPublic', p.is_public, 'createdAt', p.created_at,
    'isAdmin', pricele.is_admin(p.id), 'isSuspended', pricele.is_suspended(p.id)
  )
  from public.profiles p where p.id = p_user_id;
$$;

create or replace function pricele.public_profile(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'username', p.username, 'displayName', p.display_name, 'avatarUrl', p.avatar_url,
    'createdAt', p.created_at, 'stats', pricele.profile_stats(p.id)
  )
  from public.profiles p
  where p.username = lower(p_username)
    and p.is_public
    and not pricele.is_suspended(p.id);
$$;

create or replace function pricele.update_profile(p_user_id uuid, p_display_name text, p_avatar_url text, p_is_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set display_name = nullif(btrim(p_display_name), ''),
         avatar_url = nullif(btrim(p_avatar_url), ''),
         is_public = coalesce(p_is_public, is_public)
   where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  return jsonb_build_object('ok', true);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid_input');
end;
$$;

create or replace function pricele.update_username(p_user_id uuid, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := lower(btrim(p_username));
begin
  if v_name !~ '^[a-z][a-z0-9_]{2,19}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_username');
  end if;
  if exists (select 1 from public.profiles where username = v_name and id <> p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'username_taken');
  end if;
  update public.profiles set username = v_name where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  return jsonb_build_object('ok', true, 'username', v_name);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'username_taken');
end;
$$;

create or replace function pricele.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(p_username)) ~ '^[a-z][a-z0-9_]{2,19}$'
     and not exists (select 1 from public.profiles where username = lower(btrim(p_username)));
$$;

-- Deletes the auth user; cascades remove profile, attempts, results and roles.
create or replace function pricele.delete_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('ok', found);
end;
$$;

-- Profile row for every new auth user. Uses the requested username when valid and free,
-- otherwise a generated "player_xxxxxxxx" the user can change later.
create or replace function pricele.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_name text;
  v_try integer := 0;
begin
  if v_requested ~ '^[a-z][a-z0-9_]{2,19}$'
     and not exists (select 1 from public.profiles where username = v_requested) then
    v_name := v_requested;
  else
    loop
      v_name := 'player_' || substr(md5(new.id::text || v_try::text), 1, 8);
      exit when not exists (select 1 from public.profiles where username = v_name);
      v_try := v_try + 1;
    end loop;
  end if;
  insert into public.profiles (id, username) values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
exception when unique_violation then
  -- Extremely unlikely race on the requested name: fall back to a generated name.
  insert into public.profiles (id, username)
  values (new.id, 'player_' || substr(md5(new.id::text || clock_timestamp()::text), 1, 8))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function pricele.handle_new_user();

-- ---------------------------------------------------------------------------
-- Claim guest progress into an authenticated account.
-- Transfers official attempts for each daily set where the user has no attempts of
-- their own, preserving timestamps and answer snapshots. Practice attempts are not
-- transferred. The guest session is consumed (claimed + revoked) atomically.
-- ---------------------------------------------------------------------------
create or replace function pricele.claim_guest_session(p_user_id uuid, p_guest_hash bytea)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.guest_sessions%rowtype;
  v_set record;
  v_sets_transferred integer := 0;
  v_attempts_transferred integer := 0;
  v_sets_skipped integer := 0;
  v_n integer;
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_guest_hash is null then
    return jsonb_build_object('ok', false, 'error', 'no_guest_session');
  end if;

  select * into v_session from public.guest_sessions where token_hash = p_guest_hash for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'error', 'no_guest_session');
  end if;
  if v_session.claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if v_session.revoked_at is not null or v_session.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'guest_expired');
  end if;

  for v_set in
    select distinct a.daily_set_id from public.official_attempts a
     join public.daily_sets ds on ds.id = a.daily_set_id and ds.status in ('scheduled', 'published')
     where a.guest_session_id = v_session.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_set.daily_set_id::text, 0));
    if exists (select 1 from public.official_attempts
                where user_id = p_user_id and daily_set_id = v_set.daily_set_id) then
      v_sets_skipped := v_sets_skipped + 1;
      continue;
    end if;
    update public.official_attempts
       set user_id = p_user_id,
           guest_session_id = null,
           claimed_from_guest_session_id = v_session.id
     where guest_session_id = v_session.id and daily_set_id = v_set.daily_set_id;
    get diagnostics v_n = row_count;
    v_attempts_transferred := v_attempts_transferred + v_n;
    v_sets_transferred := v_sets_transferred + 1;
    perform pricele.refresh_daily_result(p_user_id, v_set.daily_set_id);
  end loop;

  update public.guest_sessions
     set claimed_by = p_user_id, claimed_at = now(), revoked_at = now()
   where id = v_session.id;

  return jsonb_build_object('ok', true,
    'setsTransferred', v_sets_transferred,
    'attemptsTransferred', v_attempts_transferred,
    'setsSkipped', v_sets_skipped);
end;
$$;

-- Lightweight summary of a guest session's claimable progress (for the claim prompt).
create or replace function pricele.guest_summary(p_guest_hash bytea)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'valid', gs.id is not null,
    'attempts', (select count(*) from public.official_attempts a where a.guest_session_id = gs.id),
    'sets', (select count(distinct a.daily_set_id) from public.official_attempts a where a.guest_session_id = gs.id)
  )
  from (select pricele.resolve_guest(p_guest_hash) as id) gs;
$$;

-- Player-submitted report about a possibly inaccurate question.
create or replace function pricele.report_question(p_user_id uuid, p_guest_hash bytea, p_question_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest uuid;
begin
  if p_user_id is null then
    v_guest := pricele.resolve_guest(p_guest_hash);
    if v_guest is null then
      return jsonb_build_object('ok', false, 'error', 'unauthorized');
    end if;
  end if;
  if not pricele.is_question_live(p_question_id) then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;
  insert into public.question_reports (question_id, user_id, guest_session_id, message)
  values (p_question_id, p_user_id, v_guest, btrim(p_message));
  return jsonb_build_object('ok', true);
exception when check_violation then
  return jsonb_build_object('ok', false, 'error', 'invalid_input');
end;
$$;

-- Public share data for a completed day (respects profile visibility).
create or replace function pricele.public_result(p_username text, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'username', p.username, 'displayName', p.display_name, 'gameDate', dr.game_date,
    'total', dr.total_score, 'easy', dr.easy_score, 'medium', dr.medium_score, 'hard', dr.hard_score
  )
  from public.profiles p
  join public.daily_results dr on dr.user_id = p.id and dr.game_date = p_date
  where p.username = lower(p_username) and p.is_public and not pricele.is_suspended(p.id);
$$;
