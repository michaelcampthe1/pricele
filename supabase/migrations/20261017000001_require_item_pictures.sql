-- Every question must show a picture of the item being priced.
-- Pictures may be an https:// URL (licensed image) or an image bundled with the site under /items/.

alter table public.questions drop constraint if exists questions_image_url_check;
alter table public.questions add constraint questions_image_url_check check (
  image_url is null or (
    char_length(image_url) <= 500
    and (image_url ~ '^https://[^\s]+$' or image_url ~ '^/items/[a-z0-9-]+\.(svg|png|jpg|jpeg|webp)$')
  )
);

-- A picture and its description are now required before a question can be verified,
-- approved or published (publication re-checks question_problems).
create or replace function pricele.question_problems(p_question_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when q.image_url is null then 'Add a picture of the item' end,
    case when q.image_url is not null and char_length(coalesce(q.image_alt, '')) < 5
         then 'Describe the picture for screen readers (alt text)' end,
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

revoke all on function pricele.question_problems(uuid) from public, anon, authenticated;
grant execute on function pricele.question_problems(uuid) to pricele_app;
