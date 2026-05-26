-- Run this in your Supabase SQL editor

create table if not exists verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  claimed_height_inches integer not null,
  id_height_inches integer not null,
  verified_height_inches integer not null,
  status text not null default 'verified',
  verified_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(user_id)
);

alter table verifications enable row level security;

create policy "Users can read own verification"
  on verifications for select
  using (auth.uid() = user_id);

create policy "Users can insert own verification"
  on verifications for insert
  with check (auth.uid() = user_id);

create policy "Users can update own verification"
  on verifications for update
  using (auth.uid() = user_id);
