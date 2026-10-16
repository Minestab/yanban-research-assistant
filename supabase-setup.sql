-- Run in the Supabase SQL Editor for the site's project. Client keys are publishable only.
create table if not exists public.yanban_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 1,
 entries jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.yanban_workspaces enable row level security;
drop policy if exists yanban_owner_read on public.yanban_workspaces;
create policy yanban_owner_read on public.yanban_workspaces for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.yanban_workspaces from anon, authenticated;
grant select on public.yanban_workspaces to authenticated;
create or replace function public.yanban_save_workspace(expected_revision bigint,new_entries jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); new_revision bigint;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if jsonb_typeof(new_entries)<>'object' or octet_length(new_entries::text)>25000000 then raise exception 'invalid_workspace'; end if;
 if expected_revision=0 then
  insert into public.yanban_workspaces(user_id,revision,entries) values(uid,1,new_entries)
  on conflict do nothing returning revision into new_revision;
 else
  update public.yanban_workspaces set revision=revision+1,entries=new_entries,updated_at=now()
  where user_id=uid and revision=expected_revision returning revision into new_revision;
 end if;
 if new_revision is null then raise exception 'revision_conflict'; end if;
 return new_revision;
end; $$;
revoke all on function public.yanban_save_workspace(bigint,jsonb) from public,anon;
grant execute on function public.yanban_save_workspace(bigint,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('yanban-papers','yanban-papers',false,20971520,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf'];
drop policy if exists yanban_pdf_read on storage.objects;
create policy yanban_pdf_read on storage.objects for select to authenticated
using(bucket_id='yanban-papers' and (storage.foldername(name))[1]=(select auth.uid()::text));
drop policy if exists yanban_pdf_insert on storage.objects;
create policy yanban_pdf_insert on storage.objects for insert to authenticated
with check(bucket_id='yanban-papers' and (storage.foldername(name))[1]=(select auth.uid()::text));
