create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  applied_position text not null check (length(trim(applied_position)) > 0),
  status text not null default 'applied' check (
    status in ('applied', 'screening', 'interview', 'offer', 'rejected', 'hired')
  ),
  resume_url text,
  created_at timestamptz not null default timezone('utc', now())
);

create index candidates_user_id_created_at_idx
  on public.candidates (user_id, created_at desc);

alter table public.candidates enable row level security;

create policy "Users can view their own candidates"
  on public.candidates
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own candidates"
  on public.candidates
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own candidates"
  on public.candidates
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own candidates"
  on public.candidates
  for delete
  to authenticated
  using (auth.uid() = user_id);
