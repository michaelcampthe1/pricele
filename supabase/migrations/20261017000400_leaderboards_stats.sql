-- Leaderboards, streaks and statistics, all derived from authoritative records.
--
-- Eligibility: only completed official daily games of authenticated, non-suspended players,
-- on live (scheduled/published, date arrived) sets. Practice attempts never appear here.
--
-- Ranking: RANK() over, in order,
--   1. total points (desc)
--   2. perfect guesses, i.e. questions scored exactly 1,000 (desc)
--   3. Hard-question points (desc)
--   4. timestamp of the final required official submission (asc). For weekly / all-time this
--      is the completion time of the latest counted game: the moment the total was reached.
-- Players identical on all four share a rank; display order inside a tie is by username,
-- which carries no competitive meaning.

create or replace function private.eligible_results()
returns table (
  user_id uuid, daily_set_id uuid, game_date date, total_score integer, hard_score integer,
  easy_score integer, medium_score integer, perfect_guess_count integer, completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.user_id, r.daily_set_id, r.game_date, r.total_score, r.hard_score, r.easy_score,
         r.medium_score, r.perfect_guess_count, r.completed_at
  from public.daily_results r
  join public.daily_sets s on s.id = r.daily_set_id
  join public.profiles p on p.id = r.user_id
  where s.status in ('scheduled', 'published')
    and s.game_date <= private.current_game_date()
    and p.suspended_at is null
$$;

-- Daily ------------------------------------------------------------------------------
create or replace function public.leaderboard_daily(
  p_game_date date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_username text default null
)
returns table (
  rank bigint, username text, display_name text, avatar_url text, is_public boolean,
  total_score integer, easy_score integer, medium_score integer, hard_score integer,
  perfect_guesses integer, completed_at timestamptz, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select e.*, p.username, p.display_name, p.avatar_url, p.is_public,
      rank() over (order by e.total_score desc, e.perfect_guess_count desc,
                            e.hard_score desc, e.completed_at asc) as rnk,
      count(*) over () as cnt
    from private.eligible_results() e
    join public.profiles p on p.id = e.user_id
    where e.game_date = p_game_date
  )
  select rnk, username, display_name, case when is_public then avatar_url end, is_public,
         total_score, easy_score, medium_score, hard_score, perfect_guess_count, completed_at, cnt
  from ranked
  where p_username is null or username = lower(p_username)
  order by rnk, username
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

-- Weekly (Monday 00:00 through next Monday 00:00, America/New_York) -------------------
-- Game dates are already Eastern Time calendar dates, so the week is game_date in
-- [monday, monday + 7).
create or replace function public.leaderboard_weekly(
  p_week_start date,
  p_limit integer default 50,
  p_offset integer default 0,
  p_username text default null
)
returns table (
  rank bigint, username text, display_name text, avatar_url text, is_public boolean,
  total_score bigint, games_completed bigint, perfect_guesses bigint, hard_score bigint,
  final_submission_at timestamptz, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select e.user_id, sum(e.total_score) as total, count(*) as games,
           sum(e.perfect_guess_count) as perfect, sum(e.hard_score) as hard,
           max(e.completed_at) as final_at
    from private.eligible_results() e
    where extract(isodow from p_week_start) = 1
      and e.game_date >= p_week_start and e.game_date < p_week_start + 7
    group by e.user_id
  ), ranked as (
    select a.*, p.username, p.display_name, p.avatar_url, p.is_public,
      rank() over (order by a.total desc, a.perfect desc, a.hard desc, a.final_at asc) as rnk,
      count(*) over () as cnt
    from agg a join public.profiles p on p.id = a.user_id
  )
  select rnk, username, display_name, case when is_public then avatar_url end, is_public,
         total, games, perfect, hard, final_at, cnt
  from ranked
  where p_username is null or username = lower(p_username)
  order by rnk, username
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

-- Streaks ----------------------------------------------------------------------------
-- A streak is a run of consecutive Eastern Time game dates with a completed official game.
-- The current streak is the run ending today or yesterday: an unfinished today does not
-- break a streak before the day is over.
create or replace function private.streaks()
returns table (user_id uuid, current_streak integer, best_streak integer, last_completed date)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select distinct e.user_id, e.game_date from private.eligible_results() e
  ), islands as (
    select d.user_id, d.game_date,
           d.game_date - (row_number() over (partition by d.user_id order by d.game_date))::integer as grp
    from days d
  ), runs as (
    select i.user_id, count(*)::integer as len, max(i.game_date) as last_day
    from islands i group by i.user_id, i.grp
  )
  select r.user_id,
         coalesce(max(r.len) filter (where r.last_day >= private.current_game_date() - 1), 0),
         max(r.len),
         max(r.last_day)
  from runs r group by r.user_id
$$;

-- All-time -----------------------------------------------------------------------------
create or replace function public.leaderboard_alltime(
  p_limit integer default 50,
  p_offset integer default 0,
  p_username text default null
)
returns table (
  rank bigint, username text, display_name text, avatar_url text, is_public boolean,
  total_score bigint, games_completed bigint, perfect_guesses bigint, hard_score bigint,
  final_submission_at timestamptz, current_streak integer, best_streak integer, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select e.user_id, sum(e.total_score) as total, count(*) as games,
           sum(e.perfect_guess_count) as perfect, sum(e.hard_score) as hard,
           max(e.completed_at) as final_at
    from private.eligible_results() e
    group by e.user_id
  ), ranked as (
    select a.*, p.username, p.display_name, p.avatar_url, p.is_public,
      st.current_streak, st.best_streak,
      rank() over (order by a.total desc, a.perfect desc, a.hard desc, a.final_at asc) as rnk,
      count(*) over () as cnt
    from agg a
    join public.profiles p on p.id = a.user_id
    left join private.streaks() st on st.user_id = a.user_id
  )
  select rnk, username, display_name, case when is_public then avatar_url end, is_public,
         total, games, perfect, hard, final_at,
         coalesce(current_streak, 0), coalesce(best_streak, 0), cnt
  from ranked
  where p_username is null or username = lower(p_username)
  order by rnk, username
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

-- Player statistics ----------------------------------------------------------------------
-- "Total official points" counts completed official daily games only (the same basis as the
-- all-time leaderboard). Question-level stats use every non-voided official attempt.
create or replace function public.get_player_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with res as (
    select * from private.eligible_results() e where e.user_id = p_user_id
  ), att as (
    select a.* from public.official_attempts a
    join public.daily_sets s on s.id = a.daily_set_id
    where a.user_id = p_user_id and not a.voided and s.status in ('scheduled', 'published')
  ), st as (
    select * from private.streaks() s where s.user_id = p_user_id
  )
  select jsonb_build_object(
    'total_points', coalesce((select sum(total_score) from res), 0),
    'games_completed', (select count(*) from res),
    'average_daily_score', (select round(avg(total_score), 1) from res),
    'highest_daily_score', (select max(total_score) from res),
    'questions_answered', (select count(*) from att),
    'average_question_score', (select round(avg(score), 1) from att),
    'perfect_guesses', (select count(*) from att where score = 1000),
    'mean_absolute_percentage_error', (select round(avg(absolute_percentage_error), 2) from att),
    'median_absolute_percentage_error',
      (select round((percentile_cont(0.5) within group (order by absolute_percentage_error))::numeric, 2) from att),
    'current_streak', coalesce((select current_streak from st), 0),
    'best_streak', coalesce((select best_streak from st), 0),
    'by_difficulty', (
      select coalesce(jsonb_object_agg(d.name, jsonb_build_object(
        'answered', d.answered, 'average_score', d.avg_score)), '{}'::jsonb)
      from (
        select (private.position_difficulty(a.position))::text as name, count(*) as answered,
               round(avg(a.score), 1) as avg_score
        from att a group by a.position
      ) d
    ),
    'recent_results', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'game_date', r.game_date, 'total_score', r.total_score, 'easy_score', r.easy_score,
        'medium_score', r.medium_score, 'hard_score', r.hard_score,
        'perfect_guesses', r.perfect_guess_count) order by r.game_date desc), '[]'::jsonb)
      from (select * from res order by game_date desc limit 14) r
    )
  )
$$;

-- Leaderboards expose only public-safe columns, so API roles may call them directly.
grant execute on function private.eligible_results() to service_role;
grant execute on function private.streaks() to service_role;
grant execute on function public.leaderboard_daily(date, integer, integer, text) to anon, authenticated, service_role;
grant execute on function public.leaderboard_weekly(date, integer, integer, text) to anon, authenticated, service_role;
grant execute on function public.leaderboard_alltime(integer, integer, text) to anon, authenticated, service_role;
grant execute on function public.get_player_stats(uuid) to service_role;
