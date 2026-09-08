-- CRM owners are assignment labels, not login identities.
-- Approved scope: preserve existing owners and assignments; add zuowei zhang.
-- No Auth users, grants or RLS policies are changed.
-- Run only after verifying the live shared-account RLS boundary.
begin;

-- Preserve the primary key and every inbound owner/actor foreign key.
alter table public.crm_users
  drop constraint if exists crm_users_id_fkey;
alter table public.crm_users
  alter column id set default gen_random_uuid();

insert into public.crm_users (display_name)
select 'zuowei zhang'
where not exists (
  select 1 from public.crm_users
  where lower(btrim(display_name)) = 'zuowei zhang'
);

commit;

-- Verify: existing owner IDs/assignments unchanged; new owner visible after reload.
-- Rollback caution: do not restore the Auth foreign key while independent owners
-- exist. Keep their IDs for historical assignments; archive instead of deleting.
