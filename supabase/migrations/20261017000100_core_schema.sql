-- Pricele core schema
--
-- Conventions
--   * Money is stored as numeric(18,2): exact decimal, max 9,999,999,999,999,999.99.
--     Application bounds are stricter: 0.01 <= amount <= 1,000,000,000,000,000 (one quadrillion).
--   * All timestamps are timestamptz (UTC). Game dates are `date` values in the
--     America/New_York calendar, derived with private.current_game_date().
--   * Confidential data (answer keys, sources, guest sessions, roles, audit logs) is never
--     readable through the public API roles. Privileged work goes through SECURITY DEFINER
--     functions that only `service_role` may execute.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.difficulty as enum ('easy', 'medium', 'hard');
create type public.question_status as enum ('draft', 'approved', 'published', 'withdrawn', 'archived');
create type public.verification_status as enum ('unverified', 'verified', 'rejected');
create type public.daily_set_status as enum ('draft', 'scheduled', 'published', 'withdrawn');
create type public.app_role as enum ('admin');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.current_game_date()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/New_York')::date
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Positions are fixed: 1 = easy, 2 = medium, 3 = hard.
create or replace function private.position_difficulty(p_position smallint)
returns public.difficulty
language sql
immutable
set search_path = ''
as $$
  select (case p_position when 1 then 'easy' when 2 then 'medium' when 3 then 'hard' end)::public.difficulty
$$;

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  avatar_url text,
  is_public boolean not null default true,
  username_confirmed boolean not null default false,
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 40),
  constraint profiles_avatar_url_format check (avatar_url is null or (avatar_url ~ '^https://[^\s]+$' and char_length(avatar_url) <= 500))
);
create unique index profiles_username_key on public.profiles (username);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);

create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r where r.user_id = p_user_id and r.role = 'admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Questions, answer keys, sources
-- ---------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  slug text unique check (slug is null or slug ~ '^[a-z0-9-]{3,80}$'),
  prompt text not null check (char_length(prompt) between 10 and 300),
  context text check (context is null or char_length(context) <= 600),
  difficulty public.difficulty not null,
  category_id uuid references public.categories (id) on delete restrict,
  status public.question_status not null default 'draft',
  image_url text check (image_url is null or (image_url ~ '^https://[^\s]+$' and char_length(image_url) <= 500)),
  image_alt text check (image_alt is null or char_length(image_alt) <= 200),
  image_credit text check (image_credit is null or char_length(image_credit) <= 200),
  -- Public correction notice displayed with the answer after a verified correction.
  correction_note text,
  corrected_at timestamptz,
  is_sample boolean not null default false,
  ai_assisted boolean not null default false,
  prompt_normalized text generated always as (
    trim(regexp_replace(lower(prompt), '[^a-z0-9]+', ' ', 'g'))
  ) stored,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_status_difficulty_idx on public.questions (status, difficulty);
create index questions_category_idx on public.questions (category_id);
create index questions_prompt_trgm_idx on public.questions using gin (prompt_normalized extensions.gin_trgm_ops);
create trigger questions_updated_at before update on public.questions
  for each row execute function private.set_updated_at();

create table public.question_answers (
  question_id uuid primary key references public.questions (id) on delete cascade,
  answer_amount numeric(18, 2) check (answer_amount is null or (answer_amount > 0 and answer_amount <= 1000000000000000)),
  currency text not null default 'USD' check (currency = 'USD'),
  answer_definition text check (answer_definition is null or char_length(answer_definition) <= 300),
  reference_date date,
  reference_period text check (reference_period is null or char_length(reference_period) <= 120),
  explanation text check (explanation is null or char_length(explanation) <= 1200),
  verification_status public.verification_status not null default 'unverified',
  verification_notes text check (verification_notes is null or char_length(verification_notes) <= 2000),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger question_answers_updated_at before update on public.question_answers
  for each row execute function private.set_updated_at();

create table public.question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 300),
  publisher text not null check (char_length(publisher) between 2 and 160),
  source_url text not null check (source_url ~ '^https?://[^\s]+$' and char_length(source_url) <= 1000),
  published_at timestamptz,
  reference_date date,
  supporting_excerpt text check (supporting_excerpt is null or char_length(supporting_excerpt) <= 2000),
  verification_notes text check (verification_notes is null or char_length(verification_notes) <= 2000),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index question_sources_question_idx on public.question_sources (question_id);
create index question_sources_url_idx on public.question_sources (source_url);

-- ---------------------------------------------------------------------------
-- Daily sets
-- ---------------------------------------------------------------------------
create table public.daily_sets (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  status public.daily_set_status not null default 'draft',
  is_sample boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 1000),
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  went_live_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One active (non-withdrawn) set per Eastern Time game date.
create unique index daily_sets_game_date_active_key on public.daily_sets (game_date) where status <> 'withdrawn';
create index daily_sets_status_date_idx on public.daily_sets (status, game_date desc);
create trigger daily_sets_updated_at before update on public.daily_sets
  for each row execute function private.set_updated_at();

create table public.daily_set_questions (
  daily_set_id uuid not null references public.daily_sets (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (daily_set_id, position),
  -- A question may only ever appear in one daily set: archives stay unambiguous.
  constraint daily_set_questions_question_key unique (question_id),
  constraint daily_set_questions_set_question_key unique (daily_set_id, question_id)
);

-- A set is "live" (playable / visible) when it is scheduled or published and its date has arrived.
create or replace function private.is_set_live(p_daily_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.daily_sets s
    where s.id = p_daily_set_id
      and s.status in ('scheduled', 'published')
      and s.game_date <= private.current_game_date()
  )
$$;

create or replace function private.is_question_live(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.daily_set_questions dsq
    join public.daily_sets s on s.id = dsq.daily_set_id
    where dsq.question_id = p_question_id
      and s.status in ('scheduled', 'published')
      and s.game_date <= private.current_game_date()
  )
$$;

-- ---------------------------------------------------------------------------
-- Guest sessions (server-issued; only a SHA-256 hash of the token is stored)
-- ---------------------------------------------------------------------------
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz
);
create index guest_sessions_expires_idx on public.guest_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Official attempts
-- ---------------------------------------------------------------------------
create table public.official_attempts (
  id uuid primary key default gen_random_uuid(),
  daily_set_id uuid not null references public.daily_sets (id) on delete restrict,
  question_id uuid not null references public.questions (id) on delete restrict,
  position smallint not null check (position between 1 and 3),
  user_id uuid references auth.users (id) on delete cascade,
  guest_session_id uuid references public.guest_sessions (id) on delete cascade,
  claimed_from_guest_session_id uuid references public.guest_sessions (id) on delete set null,
  guess_amount numeric(18, 2) not null check (guess_amount > 0 and guess_amount <= 1000000000000000),
  answer_snapshot numeric(18, 2) not null check (answer_snapshot > 0),
  score integer not null check (score between 0 and 1000),
  absolute_percentage_error numeric not null check (absolute_percentage_error >= 0),
  scoring_version text not null,
  voided boolean not null default false,
  original_score integer check (original_score is null or original_score between 0 and 1000),
  original_answer_snapshot numeric(18, 2),
  corrected_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint official_attempts_one_owner check (num_nonnulls(user_id, guest_session_id) = 1),
  constraint official_attempts_question_in_set foreign key (daily_set_id, question_id)
    references public.daily_set_questions (daily_set_id, question_id) on delete restrict
);
create unique index official_attempts_user_question_key on public.official_attempts (user_id, question_id) where user_id is not null;
create unique index official_attempts_guest_question_key on public.official_attempts (guest_session_id, question_id) where guest_session_id is not null;
create index official_attempts_user_set_idx on public.official_attempts (user_id, daily_set_id);
create index official_attempts_guest_set_idx on public.official_attempts (guest_session_id, daily_set_id);
create index official_attempts_question_idx on public.official_attempts (question_id);
create index official_attempts_submitted_idx on public.official_attempts (submitted_at);

-- ---------------------------------------------------------------------------
-- Daily results (authenticated, completed official games only)
-- ---------------------------------------------------------------------------
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
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_results_set_user_key unique (daily_set_id, user_id)
);
create index daily_results_user_date_idx on public.daily_results (user_id, game_date desc);
create index daily_results_leaderboard_idx on public.daily_results
  (game_date, total_score desc, perfect_guess_count desc, hard_score desc, completed_at);
create trigger daily_results_updated_at before update on public.daily_results
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Practice attempts (archive play; never part of official aggregates)
-- ---------------------------------------------------------------------------
create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  daily_set_id uuid not null references public.daily_sets (id) on delete restrict,
  question_id uuid not null references public.questions (id) on delete restrict,
  user_id uuid references auth.users (id) on delete cascade,
  guest_session_id uuid references public.guest_sessions (id) on delete cascade,
  guess_amount numeric(18, 2) not null check (guess_amount > 0 and guess_amount <= 1000000000000000),
  answer_snapshot numeric(18, 2) not null check (answer_snapshot > 0),
  score integer not null check (score between 0 and 1000),
  absolute_percentage_error numeric not null check (absolute_percentage_error >= 0),
  scoring_version text not null,
  submitted_at timestamptz not null default now(),
  constraint practice_attempts_one_owner check (num_nonnulls(user_id, guest_session_id) = 1),
  constraint practice_attempts_question_in_set foreign key (daily_set_id, question_id)
    references public.daily_set_questions (daily_set_id, question_id) on delete restrict
);
create unique index practice_attempts_user_question_key on public.practice_attempts (user_id, question_id) where user_id is not null;
create unique index practice_attempts_guest_question_key on public.practice_attempts (guest_session_id, question_id) where guest_session_id is not null;
create index practice_attempts_user_set_idx on public.practice_attempts (user_id, daily_set_id);
create index practice_attempts_guest_set_idx on public.practice_attempts (guest_session_id, daily_set_id);

-- ---------------------------------------------------------------------------
-- Corrections, audit log, feedback, rate limits
-- ---------------------------------------------------------------------------
create table public.question_corrections (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete restrict,
  kind text not null check (kind in ('answer_correction', 'withdrawal')),
  old_answer numeric(18, 2),
  new_answer numeric(18, 2),
  reason text not null check (char_length(reason) between 5 and 2000),
  source_url text check (source_url is null or source_url ~ '^https?://[^\s]+$'),
  admin_user_id uuid references auth.users (id) on delete set null,
  affected_attempts integer not null default 0,
  status text not null default 'applied' check (status in ('applied')),
  created_at timestamptz not null default now()
);
create index question_corrections_question_idx on public.question_corrections (question_id, created_at desc);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 2 and 80),
  entity_type text not null check (char_length(entity_type) between 2 and 60),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_entity_idx on public.admin_audit_log (entity_type, entity_id);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  message text not null check (char_length(message) between 5 and 2000),
  contact text check (contact is null or char_length(contact) <= 200),
  status text not null default 'new' check (status in ('new', 'reviewed')),
  created_at timestamptz not null default now()
);
create index feedback_created_idx on public.feedback (created_at desc);

create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);
