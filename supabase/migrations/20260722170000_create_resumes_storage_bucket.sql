insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', true)
on conflict (id) do nothing;

create policy "Users can upload resumes to their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.candidates
      where candidates.user_id = auth.uid()
        and candidates.id::text = (storage.foldername(storage.objects.name))[2]
    )
  );

create policy "Users can view resumes for their own candidates"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and exists (
      select 1
      from public.candidates
      where candidates.user_id = auth.uid()
        and candidates.id::text = (storage.foldername(storage.objects.name))[2]
    )
  );

create policy "Users can update resumes for their own candidates"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'resumes'
    and exists (
      select 1
      from public.candidates
      where candidates.user_id = auth.uid()
        and candidates.id::text = (storage.foldername(storage.objects.name))[2]
    )
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.candidates
      where candidates.user_id = auth.uid()
        and candidates.id::text = (storage.foldername(storage.objects.name))[2]
    )
  );

create policy "Users can delete resumes for their own candidates"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and exists (
      select 1
      from public.candidates
      where candidates.user_id = auth.uid()
        and candidates.id::text = (storage.foldername(storage.objects.name))[2]
    )
  );
