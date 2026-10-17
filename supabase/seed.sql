-- DEVELOPMENT SEED — fictional, conspicuously labeled sample questions.
-- Every question is marked is_sample = true and shows a "Sample question" badge to players.
-- The businesses, products and sources are invented (example.com / example.org), so nothing
-- here is a real price reference. Answers are left UNVERIFIED: publishing requires an admin to
-- verify them through the dashboard (or the local-only `npm run demo:setup` script).
-- Idempotent: re-running does not duplicate rows (keyed by slug).

do $$
declare
  v_admin uuid := null;
  r record;
  v_qid uuid;
begin
  for r in
    select * from (values
      -- slug, difficulty, category slug, prompt, context, amount, definition, explanation
      ('sample-e1', 'easy', 'everyday-products', 'Sample: How much does a large oat-milk latte cost at the fictional Example Roasters café?', 'Menu price before tax at the fictional Example Roasters flagship.', 6.25, 'Menu price before tax (fictional)', 'Sample data: Example Roasters is invented for local development.'),
      ('sample-e2', 'easy', 'everyday-products', 'Sample: What is the shelf price of a 12-pack of AA batteries at the fictional Example Mart?', 'Regular shelf price, no promotions.', 14.99, 'Regular shelf price (fictional)', 'Sample data for local development only.'),
      ('sample-e3', 'easy', 'entertainment', 'Sample: How much is one adult evening ticket at the fictional Example Cinema?', 'Standard 2D screening, before online booking fees.', 15.50, 'Adult evening ticket price (fictional)', 'Sample data for local development only.'),
      ('sample-e4', 'easy', 'sports', 'Sample: How much does a youth soccer ball cost at the fictional Example Sports store?', 'Size 4 training ball, list price.', 24.00, 'List price (fictional)', 'Sample data for local development only.'),
      ('sample-e5', 'easy', 'technology', 'Sample: What does the fictional Example Phone charging cable cost at launch?', 'Two-meter cable, manufacturer list price.', 29.00, 'Manufacturer list price (fictional)', 'Sample data for local development only.'),
      ('sample-e6', 'easy', 'personal-finance', 'Sample: What is the monthly fee of the fictional Example Bank premium checking account?', 'Fee charged when the balance minimum is not met.', 12.00, 'Monthly account fee (fictional)', 'Sample data for local development only.'),
      ('sample-e7', 'easy', 'everyday-products', 'Sample: How much does a dozen free-range eggs cost at the fictional Example Grocer?', 'Regular price for a dozen large eggs.', 5.79, 'Regular shelf price (fictional)', 'Sample data for local development only.'),
      ('sample-e8', 'easy', 'luxury-goods', 'Sample: What does the fictional Example Atelier silk scarf cost?', 'Boutique list price for the 90 cm square scarf.', 450.00, 'Boutique list price (fictional)', 'Sample data for local development only.'),
      ('sample-e9', 'easy', 'entertainment', 'Sample: What is the monthly price of the fictional Example Stream ad-free plan?', 'Standard monthly plan, billed monthly.', 17.99, 'Monthly subscription price (fictional)', 'Sample data for local development only.'),

      ('sample-m1', 'medium', 'real-estate', 'Sample: For how much did the fictional three-bedroom house at 12 Example Lane sell?', 'Recorded sale price in the fictional Example County registry.', 612500.00, 'Recorded sale price (fictional)', 'Sample data for local development only.'),
      ('sample-m2', 'medium', 'sports', 'Sample: What is the total value of the fictional Example City Comets'' new stadium naming deal?', 'Total announced value over the full term.', 87000000.00, 'Total contract value (fictional)', 'Sample data for local development only.'),
      ('sample-m3', 'medium', 'entertainment', 'Sample: What was the reported production budget of the fictional film "Example Horizon"?', 'Reported production budget, excluding marketing.', 145000000.00, 'Production budget (fictional)', 'Sample data for local development only.'),
      ('sample-m4', 'medium', 'luxury-goods', 'Sample: How much did a fictional vintage Example Motors roadster sell for at auction?', 'Hammer price plus buyer''s premium.', 1320000.00, 'Auction sale price incl. premium (fictional)', 'Sample data for local development only.'),
      ('sample-m5', 'medium', 'science-and-infrastructure', 'Sample: What did the fictional Example River pedestrian bridge cost to build?', 'Final construction cost reported by the fictional city council.', 23400000.00, 'Construction cost (fictional)', 'Sample data for local development only.'),
      ('sample-m6', 'medium', 'technology', 'Sample: What is the list price of the fictional Example Labs 8K studio monitor?', 'Manufacturer list price at launch.', 4999.00, 'Manufacturer list price (fictional)', 'Sample data for local development only.'),
      ('sample-m7', 'medium', 'business-and-markets', 'Sample: How much did the fictional Example Foods raise in its Series B round?', 'Total announced round size.', 48000000.00, 'Funding round size (fictional)', 'Sample data for local development only.'),
      ('sample-m8', 'medium', 'world-news', 'Sample: What is the announced budget for the fictional Example Nation coastal flood program?', 'Total multi-year budget in USD.', 2700000000.00, 'Program budget in USD (fictional)', 'Sample data for local development only.'),
      ('sample-m9', 'medium', 'real-estate', 'Sample: What is the monthly rent of the fictional penthouse at Example Tower?', 'Advertised monthly rent.', 18500.00, 'Advertised monthly rent (fictional)', 'Sample data for local development only.'),

      ('sample-h1', 'hard', 'business-and-markets', 'Sample: What was the equity value of the fictional Example Corp acquisition of Sample Systems?', 'Equity value as announced; not enterprise value.', 7350000000.00, 'Announced equity value (fictional)', 'Sample data for local development only.'),
      ('sample-h2', 'hard', 'science-and-infrastructure', 'Sample: What was the total construction cost of the fictional Example Bay tunnel?', 'Final reported cost in USD, including overruns.', 11800000000.00, 'Total construction cost (fictional)', 'Sample data for local development only.'),
      ('sample-h3', 'hard', 'sports', 'Sample: What is the total value of the fictional striker transfer between Example United and Sample FC?', 'Base fee plus guaranteed add-ons, in USD.', 142000000.00, 'Transfer fee incl. guaranteed add-ons (fictional)', 'Sample data for local development only.'),
      ('sample-h4', 'hard', 'luxury-goods', 'Sample: How much did the fictional Example Blue diamond sell for at auction?', 'Final price including buyer''s premium.', 57600000.00, 'Auction sale price incl. premium (fictional)', 'Sample data for local development only.'),
      ('sample-h5', 'hard', 'technology', 'Sample: What was the fictional Example Cloud''s annual revenue in fiscal 2025?', 'Total reported revenue for the fiscal year.', 3460000000.00, 'Fiscal-year revenue (fictional)', 'Sample data for local development only.'),
      ('sample-h6', 'hard', 'entertainment', 'Sample: What was the worldwide box-office gross of the fictional "Example Quest II" in its first 30 days?', 'Worldwide gross over the first 30 days of release.', 812000000.00, '30-day worldwide gross (fictional)', 'Sample data for local development only.'),
      ('sample-h7', 'hard', 'world-news', 'Sample: How much did the fictional Example Republic pay for its new satellite network?', 'Contract value announced by the fictional ministry.', 4200000000.00, 'Contract value (fictional)', 'Sample data for local development only.'),
      ('sample-h8', 'hard', 'real-estate', 'Sample: For how much did the fictional Example Plaza office tower sell?', 'Recorded sale price in the fictional deed record.', 965000000.00, 'Recorded sale price (fictional)', 'Sample data for local development only.'),
      ('sample-h9', 'hard', 'personal-finance', 'Sample: What is the total endowment of the fictional Example University?', 'Endowment value at fiscal year end, in USD.', 28300000000.00, 'Endowment value at fiscal year end (fictional)', 'Sample data for local development only.')
    ) as t(slug, difficulty, cat, prompt, context, amount, definition, explanation)
  loop
    insert into public.questions (slug, prompt, context, difficulty, category_id, status, is_sample, created_by)
    values (r.slug, r.prompt, r.context, r.difficulty, (select id from public.categories where slug = r.cat), 'draft', true, v_admin)
    on conflict (slug) do nothing
    returning id into v_qid;

    if v_qid is not null then
      insert into public.question_answers (question_id, answer_amount, answer_definition, reference_date, explanation)
      values (v_qid, r.amount, r.definition, date '2026-01-01', r.explanation);
      insert into public.question_sources (question_id, title, publisher, source_url, supporting_excerpt, verification_notes)
      values (v_qid, 'Fictional sample record', 'Example (fictional sample data)', 'https://example.com/pricele-sample/' || r.slug,
              'Sample data: the amount is invented for local development.',
              'Not a real source. For development and automated testing only.');
    end if;
  end loop;
end
$$;
