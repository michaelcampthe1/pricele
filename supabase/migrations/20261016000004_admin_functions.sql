-- Administrative functions. Each verifies admin role in the database (defense in depth on
-- top of the server-side check) and writes to admin_audit_log.

create or replace function pricele.assert_admin(p_admin uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not pricele.is_admin(p_admin) then
    raise exception 'PRICELE_FORBIDDEN: admin role required' using errcode = '42501';
  end if;
end;
$$;

create or replace function pricele.audit(p_admin uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (admin_user_id, action, entity_type, entity_id, details)
  values (p_admin, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------
-- Create or update a draft/approved question and its answer key.
-- Editing an approved question returns it to draft and clears verification, so it
-- must be re-verified and re-approved. Published questions are rejected (use corrections).
create or replace function pricele.admin_save_question(p_admin uuid, p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_status text;
  v_amount numeric;
begin
  perform pricele.assert_admin(p_admin);

  begin
    v_amount := nullif(p->>'answerAmount', '')::numeric;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end;
  if v_amount is not null and (v_amount <= 0 or v_amount > pricele.max_amount() or v_amount <> round(v_amount, 2)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if v_id is null then
    insert into public.questions (prompt, context, difficulty, category_id, image_url, image_alt, image_credit, created_by)
    values (btrim(p->>'prompt'), nullif(btrim(p->>'context'), ''), p->>'difficulty', (p->>'categoryId')::uuid,
            nullif(btrim(p->>'imageUrl'), ''), nullif(btrim(p->>'imageAlt'), ''), nullif(btrim(p->>'imageCredit'), ''),
            p_admin)
    returning id into v_id;
    perform pricele.audit(p_admin, 'question.create', 'question', v_id, jsonb_build_object('difficulty', p->>'difficulty'));
  else
    select status into v_status from public.questions where id = v_id for update;
    if v_status is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_status in ('published', 'archived') then
      return jsonb_build_object('ok', false, 'error', 'not_editable');
    end if;
    if exists (select 1 from public.daily_set_questions where question_id = v_id) then
      return jsonb_build_object('ok', false, 'error', 'assigned_to_set');
    end if;
    update public.questions
       set prompt = btrim(p->>'prompt'),
           context = nullif(btrim(p->>'context'), ''),
           difficulty = p->>'difficulty',
           category_id = (p->>'categoryId')::uuid,
           image_url = nullif(btrim(p->>'imageUrl'), ''),
           image_alt = nullif(btrim(p->>'imageAlt'), ''),
           image_credit = nullif(btrim(p->>'imageCredit'), ''),
           status = 'draft',
           approved_by = null,
           approved_at = null
     where id = v_id;
    perform pricele.audit(p_admin, 'question.update', 'question', v_id,
      jsonb_build_object('previousStatus', v_status));
  end if;

  if v_amount is not null then
    insert into public.question_answers
      (question_id, answer_amount, answer_definition, reference_date, reference_period, explanation, verification_status)
    values (v_id, v_amount, btrim(p->>'answerDefinition'), nullif(p->>'referenceDate', '')::date,
            nullif(btrim(p->>'referencePeriod'), ''), coalesce(btrim(p->>'explanation'), ''), 'unverified')
    on conflict (question_id) do update set
      answer_amount = excluded.answer_amount,
      answer_definition = excluded.answer_definition,
      reference_date = excluded.reference_date,
      reference_period = excluded.reference_period,
      explanation = excluded.explanation,
      verification_status = 'unverified',
      verified_by = null,
      verified_at = null;
    update public.question_sources set verified_at = null, verified_by = null where question_id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when check_violation or not_null_violation or invalid_text_representation or foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_input', 'detail', sqlerrm);
end;
$$;

create or replace function pricele.admin_add_source(p_admin uuid, p_question_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  perform pricele.assert_admin(p_admin);
  select status into v_status from public.questions where id = p_question_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  insert into public.question_sources
    (question_id, title, publisher, source_url, published_at, reference_date, supporting_excerpt, verification_notes)
  values (p_question_id, btrim(p->>'title'), btrim(p->>'publisher'), btrim(p->>'url'),
          nullif(p->>'publishedAt', '')::date, nullif(p->>'referenceDate', '')::date,
          nullif(btrim(p->>'supportingExcerpt'), ''), nullif(btrim(p->>'verificationNotes'), ''))
  returning id into v_id;
  -- New evidence on an unpublished question requires re-verification.
  if v_status in ('draft', 'approved') then
    update public.question_answers set verification_status = 'unverified', verified_at = null, verified_by = null
     where question_id = p_question_id and verification_status = 'verified';
    update public.questions set status = 'draft', approved_at = null, approved_by = null
     where id = p_question_id and status = 'approved'
       and not exists (select 1 from public.daily_set_questions where question_id = p_question_id);
  end if;
  perform pricele.audit(p_admin, 'source.add', 'question', p_question_id, jsonb_build_object('sourceId', v_id, 'url', p->>'url'));
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when check_violation or not_null_violation or invalid_datetime_format then
    return jsonb_build_object('ok', false, 'error', 'invalid_input', 'detail', sqlerrm);
end;
$$;

create or replace function pricele.admin_delete_source(p_admin uuid, p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qid uuid;
begin
  perform pricele.assert_admin(p_admin);
  delete from public.question_sources where id = p_source_id returning question_id into v_qid;
  if v_qid is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update public.question_answers set verification_status = 'unverified', verified_at = null, verified_by = null
   where question_id = v_qid and verification_status = 'verified';
  update public.questions set status = 'draft', approved_at = null, approved_by = null
   where id = v_qid and status = 'approved'
     and not exists (select 1 from public.daily_set_questions where question_id = v_qid);
  perform pricele.audit(p_admin, 'source.delete', 'question', v_qid, jsonb_build_object('sourceId', p_source_id));
  return jsonb_build_object('ok', true);
exception when raise_exception then
  return jsonb_build_object('ok', false, 'error', 'immutable');
end;
$$;

-- Problems that block verification/publication of a single question.
create or replace function pricele.question_problems(p_question_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when qa.question_id is null then 'Answer amount is missing' end,
    case when qa.question_id is not null and qa.answer_amount <= 0 then 'Answer must be positive' end,
    case when qa.question_id is not null and char_length(coalesce(qa.answer_definition, '')) < 5 then 'Answer definition is missing' end,
    case when qa.question_id is not null and qa.reference_date is null and qa.reference_period is null
         then 'Reference date or measurement period is missing' end,
    case when qa.question_id is not null and char_length(coalesce(qa.explanation, '')) < 20
         then 'Explanation is missing or too short (20+ characters)' end,
    case when not exists (select 1 from public.question_sources s where s.question_id = q.id)
         then 'At least one source is required' end,
    case when exists (select 1 from public.question_sources s where s.question_id = q.id)
          and not exists (select 1 from public.question_sources s where s.question_id = q.id
                            and (s.supporting_excerpt is not null or s.verification_notes is not null))
         then 'Record a supporting excerpt or verification note for at least one source' end
  ], null)
  from public.questions q
  left join public.question_answers qa on qa.question_id = q.id
  where q.id = p_question_id;
$$;

-- Admin attests that the source(s) support the exact target amount.
create or replace function pricele.admin_verify_answer(p_admin uuid, p_question_id uuid, p_attestation boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problems text[];
  v_status text;
begin
  perform pricele.assert_admin(p_admin);
  if p_attestation is not true then
    return jsonb_build_object('ok', false, 'error', 'attestation_required');
  end if;
  select status into v_status from public.questions where id = p_question_id;
  if v_status is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'not_draft'); end if;
  v_problems := pricele.question_problems(p_question_id);
  if cardinality(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'error', 'incomplete', 'problems', to_jsonb(v_problems));
  end if;
  update public.question_answers
     set verification_status = 'verified', verified_by = p_admin, verified_at = now()
   where question_id = p_question_id;
  update public.question_sources set verified_at = now(), verified_by = p_admin
   where question_id = p_question_id;
  perform pricele.audit(p_admin, 'question.verify', 'question', p_question_id,
    jsonb_build_object('answer', (select answer_amount::text from public.question_answers where question_id = p_question_id)));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function pricele.admin_set_question_status(p_admin uuid, p_question_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_verified text;
begin
  perform pricele.assert_admin(p_admin);
  select q.status, qa.verification_status into v_status, v_verified
    from public.questions q left join public.question_answers qa on qa.question_id = q.id
   where q.id = p_question_id for update of q;
  if v_status is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if p_action = 'approve' then
    if v_status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'not_draft'); end if;
    if v_verified is distinct from 'verified' then
      return jsonb_build_object('ok', false, 'error', 'not_verified');
    end if;
    update public.questions set status = 'approved', approved_by = p_admin, approved_at = now() where id = p_question_id;
  elsif p_action = 'unapprove' then
    if v_status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved'); end if;
    if exists (select 1 from public.daily_set_questions where question_id = p_question_id) then
      return jsonb_build_object('ok', false, 'error', 'assigned_to_set');
    end if;
    update public.questions set status = 'draft', approved_by = null, approved_at = null where id = p_question_id;
  elsif p_action = 'archive' then
    if v_status not in ('draft', 'approved') then return jsonb_build_object('ok', false, 'error', 'not_archivable'); end if;
    if exists (select 1 from public.daily_set_questions where question_id = p_question_id) then
      return jsonb_build_object('ok', false, 'error', 'assigned_to_set');
    end if;
    update public.questions set status = 'archived' where id = p_question_id;
  elsif p_action = 'restore' then
    if v_status <> 'archived' then return jsonb_build_object('ok', false, 'error', 'not_archived'); end if;
    update public.questions set status = 'draft', approved_by = null, approved_at = null where id = p_question_id;
    update public.question_answers set verification_status = 'unverified', verified_by = null, verified_at = null
     where question_id = p_question_id;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;
  perform pricele.audit(p_admin, 'question.' || p_action, 'question', p_question_id, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- Likely duplicates: trigram similarity on normalized prompt, or a shared source URL.
create or replace function pricele.admin_similar_questions(p_admin uuid, p_question_id uuid, p_text text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm text;
  v_result jsonb;
begin
  perform pricele.assert_admin(p_admin);
  if p_question_id is not null then
    select normalized_prompt into v_norm from public.questions where id = p_question_id;
  else
    v_norm := lower(btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[^A-Za-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')));
  end if;
  select coalesce(jsonb_agg(x order by (x->>'similarity')::numeric desc), '[]'::jsonb) into v_result from (
    select jsonb_build_object('id', q.id, 'prompt', q.prompt, 'status', q.status,
             'similarity', round(extensions.similarity(q.normalized_prompt, v_norm)::numeric, 2),
             'reason', 'Similar wording') as x
      from public.questions q
     where q.id is distinct from p_question_id
       and extensions.similarity(q.normalized_prompt, v_norm) >= 0.6
    union all
    select jsonb_build_object('id', q.id, 'prompt', q.prompt, 'status', q.status, 'similarity', 1,
             'reason', 'Shares a source URL')
      from public.questions q
     where p_question_id is not null and q.id <> p_question_id
       and exists (
         select 1 from public.question_sources s1 join public.question_sources s2
           on lower(s1.source_url) = lower(s2.source_url)
          where s1.question_id = p_question_id and s2.question_id = q.id)
    limit 20
  ) t;
  return v_result;
end;
$$;

create or replace function pricele.admin_get_question(p_admin uuid, p_question_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform pricele.assert_admin(p_admin);
  select jsonb_build_object(
    'id', q.id, 'prompt', q.prompt, 'context', q.context, 'difficulty', q.difficulty,
    'categoryId', q.category_id, 'category', c.name, 'status', q.status, 'isSample', q.is_sample,
    'imageUrl', q.image_url, 'imageAlt', q.image_alt, 'imageCredit', q.image_credit,
    'createdAt', q.created_at, 'updatedAt', q.updated_at, 'approvedAt', q.approved_at,
    'approvedBy', (select username from public.profiles where id = q.approved_by),
    'answer', case when qa.question_id is null then null else jsonb_build_object(
      'amount', qa.answer_amount::text, 'definition', qa.answer_definition, 'referenceDate', qa.reference_date,
      'referencePeriod', qa.reference_period, 'explanation', qa.explanation,
      'verificationStatus', qa.verification_status, 'verifiedAt', qa.verified_at,
      'verifiedBy', (select username from public.profiles where id = qa.verified_by)) end,
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'publisher', s.publisher, 'url', s.source_url,
        'publishedAt', s.published_at, 'referenceDate', s.reference_date,
        'supportingExcerpt', s.supporting_excerpt, 'verificationNotes', s.verification_notes,
        'verifiedAt', s.verified_at) order by s.created_at)
      from public.question_sources s where s.question_id = q.id), '[]'::jsonb),
    'problems', to_jsonb(pricele.question_problems(q.id)),
    'dailySet', (select jsonb_build_object('id', ds.id, 'gameDate', ds.game_date, 'status', ds.status)
                   from public.daily_set_questions dsq join public.daily_sets ds on ds.id = dsq.daily_set_id
                  where dsq.question_id = q.id),
    'corrections', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c2.id, 'oldAnswer', c2.old_answer::text, 'newAnswer', c2.new_answer::text, 'reason', c2.reason,
        'sourceUrl', c2.source_url, 'createdAt', c2.created_at,
        'affectedOfficial', c2.affected_official_attempts) order by c2.created_at)
      from public.question_corrections c2 where c2.question_id = q.id), '[]'::jsonb),
    'attemptCount', (select count(*) from public.official_attempts a where a.question_id = q.id)
  ) into v
  from public.questions q
  join public.categories c on c.id = q.category_id
  left join public.question_answers qa on qa.question_id = q.id
  where q.id = p_question_id;
  return v;
end;
$$;

create or replace function pricele.admin_list_questions(
  p_admin uuid, p_status text, p_difficulty text, p_search text, p_limit integer, p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform pricele.assert_admin(p_admin);
  select jsonb_build_object(
    'total', (select count(*) from public.questions q
               where (p_status is null or q.status = p_status)
                 and (p_difficulty is null or q.difficulty = p_difficulty)
                 and (p_search is null or q.prompt ilike '%' || p_search || '%')),
    'items', coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  ) into v
  from (
    select q.id, q.prompt, q.difficulty, q.status, q.is_sample as "isSample", c.name as category,
           qa.verification_status as "verificationStatus",
           (select count(*) from public.question_sources s where s.question_id = q.id) as "sourceCount",
           cardinality(pricele.question_problems(q.id)) as "problemCount",
           (select ds.game_date from public.daily_set_questions dsq join public.daily_sets ds on ds.id = dsq.daily_set_id
             where dsq.question_id = q.id) as "gameDate",
           q.updated_at as "updatedAt"
      from public.questions q
      join public.categories c on c.id = q.category_id
      left join public.question_answers qa on qa.question_id = q.id
     where (p_status is null or q.status = p_status)
       and (p_difficulty is null or q.difficulty = p_difficulty)
       and (p_search is null or q.prompt ilike '%' || p_search || '%')
     order by q.updated_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) t;
  return v;
end;
$$;

-- Questions grouped by source health for the sources review page.
create or replace function pricele.admin_source_review(p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform pricele.assert_admin(p_admin);
  select jsonb_build_object(
    'problemQuestions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'prompt', q.prompt, 'status', q.status, 'problems', to_jsonb(pricele.question_problems(q.id)))
        order by q.updated_at desc)
      from public.questions q
      where q.status in ('draft', 'approved') and cardinality(pricele.question_problems(q.id)) > 0), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'questionId', s.question_id, 'prompt', q.prompt, 'questionStatus', q.status,
        'title', s.title, 'publisher', s.publisher, 'url', s.source_url, 'publishedAt', s.published_at,
        'hasExcerpt', s.supporting_excerpt is not null, 'verifiedAt', s.verified_at)
        order by s.created_at desc)
      from (select * from public.question_sources order by created_at desc limit 200) s
      join public.questions q on q.id = s.question_id), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'questionId', r.question_id, 'prompt', q.prompt, 'message', r.message,
        'status', r.status, 'createdAt', r.created_at) order by r.created_at desc)
      from (select * from public.question_reports where status = 'open' order by created_at desc limit 100) r
      join public.questions q on q.id = r.question_id), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

create or replace function pricele.admin_resolve_report(p_admin uuid, p_report_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pricele.assert_admin(p_admin);
  if p_status not in ('resolved', 'dismissed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;
  update public.question_reports set status = p_status, resolved_by = p_admin, resolved_at = now()
   where id = p_report_id and status = 'open';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform pricele.audit(p_admin, 'report.' || p_status, 'question_report', p_report_id, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily sets
-- ---------------------------------------------------------------------------
create or replace function pricele.admin_create_daily_set(p_admin uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform pricele.assert_admin(p_admin);
  if p_date is null or p_date < pricele.current_game_date() then
    return jsonb_build_object('ok', false, 'error', 'date_in_past');
  end if;
  if p_date > pricele.current_game_date() + 366 then
    return jsonb_build_object('ok', false, 'error', 'date_too_far');
  end if;
  insert into public.daily_sets (game_date, created_by) values (p_date, p_admin)
  on conflict (game_date) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'date_taken');
  end if;
  perform pricele.audit(p_admin, 'daily_set.create', 'daily_set', v_id, jsonb_build_object('gameDate', p_date));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function pricele.admin_assign_question(p_admin uuid, p_set_id uuid, p_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_status text;
  v_q record;
  v_pos smallint;
begin
  perform pricele.assert_admin(p_admin);
  select status into v_set_status from public.daily_sets where id = p_set_id for update;
  if v_set_status is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_set_status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'set_locked'); end if;

  select q.status, q.difficulty into v_q from public.questions q where q.id = p_question_id;
  if v_q.status is null then return jsonb_build_object('ok', false, 'error', 'question_not_found'); end if;
  if v_q.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'question_not_approved'); end if;
  if exists (select 1 from public.daily_set_questions where question_id = p_question_id) then
    return jsonb_build_object('ok', false, 'error', 'question_already_used');
  end if;

  v_pos := case v_q.difficulty when 'easy' then 1 when 'medium' then 2 else 3 end;
  delete from public.daily_set_questions where daily_set_id = p_set_id and position = v_pos;
  insert into public.daily_set_questions (daily_set_id, question_id, position) values (p_set_id, p_question_id, v_pos);
  perform pricele.audit(p_admin, 'daily_set.assign', 'daily_set', p_set_id,
    jsonb_build_object('questionId', p_question_id, 'position', v_pos));
  return jsonb_build_object('ok', true, 'position', v_pos);
end;
$$;

create or replace function pricele.admin_unassign_question(p_admin uuid, p_set_id uuid, p_position smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pricele.assert_admin(p_admin);
  if (select status from public.daily_sets where id = p_set_id) is distinct from 'draft' then
    return jsonb_build_object('ok', false, 'error', 'set_locked');
  end if;
  delete from public.daily_set_questions where daily_set_id = p_set_id and position = p_position;
  perform pricele.audit(p_admin, 'daily_set.unassign', 'daily_set', p_set_id, jsonb_build_object('position', p_position));
  return jsonb_build_object('ok', true);
end;
$$;

-- Validation used both for preview and as the publication gate.
create or replace function pricele.validate_daily_set(p_set_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set public.daily_sets%rowtype;
  v_errors text[] := '{}';
  v_warnings text[] := '{}';
  v_count integer;
  r record;
begin
  select * into v_set from public.daily_sets where id = p_set_id;
  if v_set.id is null then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Daily set not found'), 'warnings', '[]'::jsonb);
  end if;
  if v_set.status <> 'draft' then
    v_errors := v_errors || ('Set is already ' || v_set.status);
  end if;
  if v_set.game_date < pricele.current_game_date() then
    v_errors := v_errors || 'Game date is in the past'::text;
  end if;
  if exists (select 1 from public.daily_sets where game_date = v_set.game_date and id <> v_set.id
               and status in ('scheduled', 'published')) then
    v_errors := v_errors || 'Another set is already published for this date'::text;
  end if;

  select count(*) into v_count from public.daily_set_questions where daily_set_id = p_set_id;
  if v_count <> 3 then
    v_errors := v_errors || format('Set needs exactly 3 questions (has %s)', v_count);
  end if;
  if (select count(distinct question_id) from public.daily_set_questions where daily_set_id = p_set_id) <> v_count then
    v_errors := v_errors || 'Set contains duplicate questions'::text;
  end if;

  for r in
    select dsq.position, q.id, q.difficulty, q.status, q.prompt, q.category_id, qa.verification_status, qa.answer_amount
      from generate_series(1, 3) as gs(pos)
      left join public.daily_set_questions dsq on dsq.daily_set_id = p_set_id and dsq.position = gs.pos
      left join public.questions q on q.id = dsq.question_id
      left join public.question_answers qa on qa.question_id = q.id
     order by gs.pos
  loop
    if r.id is null then
      continue;
    end if;
    if r.position <> (case r.difficulty when 'easy' then 1 when 'medium' then 2 else 3 end) then
      v_errors := v_errors || format('Question %s is in the wrong difficulty position', r.position);
    end if;
    if r.status <> 'approved' then
      v_errors := v_errors || format('Question %s is not approved', r.position);
    end if;
    if r.verification_status is distinct from 'verified' then
      v_errors := v_errors || format('Question %s answer is not verified', r.position);
    end if;
    if r.answer_amount is null or r.answer_amount <= 0 then
      v_errors := v_errors || format('Question %s answer is missing or invalid', r.position);
    end if;
    if cardinality(pricele.question_problems(r.id)) > 0 then
      v_errors := v_errors || format('Question %s: %s', r.position, array_to_string(pricele.question_problems(r.id), '; '));
    end if;
  end loop;

  -- Variety hints (warnings only, never blocking).
  if (select count(distinct q.category_id) from public.daily_set_questions dsq
        join public.questions q on q.id = dsq.question_id where dsq.daily_set_id = p_set_id) < v_count then
    v_warnings := v_warnings || 'Two or more questions share a category'::text;
  end if;
  if exists (
    select 1 from public.daily_set_questions dsq
      join public.questions q on q.id = dsq.question_id
     where dsq.daily_set_id = p_set_id
       and q.category_id in (
         select q2.category_id from public.daily_sets ds2
           join public.daily_set_questions d2 on d2.daily_set_id = ds2.id
           join public.questions q2 on q2.id = d2.question_id
          where ds2.status in ('scheduled', 'published')
            and ds2.game_date between v_set.game_date - 2 and v_set.game_date - 1)
  ) then
    v_warnings := v_warnings || 'A category here also appeared in the previous two days'::text;
  end if;
  if exists (select 1 from public.daily_set_questions dsq join public.questions q on q.id = dsq.question_id
              where dsq.daily_set_id = p_set_id and q.is_sample) then
    v_warnings := v_warnings || 'Set contains sample (development) questions'::text;
  end if;

  return jsonb_build_object('ok', cardinality(v_errors) = 0, 'errors', to_jsonb(v_errors), 'warnings', to_jsonb(v_warnings));
end;
$$;

create or replace function pricele.admin_publish_daily_set(p_admin uuid, p_set_id uuid, p_confirm boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_validation jsonb;
  v_date date;
  v_new_status text;
begin
  perform pricele.assert_admin(p_admin);
  if p_confirm is not true then
    return jsonb_build_object('ok', false, 'error', 'confirmation_required');
  end if;
  -- Lock the set to serialize concurrent publication attempts.
  select game_date into v_date from public.daily_sets where id = p_set_id for update;
  if v_date is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  v_validation := pricele.validate_daily_set(p_set_id);
  if not (v_validation->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'error', 'validation_failed', 'validation', v_validation);
  end if;

  v_new_status := case when v_date > pricele.current_game_date() then 'scheduled' else 'published' end;

  update public.questions set status = 'published'
   where id in (select question_id from public.daily_set_questions where daily_set_id = p_set_id);
  update public.daily_sets
     set status = v_new_status, published_at = now(), published_by = p_admin, version = version + 1
   where id = p_set_id;

  perform pricele.audit(p_admin, 'daily_set.publish', 'daily_set', p_set_id,
    jsonb_build_object('gameDate', v_date, 'status', v_new_status,
      'version', (select version from public.daily_sets where id = p_set_id),
      'questionIds', (select jsonb_agg(question_id order by position) from public.daily_set_questions where daily_set_id = p_set_id)));
  return jsonb_build_object('ok', true, 'status', v_new_status);
end;
$$;

-- Withdraw a set only while nobody has played it (future, or zero official attempts).
-- After play begins, inaccuracies are handled with corrections so every player is treated alike.
create or replace function pricele.admin_unpublish_daily_set(p_admin uuid, p_set_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.daily_sets%rowtype;
begin
  perform pricele.assert_admin(p_admin);
  select * into v_set from public.daily_sets where id = p_set_id for update;
  if v_set.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_set.status not in ('scheduled', 'published') then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if exists (select 1 from public.official_attempts where daily_set_id = p_set_id)
     or exists (select 1 from public.practice_attempts where daily_set_id = p_set_id) then
    return jsonb_build_object('ok', false, 'error', 'already_played');
  end if;
  if char_length(coalesce(btrim(p_reason), '')) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  update public.daily_sets set status = 'draft', published_at = null, published_by = null where id = p_set_id;
  perform set_config('pricele.allow_status_change', 'on', true);
  update public.questions set status = 'approved'
   where id in (select question_id from public.daily_set_questions where daily_set_id = p_set_id);
  perform set_config('pricele.allow_status_change', '', true);
  perform pricele.audit(p_admin, 'daily_set.unpublish', 'daily_set', p_set_id,
    jsonb_build_object('gameDate', v_set.game_date, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function pricele.admin_delete_daily_set(p_admin uuid, p_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date;
begin
  perform pricele.assert_admin(p_admin);
  delete from public.daily_sets where id = p_set_id and status = 'draft' returning game_date into v_date;
  if v_date is null then return jsonb_build_object('ok', false, 'error', 'not_deletable'); end if;
  perform pricele.audit(p_admin, 'daily_set.delete', 'daily_set', p_set_id, jsonb_build_object('gameDate', v_date));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function pricele.admin_list_daily_sets(p_admin uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform pricele.assert_admin(p_admin);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ds.id, 'gameDate', ds.game_date, 'status', ds.status, 'version', ds.version,
    'publishedAt', ds.published_at,
    'publishedBy', (select username from public.profiles where id = ds.published_by),
    'questionCount', (select count(*) from public.daily_set_questions where daily_set_id = ds.id),
    'players', (select count(distinct coalesce(a.user_id, a.guest_session_id)) from public.official_attempts a where a.daily_set_id = ds.id),
    'completions', (select count(*) from public.daily_results dr where dr.daily_set_id = ds.id)
  ) order by ds.game_date desc), '[]'::jsonb) into v
  from public.daily_sets ds
  where (p_from is null or ds.game_date >= p_from) and (p_to is null or ds.game_date <= p_to);
  return v;
end;
$$;

create or replace function pricele.admin_get_daily_set(p_admin uuid, p_set_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform pricele.assert_admin(p_admin);
  select jsonb_build_object(
    'id', ds.id, 'gameDate', ds.game_date, 'status', ds.status, 'version', ds.version,
    'publishedAt', ds.published_at, 'publishedBy', (select username from public.profiles where id = ds.published_by),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'position', dsq.position, 'id', q.id, 'prompt', q.prompt, 'context', q.context, 'difficulty', q.difficulty,
        'category', c.name, 'status', q.status, 'isSample', q.is_sample,
        'answer', qa.answer_amount::text, 'answerDefinition', qa.answer_definition,
        'verificationStatus', qa.verification_status) order by dsq.position)
      from public.daily_set_questions dsq
      join public.questions q on q.id = dsq.question_id
      join public.categories c on c.id = q.category_id
      left join public.question_answers qa on qa.question_id = q.id
      where dsq.daily_set_id = ds.id), '[]'::jsonb),
    'validation', pricele.validate_daily_set(ds.id),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'prompt', q.prompt, 'difficulty', q.difficulty, 'category', c.name, 'isSample', q.is_sample)
        order by q.difficulty, q.approved_at)
      from public.questions q join public.categories c on c.id = q.category_id
      where q.status = 'approved'
        and not exists (select 1 from public.daily_set_questions d where d.question_id = q.id)), '[]'::jsonb),
    'stats', jsonb_build_object(
      'players', (select count(distinct coalesce(a.user_id, a.guest_session_id)) from public.official_attempts a where a.daily_set_id = ds.id),
      'completions', (select count(*) from public.daily_results dr where dr.daily_set_id = ds.id),
      'averageScore', (select round(avg(total_score), 0) from public.daily_results dr where dr.daily_set_id = ds.id))
  ) into v
  from public.daily_sets ds where ds.id = p_set_id;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Corrections: re-score every official (and practice) attempt for the question with the
-- corrected answer, keep a per-attempt revision trail, and recompute daily results.
-- Streaks and leaderboards are derived from daily_results, so they update automatically.
-- ---------------------------------------------------------------------------
create or replace function pricele.admin_correct_answer(
  p_admin uuid, p_question_id uuid, p_new_answer numeric, p_reason text, p_source_url text, p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old numeric(20, 2);
  v_status text;
  v_correction_id uuid;
  v_official integer := 0;
  v_practice integer := 0;
  r record;
  v_score integer;
  v_err numeric;
begin
  perform pricele.assert_admin(p_admin);
  if p_confirm is not true then return jsonb_build_object('ok', false, 'error', 'confirmation_required'); end if;
  if p_new_answer is null or p_new_answer <= 0 or p_new_answer > pricele.max_amount() or p_new_answer <> round(p_new_answer, 2) then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if char_length(coalesce(btrim(p_reason), '')) < 10 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if coalesce(p_source_url, '') !~ '^https?://[^\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'source_required');
  end if;

  select q.status, qa.answer_amount into v_status, v_old
    from public.questions q join public.question_answers qa on qa.question_id = q.id
   where q.id = p_question_id
   for update of qa;
  if v_status is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_status <> 'published' then return jsonb_build_object('ok', false, 'error', 'not_published'); end if;
  if v_old = p_new_answer then return jsonb_build_object('ok', false, 'error', 'unchanged'); end if;

  insert into public.question_corrections (question_id, old_answer, new_answer, reason, source_url, admin_user_id)
  values (p_question_id, v_old, p_new_answer, btrim(p_reason), btrim(p_source_url), p_admin)
  returning id into v_correction_id;

  perform set_config('pricele.correction_in_progress', 'on', true);
  update public.question_answers set answer_amount = p_new_answer where question_id = p_question_id;
  perform set_config('pricele.correction_in_progress', '', true);

  -- Record the correction source alongside the original sources.
  insert into public.question_sources (question_id, title, publisher, source_url, verification_notes, verified_at, verified_by)
  values (p_question_id, 'Correction source', 'Recorded with correction', btrim(p_source_url), btrim(p_reason), now(), p_admin);

  for r in select * from public.official_attempts where question_id = p_question_id for update loop
    v_score := pricele.score(r.guess_amount, p_new_answer);
    v_err := pricele.percentage_error(r.guess_amount, p_new_answer);
    insert into public.official_attempt_revisions
      (attempt_id, correction_id, old_answer_snapshot, old_score, old_absolute_percentage_error, old_scoring_version,
       new_answer_snapshot, new_score, new_absolute_percentage_error)
    values (r.id, v_correction_id, r.answer_snapshot, r.score, r.absolute_percentage_error, r.scoring_version,
            p_new_answer, v_score, v_err);
    update public.official_attempts
       set answer_snapshot = p_new_answer, score = v_score, absolute_percentage_error = v_err
     where id = r.id;
    if r.user_id is not null then
      perform pricele.refresh_daily_result(r.user_id, r.daily_set_id);
    end if;
    v_official := v_official + 1;
  end loop;

  update public.practice_attempts
     set answer_snapshot = p_new_answer,
         score = pricele.score(guess_amount, p_new_answer),
         absolute_percentage_error = pricele.percentage_error(guess_amount, p_new_answer)
   where question_id = p_question_id;
  get diagnostics v_practice = row_count;

  update public.question_corrections
     set affected_official_attempts = v_official, affected_practice_attempts = v_practice
   where id = v_correction_id;

  perform pricele.audit(p_admin, 'question.correct', 'question', p_question_id,
    jsonb_build_object('correctionId', v_correction_id, 'oldAnswer', v_old::text, 'newAnswer', p_new_answer::text,
                       'affectedOfficial', v_official, 'affectedPractice', v_practice));
  return jsonb_build_object('ok', true, 'correctionId', v_correction_id,
                            'affectedOfficial', v_official, 'affectedPractice', v_practice);
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview, users, audit
-- ---------------------------------------------------------------------------
create or replace function pricele.admin_overview(p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := pricele.current_game_date();
  v jsonb;
begin
  perform pricele.assert_admin(p_admin);
  select jsonb_build_object(
    'today', v_today,
    'todaySet', (select jsonb_build_object('id', id, 'status', status, 'gameDate', game_date)
                   from public.daily_sets where game_date = v_today),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object('date', d::date,
        'set', (select jsonb_build_object('id', ds.id, 'status', ds.status,
                  'questionCount', (select count(*) from public.daily_set_questions where daily_set_id = ds.id))
                  from public.daily_sets ds where ds.game_date = d::date)) order by d)
      from generate_series(v_today, v_today + 13, interval '1 day') d), '[]'::jsonb),
    'counts', jsonb_build_object(
      'published', (select count(*) from public.questions where status = 'published'),
      'approvedUnused', (select count(*) from public.questions q where status = 'approved'
                           and not exists (select 1 from public.daily_set_questions d where d.question_id = q.id)),
      'drafts', (select count(*) from public.questions where status = 'draft'),
      'awaitingVerification', (select count(*) from public.questions q
                                 left join public.question_answers qa on qa.question_id = q.id
                                where q.status = 'draft' and coalesce(qa.verification_status, 'unverified') <> 'verified'),
      'sourceProblems', (select count(*) from public.questions q where q.status in ('draft', 'approved')
                           and cardinality(pricele.question_problems(q.id)) > 0),
      'openReports', (select count(*) from public.question_reports where status = 'open')
    ),
    'usage', jsonb_build_object(
      'todayPlayers', (select count(distinct coalesce(a.user_id, a.guest_session_id)) from public.official_attempts a
                         join public.daily_sets ds on ds.id = a.daily_set_id where ds.game_date = v_today),
      'todayCompletions', (select count(*) from public.daily_results where game_date = v_today),
      'registeredUsers', (select count(*) from public.profiles),
      'last7DaysCompletions', (select count(*) from public.daily_results where game_date > v_today - 7)
    ),
    'recentActivity', coalesce((select jsonb_agg(jsonb_build_object(
        'action', l.action, 'entityType', l.entity_type, 'entityId', l.entity_id, 'createdAt', l.created_at,
        'admin', (select username from public.profiles where id = l.admin_user_id)) order by l.created_at desc)
      from (select * from public.admin_audit_log order by created_at desc limit 10) l), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

create or replace function pricele.admin_search_users(p_admin uuid, p_query text, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  perform pricele.assert_admin(p_admin);
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'displayName', p.display_name, 'email', u.email,
      'createdAt', p.created_at, 'isPublic', p.is_public,
      'isAdmin', pricele.is_admin(p.id),
      'suspendedAt', m.suspended_at, 'suspensionReason', m.reason,
      'gamesCompleted', (select count(*) from public.daily_results dr where dr.user_id = p.id),
      'lastPlayedAt', (select max(submitted_at) from public.official_attempts a where a.user_id = p.id)
    ) as x
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_moderation m on m.user_id = p.id
    where v_q = '' or p.username like '%' || v_q || '%' or lower(u.email) like v_q || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ) t;
  return v;
end;
$$;

create or replace function pricele.admin_set_suspension(p_admin uuid, p_user_id uuid, p_suspend boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pricele.assert_admin(p_admin);
  if p_user_id = p_admin then
    return jsonb_build_object('ok', false, 'error', 'cannot_moderate_self');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_suspend and char_length(coalesce(btrim(p_reason), '')) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  insert into public.user_moderation (user_id, suspended_at, reason, suspended_by)
  values (p_user_id, case when p_suspend then now() end, case when p_suspend then btrim(p_reason) end, p_admin)
  on conflict (user_id) do update set
    suspended_at = excluded.suspended_at, reason = excluded.reason, suspended_by = excluded.suspended_by;
  perform pricele.audit(p_admin, case when p_suspend then 'user.suspend' else 'user.unsuspend' end, 'user', p_user_id,
    jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function pricele.admin_audit_log(p_admin uuid, p_limit integer, p_before timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform pricele.assert_admin(p_admin);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'action', l.action, 'entityType', l.entity_type, 'entityId', l.entity_id,
    'details', l.details, 'createdAt', l.created_at,
    'admin', (select username from public.profiles where id = l.admin_user_id)) order by l.created_at desc), '[]'::jsonb)
  into v
  from (select * from public.admin_audit_log
         where p_before is null or created_at < p_before
         order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) l;
  return v;
end;
$$;

create or replace function pricele.admin_categories(p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform pricele.assert_admin(p_admin);
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'isActive', is_active) order by name), '[]'::jsonb)
    into v from public.categories;
  return v;
end;
$$;

create or replace function pricele.admin_add_category(p_admin uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_slug text := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));
begin
  perform pricele.assert_admin(p_admin);
  insert into public.categories (name, slug) values (btrim(p_name), v_slug) returning id into v_id;
  perform pricele.audit(p_admin, 'category.create', 'category', v_id, jsonb_build_object('name', p_name));
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'error', 'duplicate');
  when check_violation then return jsonb_build_object('ok', false, 'error', 'invalid_input');
end;
$$;

-- Scheduled job: promote scheduled sets whose date has arrived and report coverage.
create or replace function pricele.cron_publication_check()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := pricele.current_game_date();
  v_promoted integer;
begin
  update public.daily_sets set status = 'published'
   where status = 'scheduled' and game_date <= v_today;
  get diagnostics v_promoted = row_count;
  return jsonb_build_object(
    'today', v_today,
    'promoted', v_promoted,
    'todayLive', exists (select 1 from public.daily_sets where game_date = v_today and status in ('scheduled', 'published')),
    'tomorrowReady', exists (select 1 from public.daily_sets where game_date = v_today + 1 and status in ('scheduled', 'published')),
    'missingNext7', (select coalesce(jsonb_agg(d::date order by d), '[]'::jsonb)
                       from generate_series(v_today, v_today + 6, interval '1 day') d
                      where not exists (select 1 from public.daily_sets ds where ds.game_date = d::date
                                          and ds.status in ('scheduled', 'published'))),
    'expiredGuestSessionsRemoved', 0
  );
end;
$$;

-- Admin bootstrap (NOT executable by pricele_app; run by the database owner only).
create or replace function pricele.bootstrap_admin(p_email text, p_allow_additional boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if exists (select 1 from public.user_roles where role = 'admin') and not p_allow_additional then
    return jsonb_build_object('ok', false, 'error', 'admin_already_exists');
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;
  insert into public.user_roles (user_id, role) values (v_user, 'admin') on conflict do nothing;
  insert into public.admin_audit_log (admin_user_id, action, entity_type, entity_id, details)
  values (null, 'role.grant', 'user', v_user, jsonb_build_object('role', 'admin', 'via', 'bootstrap'));
  return jsonb_build_object('ok', true, 'userId', v_user);
end;
$$;

create or replace function pricele.revoke_admin(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  delete from public.user_roles where user_id = v_user and role = 'admin';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_admin'); end if;
  insert into public.admin_audit_log (admin_user_id, action, entity_type, entity_id, details)
  values (null, 'role.revoke', 'user', v_user, jsonb_build_object('role', 'admin', 'via', 'script'));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute privileges: everything in pricele is server-only, except the RLS helpers
-- granted to anon/authenticated in the previous migration. Bootstrap/revoke stay owner-only.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema pricele from public, anon, authenticated;
grant execute on all functions in schema pricele to pricele_app;
revoke execute on function pricele.bootstrap_admin(text, boolean) from pricele_app;
revoke execute on function pricele.revoke_admin(text) from pricele_app;
revoke execute on function pricele.handle_new_user() from pricele_app;
grant execute on function pricele.is_set_live(uuid) to anon, authenticated;
grant execute on function pricele.is_question_live(uuid) to anon, authenticated;
grant execute on function pricele.now() to anon, authenticated;
grant execute on function pricele.current_game_date() to anon, authenticated;
