-- Pricele core schema
-- All monetary amounts are NUMERIC(20,2): up to 18 integer digits, exact cents.
-- Upper bound for any amount (guess or answer): 1,000,000,000,000,000 (one quadrillion USD).
-- All timestamps are timestamptz (stored UTC). Game dates are America/New_York calendar dates.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Private schema for privileged functions. It is NOT exposed through the Supabase Data API.
create schema if not exists pricele;
revoke all on schema pricele from public;

-- Least-privilege login role used by the Next.js server (DATABASE_URL).
-- It can only EXECUTE functions in the pricele schema; it has no direct table privileges.
-- Its password is set out-of-band (see README), never in a migration.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pricele_app') then
    create role pricele_app login noinherit nosuperuser nocreatedb nocreaterole;
  end if;
end
$$;
grant usage on schema pricele to pricele_app;

-- ---------------------------------------------------------------------------
-- Shared trigger helper
-- ---------------------------------------------------------------------------
create or replace function pricele.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Normalized: lowercase letters, digits, underscore; 3-20 chars; must start with a letter.
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  avatar_url text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function pricele.touch_updated_at();

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);

create table public.user_moderation (
  user_id uuid primary key references auth.users (id) on delete cascade,
  suspended_at timestamptz,
  reason text check (reason is null or char_length(reason) <= 500),
  suspended_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger user_moderation_touch before update on public.user_moderation
  for each row execute function pricele.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Questions, answer keys, sources
-- ---------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  slug text unique check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  prompt text not null check (char_length(prompt) between 10 and 300),
  context text check (context is null or char_length(context) <= 600),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  category_id uuid not null references public.categories (id),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 500)),
  image_alt text check (image_alt is null or char_length(image_alt) <= 200),
  image_credit text check (image_credit is null or char_length(image_credit) <= 200),
  -- draft -> approved -> published (when its daily set is published); archived = retired unused draft.
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'archived')),
  is_sample boolean not null default false, -- conspicuously labeled development data
  normalized_prompt text generated always as (
    lower(btrim(regexp_replace(regexp_replace(prompt, '[^A-Za-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')))
  ) stored,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('approved', 'published')) = (approved_at is not null) or status = 'archived')
);
create trigger questions_touch before update on public.questions
  for each row execute function pricele.touch_updated_at();

create table public.question_answers (
  question_id uuid primary key references public.questions (id) on delete cascade,
  answer_amount numeric(20, 2) not null check (answer_amount > 0 and answer_amount <= 1000000000000000),
  currency text not null default 'USD' check (currency = 'USD'),
  -- Exactly what the number measures, e.g. "Equity value of the announced acquisition".
  answer_definition text not null check (char_length(answer_definition) between 5 and 300),
  reference_date date,
  reference_period text check (reference_period is null or char_length(reference_period) <= 120),
  explanation text not null default '' check (char_length(explanation) <= 1200),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'needs_review')),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((verification_status = 'verified') = (verified_at is not null))
);
create trigger question_answers_touch before update on public.question_answers
  for each row execute function pricele.touch_updated_at();

create table public.question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 300),
  publisher text not null check (char_length(publisher) between 2 and 160),
  source_url text not null check (source_url ~ '^https?://[^\s]+$' and char_length(source_url) <= 1000),
  published_at date,
  reference_date date,
  supporting_excerpt text check (supporting_excerpt is null or char_length(supporting_excerpt) <= 1200),
  verification_notes text check (verification_notes is null or char_length(verification_notes) <= 1200),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Daily sets
-- ---------------------------------------------------------------------------
create table public.daily_sets (
  id uuid primary key default gen_random_uuid(),
  game_date date not null unique,
  -- draft: being assembled. scheduled: validated & published for a future date.
  -- published: validated and live (game_date <= today). withdrawn: retired before anyone played.
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'withdrawn')),
  version integer not null default 0,
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('scheduled', 'published')) = (published_at is not null) or status = 'withdrawn')
);
create trigger daily_sets_touch before update on public.daily_sets
  for each row execute function pricele.touch_updated_at();

create table public.daily_set_questions (
  daily_set_id uuid not null references public.daily_sets (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  position smallint not null check (position in (1, 2, 3)),
  created_at timestamptz not null default now(),
  primary key (daily_set_id, position),
  unique (daily_set_id, question_id),
  -- A question can only ever appear in one daily set, so history can't be reused as "new".
  unique (question_id)
);

-- ---------------------------------------------------------------------------
-- Guest sessions
-- ---------------------------------------------------------------------------
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique check (octet_length(token_hash) = 32), -- SHA-256 of the cookie token
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

-- ---------------------------------------------------------------------------
-- Attempts and results
-- ---------------------------------------------------------------------------
create table public.official_attempts (
  id uuid primary key default gen_random_uuid(),
  daily_set_id uuid not null,
  question_id uuid not null,
  user_id uuid references auth.users (id) on delete cascade,
  guest_session_id uuid references public.guest_sessions (id) on delete cascade,
  guess_amount numeric(20, 2) not null check (guess_amount > 0 and guess_amount <= 1000000000000000),
  answer_snapshot numeric(20, 2) not null check (answer_snapshot > 0),
  score integer not null check (score between 0 and 1000),
  absolute_percentage_error numeric not null check (absolute_percentage_error >= 0),
  scoring_version text not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  claimed_from_guest_session_id uuid references public.guest_sessions (id) on delete set null,
  check (num_nonnulls(user_id, guest_session_id) = 1),
  foreign key (daily_set_id, question_id)
    references public.daily_set_questions (daily_set_id, question_id) on delete restrict
);
-- One official attempt per question per player / guest session.
create unique index official_attempts_user_question_uniq
  on public.official_attempts (user_id, question_id) where user_id is not null;
create unique index official_attempts_guest_question_uniq
  on public.official_attempts (guest_session_id, question_id) where guest_session_id is not null;

create table public.daily_results (
  id uuid primary key default gen_random_uuid(),
  daily_set_id uuid not null references public.daily_sets (id) on delete restrict,
  game_date date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  total_score integer not null check (total_score between 0 and 3000),
  easy_score integer not null check (easy_score between 0 and 1000),
  medium_score integer not null check (medium_score between 0 and 1000),
  hard_score integer not null check (hard_score between 0 and 1000),
  perfect_guess_count integer not null check (perfect_guess_count between 0 and 3),
  completed_at timestamptz not null, -- timestamp of the final required official submission
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_set_id, user_id),
  check (total_score = easy_score + medium_score + hard_score)
);
create trigger daily_results_touch before update on public.daily_results
  for each row execute function pricele.touch_updated_at();

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  daily_set_id uuid not null,
  question_id uuid not null,
  user_id uuid references auth.users (id) on delete cascade,
  guest_session_id uuid references public.guest_sessions (id) on delete cascade,
  guess_amount numeric(20, 2) not null check (guess_amount > 0 and guess_amount <= 1000000000000000),
  answer_snapshot numeric(20, 2) not null check (answer_snapshot > 0),
  score integer not null check (score between 0 and 1000),
  absolute_percentage_error numeric not null check (absolute_percentage_error >= 0),
  scoring_version text not null,
  submitted_at timestamptz not null default now(),
  check (num_nonnulls(user_id, guest_session_id) = 1),
  foreign key (daily_set_id, question_id)
    references public.daily_set_questions (daily_set_id, question_id) on delete restrict
);
create unique index practice_attempts_user_question_uniq
  on public.practice_attempts (user_id, question_id) where user_id is not null;
create unique index practice_attempts_guest_question_uniq
  on public.practice_attempts (guest_session_id, question_id) where guest_session_id is not null;

-- ---------------------------------------------------------------------------
-- Corrections, reports, audit
-- ---------------------------------------------------------------------------
create table public.question_corrections (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete restrict,
  old_answer numeric(20, 2) not null,
  new_answer numeric(20, 2) not null check (new_answer > 0 and new_answer <= 1000000000000000),
  reason text not null check (char_length(reason) between 10 and 1000),
  source_url text not null check (source_url ~ '^https?://[^\s]+$'),
  admin_user_id uuid references auth.users (id) on delete set null,
  affected_official_attempts integer not null default 0,
  affected_practice_attempts integer not null default 0,
  status text not null default 'applied' check (status in ('applied')),
  created_at timestamptz not null default now(),
  check (old_answer <> new_answer)
);

create table public.official_attempt_revisions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.official_attempts (id) on delete cascade,
  correction_id uuid not null references public.question_corrections (id) on delete restrict,
  old_answer_snapshot numeric(20, 2) not null,
  old_score integer not null,
  old_absolute_percentage_error numeric not null,
  old_scoring_version text not null,
  new_answer_snapshot numeric(20, 2) not null,
  new_score integer not null,
  new_absolute_percentage_error numeric not null,
  created_at timestamptz not null default now()
);

create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  guest_session_id uuid references public.guest_sessions (id) on delete set null,
  message text not null check (char_length(message) between 5 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z_.]+$'),
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Shared, database-backed fixed-window rate limiter (works across serverless instances).
create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index daily_sets_status_date_idx on public.daily_sets (status, game_date desc);
create index daily_set_questions_question_idx on public.daily_set_questions (question_id);
create index questions_status_difficulty_idx on public.questions (status, difficulty, category_id);
create index questions_category_idx on public.questions (category_id);
create index questions_normalized_prompt_trgm on public.questions
  using gin (normalized_prompt extensions.gin_trgm_ops);
create index question_sources_question_idx on public.question_sources (question_id);
create index question_sources_url_idx on public.question_sources (lower(source_url));
create index official_attempts_user_set_idx on public.official_attempts (user_id, daily_set_id) where user_id is not null;
create index official_attempts_guest_set_idx on public.official_attempts (guest_session_id, daily_set_id) where guest_session_id is not null;
create index official_attempts_question_idx on public.official_attempts (question_id);
create index official_attempts_submitted_idx on public.official_attempts (submitted_at);
create index daily_results_user_date_idx on public.daily_results (user_id, game_date desc);
create index daily_results_leaderboard_idx on public.daily_results
  (game_date, total_score desc, perfect_guess_count desc, hard_score desc, completed_at asc);
create index daily_results_date_user_idx on public.daily_results (game_date, user_id);
create index practice_attempts_user_set_idx on public.practice_attempts (user_id, daily_set_id) where user_id is not null;
create index practice_attempts_guest_set_idx on public.practice_attempts (guest_session_id, daily_set_id) where guest_session_id is not null;
create index guest_sessions_expires_idx on public.guest_sessions (expires_at);
create index question_corrections_question_idx on public.question_corrections (question_id, created_at);
create index question_reports_status_idx on public.question_reports (status, created_at desc);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- Required categories
-- ---------------------------------------------------------------------------
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
