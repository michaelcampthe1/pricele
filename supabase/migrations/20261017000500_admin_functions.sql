-- Administrative workflow functions. service_role only; each one re-checks that the acting
-- user is an administrator (defence in depth on top of the Next.js server check) and writes
-- an audit log entry in the same transaction as the change.

create or replace function private.assert_admin(p_admin_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_admin_id is null or not private.is_admin(p_admin_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.audit(
  p_admin_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (admin_user_id, action, entity_type, entity_id, details)
  values (p_admin_id, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb))
$$;

-- Question is locked once it belongs to a scheduled/published/withdrawn set.
create or replace function private.question_locked(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.daily_set_questions dsq
    join public.daily_sets s on s.id = dsq.daily_set_id
    where dsq.question_id = p_question_id and s.status in ('scheduled', 'published', 'withdrawn')
  ) or exists (
    select 1 from public.questions q where q.id = p_question_id and q.status in ('published', 'withdrawn')
  )
$$;

-- ---------------------------------------------------------------------------
-- Create / update a question with its answer key in one transaction.
-- Payload keys: prompt, context, difficulty, category_id, slug, image_url, image_alt,
-- image_credit, ai_assisted, answer_amount, answer_definition, reference_date,
-- reference_period, explanation.
-- Any edit to an approved question returns it to draft; any change to answer-relevant
-- fields resets verification.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_question(p_admin_id uuid, p_question_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_question_id;
  v_before public.questions;
  v_answer_before public.question_answers;
  v_amount numeric;
  v_answer_changed boolean := false;
begin
  perform private.assert_admin(p_admin_id);

  v_amount := nullif(p_payload ->> 'answer_amount', '')::numeric;
  if v_amount is not null and (v_amount <= 0 or v_amount > 1000000000000000 or round(v_amount, 2) <> v_amount) then
    return jsonb_build_object('ok', false, 'error', 'invalid_answer');
  end if;

  if v_id is null then
    insert into public.questions (prompt, context, difficulty, category_id, slug, image_url,
      image_alt, image_credit, ai_assisted, created_by)
    values (
      p_payload ->> 'prompt',
      nullif(p_payload ->> 'context', ''),
      (p_payload ->> 'difficulty')::public.difficulty,
      nullif(p_payload ->> 'category_id', '')::uuid,
      nullif(p_payload ->> 'slug', ''),
      nullif(p_payload ->> 'image_url', ''),
      nullif(p_payload ->> 'image_alt', ''),
      nullif(p_payload ->> 'image_credit', ''),
      coalesce((p_payload ->> 'ai_assisted')::boolean, false),
      p_admin_id
    ) returning id into v_id;

    insert into public.question_answers (question_id, answer_amount, answer_definition,
      reference_date, reference_period, explanation)
    values (v_id, v_amount, nullif(p_payload ->> 'answer_definition', ''),
      nullif(p_payload ->> 'reference_date', '')::date, nullif(p_payload ->> 'reference_period', ''),
      nullif(p_payload ->> 'explanation', ''));

    perform private.audit(p_admin_id, 'question.create', 'question', v_id,
      jsonb_build_object('difficulty', p_payload ->> 'difficulty'));
    return jsonb_build_object('ok', true, 'question_id', v_id);
  end if;

  select * into v_before from public.questions where id = v_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;
  if private.question_locked(v_id) then
    return jsonb_build_object('ok', false, 'error', 'question_locked');
  end if;
  select * into v_answer_before from public.question_answers where question_id = v_id for update;

  v_answer_changed :=
    v_answer_before.answer_amount is distinct from v_amount
    or v_answer_before.answer_definition is distinct from nullif(p_payload ->> 'answer_definition', '')
    or v_answer_before.reference_date is distinct from nullif(p_payload ->> 'reference_date', '')::date
    or v_answer_before.reference_period is distinct from nullif(p_payload ->> 'reference_period', '')
    or v_before.prompt is distinct from (p_payload ->> 'prompt')
    or v_before.context is distinct from nullif(p_payload ->> 'context', '');

  update public.questions set
    prompt = p_payload ->> 'prompt',
    context = nullif(p_payload ->> 'context', ''),
    difficulty = (p_payload ->> 'difficulty')::public.difficulty,
    category_id = nullif(p_payload ->> 'category_id', '')::uuid,
    slug = nullif(p_payload ->> 'slug', ''),
    image_url = nullif(p_payload ->> 'image_url', ''),
    image_alt = nullif(p_payload ->> 'image_alt', ''),
    image_credit = nullif(p_payload ->> 'image_credit', ''),
    status = case when status = 'approved' then 'draft'::public.question_status else status end,
    approved_by = case when status = 'approved' then null else approved_by end,
    approved_at = case when status = 'approved' then null else approved_at end
  where id = v_id;

  insert into public.question_answers as qa (question_id, answer_amount, answer_definition,
    reference_date, reference_period, explanation)
  values (v_id, v_amount, nullif(p_payload ->> 'answer_definition', ''),
    nullif(p_payload ->> 'reference_date', '')::date, nullif(p_payload ->> 'reference_period', ''),
    nullif(p_payload ->> 'explanation', ''))
  on conflict (question_id) do update set
    answer_amount = excluded.answer_amount,
    answer_definition = excluded.answer_definition,
    reference_date = excluded.reference_date,
    reference_period = excluded.reference_period,
    explanation = excluded.explanation,
    verification_status = case when v_answer_changed then 'unverified'::public.verification_status else qa.verification_status end,
    verified_by = case when v_answer_changed then null else qa.verified_by end,
    verified_at = case when v_answer_changed then null else qa.verified_at end;

  perform private.audit(p_admin_id, 'question.update', 'question', v_id, jsonb_build_object(
    'answer_changed', v_answer_changed,
    'returned_to_draft', v_before.status = 'approved'));
  return jsonb_build_object('ok', true, 'question_id', v_id, 'verification_reset', v_answer_changed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Verification: the admin attests that at least one recorded source supports the exact
-- target amount, definition and reference period.
-- ---------------------------------------------------------------------------
create or replace function private.question_issues(p_question_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_issues text[] := '{}';
  v_q public.questions;
  v_a public.question_answers;
begin
  select * into v_q from public.questions where id = p_question_id;
  if not found then
    return array['question_not_found'];
  end if;
  select * into v_a from public.question_answers where question_id = p_question_id;
  if v_a.answer_amount is null or v_a.answer_amount <= 0 then
    v_issues := array_append(v_issues, ('answer_missing')::text);
  end if;
  if v_a.currency is distinct from 'USD' then
    v_issues := array_append(v_issues, ('currency_invalid')::text);
  end if;
  if coalesce(btrim(v_a.answer_definition), '') = '' then
    v_issues := array_append(v_issues, ('answer_definition_missing')::text);
  end if;
  if v_a.reference_date is null and coalesce(btrim(v_a.reference_period), '') = '' then
    v_issues := array_append(v_issues, ('reference_date_missing')::text);
  end if;
  if coalesce(btrim(v_a.explanation), '') = '' then
    v_issues := array_append(v_issues, ('explanation_missing')::text);
  end if;
  if v_q.category_id is null then
    v_issues := array_append(v_issues, ('category_missing')::text);
  end if;
  if not exists (select 1 from public.question_sources s where s.question_id = p_question_id) then
    v_issues := array_append(v_issues, ('source_missing')::text);
  end if;
  return v_issues;
end;
$$;

create or replace function public.admin_verify_question(p_admin_id uuid, p_question_id uuid, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issues text[];
begin
  perform private.assert_admin(p_admin_id);
  if private.question_locked(p_question_id) then
    return jsonb_build_object('ok', false, 'error', 'question_locked');
  end if;
  v_issues := private.question_issues(p_question_id);
  if cardinality(v_issues) > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_incomplete', 'issues', to_jsonb(v_issues));
  end if;
  update public.question_answers
  set verification_status = 'verified', verified_by = p_admin_id, verified_at = now(),
      verification_notes = nullif(btrim(coalesce(p_notes, '')), '')
  where question_id = p_question_id;
  update public.question_sources
  set verified_by = p_admin_id, verified_at = now()
  where question_id = p_question_id and verified_at is null;
  perform private.audit(p_admin_id, 'question.verify', 'question', p_question_id, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_question_status(p_admin_id uuid, p_question_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.question_status;
  v_verified boolean;
begin
  perform private.assert_admin(p_admin_id);
  select status into v_current from public.questions where id = p_question_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;
  if private.question_locked(p_question_id) then
    return jsonb_build_object('ok', false, 'error', 'question_locked');
  end if;
  if exists (select 1 from public.daily_set_questions where question_id = p_question_id) and p_status <> 'approved' then
    return jsonb_build_object('ok', false, 'error', 'question_assigned');
  end if;

  if p_status = 'approved' then
    select qa.verification_status = 'verified' into v_verified
    from public.question_answers qa where qa.question_id = p_question_id;
    if not coalesce(v_verified, false) then
      return jsonb_build_object('ok', false, 'error', 'question_unverified');
    end if;
    if cardinality(private.question_issues(p_question_id)) > 0 then
      return jsonb_build_object('ok', false, 'error', 'question_incomplete',
        'issues', to_jsonb(private.question_issues(p_question_id)));
    end if;
    update public.questions set status = 'approved', approved_by = p_admin_id, approved_at = now()
    where id = p_question_id;
  elsif p_status = 'draft' then
    update public.questions set status = 'draft', approved_by = null, approved_at = null
    where id = p_question_id;
  elsif p_status = 'archived' then
    update public.questions set status = 'archived' where id = p_question_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  perform private.audit(p_admin_id, 'question.status', 'question', p_question_id,
    jsonb_build_object('from', v_current, 'to', p_status));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily sets
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_set_question(
  p_admin_id uuid, p_daily_set_id uuid, p_position smallint, p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.daily_set_status;
  v_q public.questions;
begin
  perform private.assert_admin(p_admin_id);
  select status into v_status from public.daily_sets where id = p_daily_set_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'set_not_found');
  end if;
  if v_status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'set_locked');
  end if;
  if p_position not between 1 and 3 then
    return jsonb_build_object('ok', false, 'error', 'invalid_position');
  end if;

  delete from public.daily_set_questions where daily_set_id = p_daily_set_id and position = p_position;
  if p_question_id is null then
    perform private.audit(p_admin_id, 'daily_set.unassign', 'daily_set', p_daily_set_id,
      jsonb_build_object('position', p_position));
    return jsonb_build_object('ok', true);
  end if;

  select * into v_q from public.questions where id = p_question_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;
  if v_q.status <> 'approved' then
    return jsonb_build_object('ok', false, 'error', 'question_not_approved');
  end if;
  if v_q.difficulty <> private.position_difficulty(p_position) then
    return jsonb_build_object('ok', false, 'error', 'difficulty_mismatch');
  end if;
  if exists (select 1 from public.daily_set_questions where question_id = p_question_id) then
    return jsonb_build_object('ok', false, 'error', 'question_already_assigned');
  end if;

  insert into public.daily_set_questions (daily_set_id, question_id, position)
  values (p_daily_set_id, p_question_id, p_position);
  perform private.audit(p_admin_id, 'daily_set.assign', 'daily_set', p_daily_set_id,
    jsonb_build_object('position', p_position, 'question_id', p_question_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.validate_daily_set(p_daily_set_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set public.daily_sets;
  v_issues text[] := '{}';
  v_row record;
  v_count integer;
begin
  select * into v_set from public.daily_sets where id = p_daily_set_id;
  if not found then
    return array['set_not_found'];
  end if;
  if v_set.game_date < private.current_game_date() then
    v_issues := array_append(v_issues, ('date_in_past')::text);
  end if;
  if exists (select 1 from public.daily_sets s where s.game_date = v_set.game_date
             and s.id <> v_set.id and s.status in ('scheduled', 'published')) then
    v_issues := array_append(v_issues, ('date_conflict')::text);
  end if;

  select count(*) into v_count
  from public.daily_set_questions where daily_set_id = p_daily_set_id;
  if v_count <> 3 then
    v_issues := array_append(v_issues, ('requires_three_questions')::text);
  end if;
  if (select count(distinct question_id) from public.daily_set_questions where daily_set_id = p_daily_set_id) <> v_count then
    v_issues := array_append(v_issues, ('duplicate_question')::text);
  end if;

  for v_row in
    select dsq.position, q.id, q.status, q.difficulty, qa.verification_status, qa.answer_amount
    from public.daily_set_questions dsq
    join public.questions q on q.id = dsq.question_id
    left join public.question_answers qa on qa.question_id = q.id
    where dsq.daily_set_id = p_daily_set_id
    order by dsq.position
  loop
    if v_row.difficulty <> private.position_difficulty(v_row.position) then
      v_issues := array_append(v_issues, (('position_' || v_row.position || '_difficulty_mismatch'))::text);
    end if;
    if v_row.status <> 'approved' then
      v_issues := array_append(v_issues, (('position_' || v_row.position || '_not_approved'))::text);
    end if;
    if v_row.verification_status is distinct from 'verified' then
      v_issues := array_append(v_issues, (('position_' || v_row.position || '_unverified'))::text);
    end if;
    if v_row.answer_amount is null or v_row.answer_amount <= 0 then
      v_issues := array_append(v_issues, (('position_' || v_row.position || '_answer_invalid'))::text);
    end if;
    if not exists (select 1 from public.question_sources s where s.question_id = v_row.id) then
      v_issues := array_append(v_issues, (('position_' || v_row.position || '_source_missing'))::text);
    end if;
    if cardinality(private.question_issues(v_row.id)) > 0 then
      v_issues := array_append(v_issues, (('position_' || v_row.position || '_incomplete'))::text);
    end if;
  end loop;
  return v_issues;
end;
$$;

-- Publish requires an explicit confirmation of the game date (typed by the admin in the UI).
create or replace function public.admin_publish_daily_set(p_admin_id uuid, p_daily_set_id uuid, p_confirm_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.daily_sets;
  v_issues text[];
  v_new_status public.daily_set_status;
begin
  perform private.assert_admin(p_admin_id);
  select * into v_set from public.daily_sets where id = p_daily_set_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'set_not_found');
  end if;
  if v_set.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'set_not_draft');
  end if;
  if p_confirm_date is distinct from v_set.game_date then
    return jsonb_build_object('ok', false, 'error', 'confirmation_mismatch');
  end if;
  v_issues := public.validate_daily_set(p_daily_set_id);
  if cardinality(v_issues) > 0 then
    return jsonb_build_object('ok', false, 'error', 'set_invalid', 'issues', to_jsonb(v_issues));
  end if;

  v_new_status := case when v_set.game_date <= private.current_game_date() then 'published' else 'scheduled' end;
  update public.daily_sets
  set status = v_new_status, published_at = now(), published_by = p_admin_id,
      went_live_at = case when v_new_status = 'published' then now() else null end
  where id = p_daily_set_id;
  update public.questions q set status = 'published', published_at = now()
  from public.daily_set_questions dsq
  where dsq.daily_set_id = p_daily_set_id and dsq.question_id = q.id;

  perform private.audit(p_admin_id, 'daily_set.publish', 'daily_set', p_daily_set_id,
    jsonb_build_object('game_date', v_set.game_date, 'status', v_new_status,
      'questions', (select jsonb_agg(jsonb_build_object('position', position, 'question_id', question_id) order by position)
                    from public.daily_set_questions where daily_set_id = p_daily_set_id)));
  return jsonb_build_object('ok', true, 'status', v_new_status);
end;
$$;

-- A scheduled (future) set may be returned to draft before it goes live.
create or replace function public.admin_unschedule_daily_set(p_admin_id uuid, p_daily_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.daily_sets;
begin
  perform private.assert_admin(p_admin_id);
  select * into v_set from public.daily_sets where id = p_daily_set_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'set_not_found');
  end if;
  if v_set.status <> 'scheduled' or v_set.game_date <= private.current_game_date() then
    return jsonb_build_object('ok', false, 'error', 'set_already_live');
  end if;
  update public.daily_sets set status = 'draft', published_at = null, published_by = null
  where id = p_daily_set_id;
  update public.questions q set status = 'approved', published_at = null
  from public.daily_set_questions dsq
  where dsq.daily_set_id = p_daily_set_id and dsq.question_id = q.id;
  perform private.audit(p_admin_id, 'daily_set.unschedule', 'daily_set', p_daily_set_id,
    jsonb_build_object('game_date', v_set.game_date));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Corrections
-- Answer correction policy: every official attempt on the question is rescored against the
-- corrected answer, identically for all players. The pre-correction score and answer are kept
-- on the attempt (original_score / original_answer_snapshot) and in question_corrections, and
-- a public correction note is shown with the answer. Affected daily results, leaderboards and
-- streaks are recomputed (they are derived from attempts). Practice attempts are not rescored.
-- ---------------------------------------------------------------------------
create or replace function public.admin_correct_answer(
  p_admin_id uuid, p_question_id uuid, p_new_answer numeric, p_reason text, p_source_url text,
  p_public_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old numeric;
  v_affected integer;
  v_set_id uuid;
  v_correction_id uuid;
begin
  perform private.assert_admin(p_admin_id);
  if p_new_answer is null or p_new_answer <= 0 or p_new_answer > 1000000000000000 or round(p_new_answer, 2) <> p_new_answer then
    return jsonb_build_object('ok', false, 'error', 'invalid_answer');
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_source_url is null or p_source_url !~ '^https?://[^\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'source_required');
  end if;

  select qa.answer_amount into v_old from public.question_answers qa
  where qa.question_id = p_question_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;
  if v_old = p_new_answer then
    return jsonb_build_object('ok', false, 'error', 'answer_unchanged');
  end if;
  if exists (select 1 from public.questions where id = p_question_id and status = 'withdrawn') then
    return jsonb_build_object('ok', false, 'error', 'question_withdrawn');
  end if;
  -- Unpublished questions are fixed through the normal edit + re-verify workflow instead.
  if not private.question_locked(p_question_id) then
    return jsonb_build_object('ok', false, 'error', 'question_not_published');
  end if;

  update public.question_answers
  set answer_amount = p_new_answer, verified_by = p_admin_id, verified_at = now(),
      verification_status = 'verified'
  where question_id = p_question_id;

  update public.official_attempts a set
    original_score = coalesce(a.original_score, a.score),
    original_answer_snapshot = coalesce(a.original_answer_snapshot, a.answer_snapshot),
    answer_snapshot = p_new_answer,
    score = public.pricele_score(a.guess_amount, p_new_answer),
    absolute_percentage_error = public.pricele_percentage_error(a.guess_amount, p_new_answer),
    corrected_at = now()
  where a.question_id = p_question_id;
  get diagnostics v_affected = row_count;

  update public.questions
  set correction_note = nullif(btrim(coalesce(p_public_note, '')), ''), corrected_at = now()
  where id = p_question_id;

  insert into public.question_corrections (question_id, kind, old_answer, new_answer, reason,
    source_url, admin_user_id, affected_attempts)
  values (p_question_id, 'answer_correction', v_old, p_new_answer, btrim(p_reason), p_source_url,
    p_admin_id, v_affected)
  returning id into v_correction_id;

  select daily_set_id into v_set_id from public.daily_set_questions where question_id = p_question_id;
  if v_set_id is not null then
    perform private.refresh_set_results(v_set_id);
  end if;

  perform private.audit(p_admin_id, 'question.correct_answer', 'question', p_question_id,
    jsonb_build_object('correction_id', v_correction_id, 'old_answer', v_old,
      'new_answer', p_new_answer, 'affected_attempts', v_affected));
  return jsonb_build_object('ok', true, 'affected_attempts', v_affected, 'correction_id', v_correction_id);
end;
$$;

-- Withdrawal policy: a withdrawn question is void for EVERY player. Its attempts are kept but
-- marked voided and excluded from all totals; a daily game is complete once all remaining
-- questions are answered, so the day's maximum becomes 1,000 x remaining questions.
create or replace function public.admin_withdraw_question(p_admin_id uuid, p_question_id uuid, p_reason text, p_public_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affected integer;
  v_set_id uuid;
  v_status public.question_status;
begin
  perform private.assert_admin(p_admin_id);
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select status into v_status from public.questions where id = p_question_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'question_not_found');
  end if;
  if v_status <> 'published' then
    return jsonb_build_object('ok', false, 'error', 'question_not_published');
  end if;

  update public.questions
  set status = 'withdrawn', correction_note = nullif(btrim(coalesce(p_public_note, '')), ''),
      corrected_at = now()
  where id = p_question_id;
  update public.official_attempts set voided = true, corrected_at = now()
  where question_id = p_question_id;
  get diagnostics v_affected = row_count;

  insert into public.question_corrections (question_id, kind, reason, admin_user_id, affected_attempts)
  values (p_question_id, 'withdrawal', btrim(p_reason), p_admin_id, v_affected);

  select daily_set_id into v_set_id from public.daily_set_questions where question_id = p_question_id;
  if v_set_id is not null then
    perform private.refresh_set_results(v_set_id);
  end if;
  perform private.audit(p_admin_id, 'question.withdraw', 'question', p_question_id,
    jsonb_build_object('affected_attempts', v_affected));
  return jsonb_build_object('ok', true, 'affected_attempts', v_affected);
end;
$$;

-- ---------------------------------------------------------------------------
-- User moderation
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_suspension(p_admin_id uuid, p_user_id uuid, p_suspend boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin(p_admin_id);
  if p_admin_id = p_user_id then
    return jsonb_build_object('ok', false, 'error', 'cannot_moderate_self');
  end if;
  if p_suspend and coalesce(char_length(btrim(p_reason)), 0) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  update public.profiles
  set suspended_at = case when p_suspend then now() else null end,
      suspended_reason = case when p_suspend then btrim(p_reason) else null end
  where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;
  perform private.audit(p_admin_id, case when p_suspend then 'user.suspend' else 'user.unsuspend' end,
    'user', p_user_id, jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('ok', true);
end;
$$;

-- Duplicate detection: trigram similarity on normalized prompts.
create or replace function public.admin_similar_questions(p_prompt text, p_exclude uuid default null, p_limit integer default 5)
returns table (id uuid, prompt text, status public.question_status, similarity real)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.prompt, q.status,
         extensions.similarity(q.prompt_normalized, trim(regexp_replace(lower(p_prompt), '[^a-z0-9]+', ' ', 'g')))
  from public.questions q
  where (p_exclude is null or q.id <> p_exclude)
    and extensions.similarity(q.prompt_normalized, trim(regexp_replace(lower(p_prompt), '[^a-z0-9]+', ' ', 'g'))) > 0.35
  order by 4 desc
  limit least(greatest(p_limit, 1), 20)
$$;

grant execute on function public.admin_save_question(uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_verify_question(uuid, uuid, text) to service_role;
grant execute on function public.admin_set_question_status(uuid, uuid, text) to service_role;
grant execute on function public.admin_assign_set_question(uuid, uuid, smallint, uuid) to service_role;
grant execute on function public.validate_daily_set(uuid) to service_role;
grant execute on function public.admin_publish_daily_set(uuid, uuid, date) to service_role;
grant execute on function public.admin_unschedule_daily_set(uuid, uuid) to service_role;
grant execute on function public.admin_correct_answer(uuid, uuid, numeric, text, text, text) to service_role;
grant execute on function public.admin_withdraw_question(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_set_suspension(uuid, uuid, boolean, text) to service_role;
grant execute on function public.admin_similar_questions(text, uuid, integer) to service_role;
grant execute on all functions in schema private to service_role;

-- Required categories.
insert into public.categories (name, slug) values
  ('Business and markets', 'business-and-markets'),
  ('Everyday products', 'everyday-products'),
  ('Sports', 'sports'),
  ('Entertainment', 'entertainment'),
  ('World news', 'world-news'),
  ('Technology', 'technology'),
  ('Real estate', 'real-estate'),
  ('Personal finance', 'personal-finance'),
  ('Science and infrastructure', 'science-and-infrastructure'),
  ('Luxury goods', 'luxury-goods')
on conflict (slug) do nothing;
