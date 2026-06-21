create extension if not exists pgcrypto;

create table if not exists public.research_evaluations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  practitioner_id text not null,
  beneficiary_pseudonym text not null,
  age_months integer,
  profile_tags jsonb not null default '[]'::jsonb,
  setting text,
  evaluation_number integer not null,
  evaluation_date date,
  scores_json jsonb not null default '{}'::jsonb,
  goals_json jsonb not null default '[]'::jsonb,
  consent_confirmed boolean not null default false,
  app_version text
);

create index if not exists research_evaluations_practitioner_idx
  on public.research_evaluations (practitioner_id);

create index if not exists research_evaluations_beneficiary_idx
  on public.research_evaluations (beneficiary_pseudonym);

create index if not exists research_evaluations_created_at_idx
  on public.research_evaluations (created_at);

alter table public.research_evaluations enable row level security;

drop policy if exists "research_evaluations_public_insert" on public.research_evaluations;

create policy "research_evaluations_public_insert"
  on public.research_evaluations
  for insert
  to anon
  with check (
    consent_confirmed = true
    and practitioner_id <> ''
    and beneficiary_pseudonym <> ''
  );
