-- ============================================================================
-- Milestone 1.4 — Storage bucket for uploaded images (products + shop logo)
-- ADDITIVE-SAFE TO RUN: only creates a new storage bucket and its policies.
-- Does not touch any existing table or data.
-- Run this whole file once in the Supabase SQL Editor (select all, run).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects
  for select to anon using (bucket_id = 'media');

drop policy if exists "media anon insert" on storage.objects;
create policy "media anon insert" on storage.objects
  for insert to anon with check (bucket_id = 'media');

drop policy if exists "media anon update" on storage.objects;
create policy "media anon update" on storage.objects
  for update to anon using (bucket_id = 'media');

drop policy if exists "media anon delete" on storage.objects;
create policy "media anon delete" on storage.objects
  for delete to anon using (bucket_id = 'media');
