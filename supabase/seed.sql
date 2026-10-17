-- DEVELOPMENT-ONLY SEED. Runs on `supabase db reset` / first `supabase start` locally.
-- It is never applied by `supabase db push`, so it cannot reach production.
--
-- Contents: clearly labeled SAMPLE questions about FICTIONAL products and deals, with made-up
-- values, so the game is playable locally. They are NOT verified facts and are marked
-- unverified with no sources. Sample sets bypass the publication validator on purpose and are
-- flagged is_sample, which shows a "Sample content" banner in the game.
--
-- Repeatable and non-destructive: questions are keyed by slug, and a date that already has a
-- set is skipped.

do $$
declare
  easy text[][] := array[
    array['How much does the fictional "Brightside" 12-oz ceramic coffee mug cost at its maker''s online store?', '14.00'],
    array['What is the list price of the fictional "Pocket Pal" AAA flashlight?', '9.50'],
    array['How much does a single ticket cost at the fictional Maple Street Cinema on a weekday evening?', '12.75'],
    array['What does the fictional "Sunny Day" brand charge for a 1-gallon jug of orange juice?', '6.49'],
    array['How much is a one-month membership at the fictional Riverbend Community Gym?', '35.00'],
    array['What is the cover price of the fictional monthly magazine "Weekend Tinkerer"?', '7.99'],
    array['How much does the fictional "Trailhead" reusable water bottle sell for?', '24.00']
  ];
  medium text[][] := array[
    array['What did the fictional Harbor Town council budget to repave its main street?', '2400000.00'],
    array['What is the sticker price of the fictional "Volta Comet" compact electric car (base trim)?', '31500.00'],
    array['How much did the fictional indie film "Paper Lanterns" report as its production budget?', '850000.00'],
    array['What did a fictional collector pay for a first-edition "Starlight Comics #1" at the fictional Brightwater auction?', '126000.00'],
    array['What is the listed annual tuition at the fictional Lakeshore Culinary Institute?', '28750.00'],
    array['How much did the fictional Pinecrest Library spend on its new reading-room roof?', '415000.00'],
    array['What did the fictional "Hilltop" 3-bedroom house in the town of Elmwood sell for?', '389900.00']
  ];
  hard text[][] := array[
    array['What equity value did fictional Northwind Logistics announce for its acquisition of fictional Bluefin Freight?', '4200000000.00'],
    array['What was the total construction cost reported for the fictional Silver Arc suspension bridge?', '1650000000.00'],
    array['What was the reported total contract value for fictional pitcher Sam Okafor''s deal with the fictional Bay City Herons?', '212000000.00'],
    array['What did the fictional Aurora Satellite program report as its total development cost?', '780000000.00'],
    array['How much did the fictional film "Iron Meridian" gross worldwide at the box office in its theatrical run?', '1130000000.00'],
    array['What purchase price was announced when fictional Quartz Media sold its streaming unit to fictional Lumen Group?', '9800000000.00'],
    array['What was the reported sale price of the fictional "Crescent Tower" office building?', '565000000.00']
  ];
  v_today date := (now() at time zone 'America/New_York')::date;
  v_day integer;
  v_date date;
  v_set uuid;
  v_q uuid;
  v_cat uuid;
  v_pos integer;
  v_row text[];
  v_slug text;
  v_cats uuid[];
begin
  select array_agg(id order by name) into v_cats from public.categories;

  for v_day in 0..6 loop
    v_date := v_today - v_day;
    continue when exists (select 1 from public.daily_sets where game_date = v_date and status <> 'withdrawn');

    insert into public.daily_sets (game_date, status, is_sample, notes, published_at, went_live_at)
    values (v_date, 'published', true, 'SAMPLE development set', now(), now())
    returning id into v_set;

    for v_pos in 1..3 loop
      v_row := case v_pos when 1 then easy[v_day + 1:v_day + 1] when 2 then medium[v_day + 1:v_day + 1] else hard[v_day + 1:v_day + 1] end;
      v_slug := 'sample-' || v_date::text || '-' || v_pos;
      v_cat := v_cats[1 + ((v_day * 3 + v_pos) % array_length(v_cats, 1))];

      insert into public.questions (slug, prompt, context, difficulty, category_id, status, is_sample, published_at)
      values (
        v_slug,
        'SAMPLE: ' || v_row[1][1],
        'Development sample about a fictional item. The value is invented for testing.',
        (case v_pos when 1 then 'easy' when 2 then 'medium' else 'hard' end)::public.difficulty,
        v_cat, 'published', true, now()
      )
      on conflict (slug) do nothing
      returning id into v_q;
      continue when v_q is null;

      insert into public.question_answers (question_id, answer_amount, answer_definition, reference_period, explanation, verification_status, verification_notes)
      values (v_q, v_row[1][2]::numeric, 'Sample value (fictional)', 'Development sample',
        'This is invented sample content for local development. It is not a real price.',
        'unverified', 'Sample data: intentionally unverified, no sources.');

      insert into public.daily_set_questions (daily_set_id, question_id, position) values (v_set, v_q, v_pos);
    end loop;
  end loop;
end;
$$;
