-- Temporary shared-link mode requested for the initial team rollout.
-- Anyone with the site URL can read and edit CRM data through the publishable key.
do $$ declare table_name text;
begin
  foreach table_name in array array[
    'crm_users','creators','creator_accounts','creator_pets','creator_addresses',
    'outreach_records','campaigns','products','collaborations','collaboration_products',
    'deliverables','shipments','shipment_items','inventory_movements','publications',
    'assets','activity_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "crm shared link access" on public.%I', table_name);
    execute format('create policy "crm shared link access" on public.%I for all to anon using (true) with check (true)', table_name);
  end loop;
end $$;

grant select,insert,update,delete on public.crm_users,public.creators,public.creator_accounts,
  public.creator_pets,public.creator_addresses,public.outreach_records,public.campaigns,
  public.products,public.collaborations,public.collaboration_products,public.deliverables,
  public.shipments,public.shipment_items,public.inventory_movements,public.publications,
  public.assets,public.activity_logs to anon;
grant select on public.creator_directory,public.collaboration_directory to anon;
