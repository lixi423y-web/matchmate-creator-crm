-- Replace temporary shared-link access with one authenticated CRM boundary.
-- This migration changes grants and RLS policies only. It contains no data writes.
-- Review first, then run manually in the Supabase SQL Editor during the approved cutover.

begin;

do $$
declare
  table_name text;
  policy_name text;
  anon_role_oid oid := (select oid from pg_roles where rolname = 'anon');
begin
  foreach table_name in array array[
    'crm_users','creators','creator_accounts','creator_pets','creator_addresses',
    'outreach_records','campaigns','products','collaborations','collaboration_products',
    'deliverables','shipments','shipment_items','inventory_movements','publications',
    'assets','activity_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "crm shared link access" on public.%I', table_name);

    -- Remove any other policy that still targets anon or PUBLIC. This prevents a
    -- differently named legacy policy from restoring anonymous access later.
    for policy_name in
      select polname
      from pg_policy
      where polrelid = to_regclass('public.' || table_name)
        and (polroles @> array[anon_role_oid] or polroles @> array[0::oid])
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;

    execute format('drop policy if exists "crm authenticated access" on public.%I', table_name);
    execute format(
      'create policy "crm authenticated access" on public.%I for all to authenticated using (true) with check (true)',
      table_name
    );
  end loop;
end $$;

revoke select,insert,update,delete on public.crm_users,public.creators,public.creator_accounts,
  public.creator_pets,public.creator_addresses,public.outreach_records,public.campaigns,
  public.products,public.collaborations,public.collaboration_products,public.deliverables,
  public.shipments,public.shipment_items,public.inventory_movements,public.publications,
  public.assets,public.activity_logs from anon;

revoke select on public.creator_directory,public.collaboration_directory from anon;

grant select,insert,update,delete on public.crm_users,public.creators,public.creator_accounts,
  public.creator_pets,public.creator_addresses,public.outreach_records,public.campaigns,
  public.products,public.collaborations,public.collaboration_products,public.deliverables,
  public.shipments,public.shipment_items,public.inventory_movements,public.publications,
  public.assets,public.activity_logs to authenticated;

grant select on public.creator_directory,public.collaboration_directory to authenticated;

commit;
