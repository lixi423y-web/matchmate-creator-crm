-- Run only after v2 is verified and the v1 GitHub Pages deployment is retired.
-- This removes anonymous access from the legacy creators/round/assets tables.
alter table public.creators enable row level security;
drop policy if exists "crm anon read creators" on public.creators;
drop policy if exists "crm anon insert creators" on public.creators;
drop policy if exists "crm anon update creators" on public.creators;
drop policy if exists "crm anon delete creators" on public.creators;
drop policy if exists "Enable read access for all users" on public.creators;
drop policy if exists "Enable insert for all users" on public.creators;
drop policy if exists "Enable update for all users" on public.creators;
drop policy if exists "Enable delete for all users" on public.creators;
drop policy if exists "crm authenticated access" on public.creators;
create policy "crm authenticated access" on public.creators for all to authenticated using (true) with check (true);
grant select,insert,update,delete on public.creators to authenticated;
revoke all on public.creators from anon;

do $$ declare table_name text; policy_name text;
begin
  foreach table_name in array array['collaboration_rounds','creator_assets'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('alter table public.%I enable row level security',table_name);
      execute format('drop policy if exists "crm authenticated legacy access" on public.%I',table_name);
      execute format('create policy "crm authenticated legacy access" on public.%I for all to authenticated using (true) with check (true)',table_name);
      execute format('grant select,insert,update,delete on public.%I to authenticated',table_name);
      for policy_name in select polname from pg_policy where polrelid=to_regclass('public.'||table_name) and polroles @> array[(select oid from pg_roles where rolname='anon')] loop
        execute format('drop policy if exists %I on public.%I',policy_name,table_name);
      end loop;
      execute format('revoke all on public.%I from anon',table_name);
    end if;
  end loop;
end $$;
