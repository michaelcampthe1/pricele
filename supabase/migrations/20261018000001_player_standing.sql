-- Where a player finished today among everyone who completed the game, guests included.
-- Same tie-breaks as the leaderboard: total, perfect guesses, hard score, earliest finish.
create or replace function pricele.player_daily_standing(p_user_id uuid, p_guest_hash bytea, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p_user_id as user_id,
           case when p_user_id is null then pricele.resolve_guest(p_guest_hash) end as guest_id
  ),
  players as (
    select a.user_id,
           a.guest_session_id,
           sum(a.score)::int as total,
           count(*) filter (where a.score = 1000) as perfect,
           coalesce(max(a.score) filter (where q.difficulty = 'hard'), 0) as hard,
           max(a.submitted_at) as final_at
      from public.official_attempts a
      join public.daily_sets ds on ds.id = a.daily_set_id
      join public.questions q on q.id = a.question_id
     where ds.game_date = p_date
       and ds.status in ('scheduled', 'published')
       and (a.user_id is null
            or not exists (select 1 from public.user_moderation m where m.user_id = a.user_id and m.suspended_at is not null))
     group by a.user_id, a.guest_session_id
    having count(*) = 3
  ),
  ranked as (
    select p.*,
           rank() over (order by p.total desc, p.perfect desc, p.hard desc, p.final_at asc) as rank,
           count(*) over () as participants
      from players p
  )
  select jsonb_build_object(
           'rank', r.rank,
           'participants', r.participants,
           'beaten', (select count(*) from players o where o.total < r.total)
         )
    from ranked r, me
   where (me.user_id is not null and r.user_id = me.user_id)
      or (me.guest_id is not null and r.guest_session_id = me.guest_id);
$$;

revoke all on function pricele.player_daily_standing(uuid, bytea, date) from public, anon, authenticated;
grant execute on function pricele.player_daily_standing(uuid, bytea, date) to pricele_app;
