-- Matchmate Creator CRM v2: additive schema only.
-- Review in a non-production Supabase branch/project before running in production.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = timezone('utc', now()); return new; end $$;

create table if not exists public.crm_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz
);

create or replace function public.handle_new_crm_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.crm_users(id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Team member'), new.email)
  on conflict(id) do update set email=excluded.email, updated_at=timezone('utc', now());
  return new;
end $$;
drop trigger if exists on_auth_user_created_create_crm_user on auth.users;
create trigger on_auth_user_created_create_crm_user after insert or update of email on auth.users
for each row execute function public.handle_new_crm_user();
insert into public.crm_users(id,display_name,email)
select id,coalesce(raw_user_meta_data->>'display_name',split_part(email,'@',1),'Team member'),email from auth.users
on conflict(id) do nothing;

alter table if exists public.creators
  add column if not exists creator_code text,
  add column if not exists display_name text,
  add column if not exists legal_name text,
  add column if not exists nickname text,
  add column if not exists timezone text,
  add column if not exists languages text[] not null default '{}',
  add column if not exists preferred_contact_method text,
  add column if not exists contact_phone text,
  add column if not exists preferred_channel text,
  add column if not exists relationship_status text not null default 'New',
  add column if not exists fit_notes text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists owner_id uuid references public.crm_users(id),
  add column if not exists created_by uuid references public.crm_users(id),
  add column if not exists archived_at timestamptz;

create unique index if not exists creators_creator_code_key on public.creators(creator_code) where creator_code is not null;
create index if not exists creators_updated_at_idx on public.creators(updated_at desc);
create index if not exists creators_owner_idx on public.creators(owner_id) where archived_at is null;
create index if not exists creators_fit_idx on public.creators(fit_verdict) where archived_at is null;
create index if not exists creators_tier_idx on public.creators(tier) where archived_at is null;
create index if not exists creators_account_type_idx on public.creators(account_type) where archived_at is null;
create index if not exists creators_dog_size_idx on public.creators(dog_size) where archived_at is null;
create index if not exists creators_tags_gin_idx on public.creators using gin(tags);

create table if not exists public.creator_accounts (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id) on delete cascade,
  platform text not null, handle text not null, profile_url text, followers integer, engagement_rate numeric(8,4),
  is_primary boolean not null default false, link_status text, last_verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz,
  unique(platform, handle)
);
create index if not exists creator_accounts_creator_idx on public.creator_accounts(creator_id) where archived_at is null;
create index if not exists creator_accounts_handle_idx on public.creator_accounts(platform, lower(handle));

create table if not exists public.creator_pets (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id) on delete cascade,
  name text, breed text, size text, neck_size_cm numeric(8,2), weight_kg numeric(8,2), fit_notes text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz
);
create index if not exists creator_pets_creator_idx on public.creator_pets(creator_id) where archived_at is null;

create table if not exists public.creator_addresses (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id) on delete cascade,
  label text, recipient_name text, full_address text not null, phone text, country text, is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz
);
create index if not exists creator_addresses_creator_idx on public.creator_addresses(creator_id) where archived_at is null;

create table if not exists public.outreach_records (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id) on delete cascade,
  status text not null default 'Not Contacted', channel text, last_contact_at timestamptz, next_follow_up_at timestamptz,
  notes text, message_summary text, conversation_url text, converted_collaboration_id uuid,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz,
  constraint outreach_status_check check(status in ('Not Contacted','Contacted','Awaiting Reply','Follow-up Due','Replied','Negotiating','Declined','No Response','Paused','Converted'))
);
create index if not exists outreach_creator_idx on public.outreach_records(creator_id, updated_at desc) where archived_at is null;
create index if not exists outreach_status_followup_idx on public.outreach_records(status, next_follow_up_at) where archived_at is null;
create index if not exists outreach_owner_idx on public.outreach_records(owner_id, status) where archived_at is null;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(), name text not null, code text unique, status text not null default 'Active',
  objective text, start_date date, end_date date, budget numeric(12,2), notes text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), sku text not null unique, name text not null, category text,
  active boolean not null default true, inventory_quantity integer, reserved_quantity integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz
);

create table if not exists public.collaborations (
  id uuid primary key default gen_random_uuid(), collaboration_code text unique, creator_id uuid not null references public.creators(id),
  campaign_id uuid references public.campaigns(id), collaboration_name text, type text not null default 'Seeding',
  stage text not null default 'Confirmed — Awaiting Details', start_date date, due_date date, completed_at timestamptz,
  rights_status text not null default 'Not Discussed', payment_status text not null default 'Gifted', approved_budget numeric(12,2),
  is_repeat boolean not null default false, notes text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz,
  constraint collaboration_stage_check check(stage in ('Confirmed — Awaiting Details','Ready to Fulfill','In Fulfillment','Delivered','Content in Progress','Published','Completed','Closed'))
);
alter table public.outreach_records drop constraint if exists outreach_records_converted_collaboration_id_fkey;
alter table public.outreach_records add constraint outreach_records_converted_collaboration_id_fkey foreign key(converted_collaboration_id) references public.collaborations(id);
create index if not exists collaborations_creator_idx on public.collaborations(creator_id, created_at desc) where archived_at is null;
create index if not exists collaborations_stage_idx on public.collaborations(stage, due_date) where archived_at is null;
create index if not exists collaborations_campaign_idx on public.collaborations(campaign_id) where archived_at is null;
create index if not exists collaborations_owner_idx on public.collaborations(owner_id, stage) where archived_at is null;

create table if not exists public.collaboration_products (
  id uuid primary key default gen_random_uuid(), collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  product_id uuid not null references public.products(id), quantity integer not null default 1 check(quantity > 0), is_primary boolean not null default false,
  notes text, created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz,
  unique(collaboration_id, product_id)
);
create index if not exists collaboration_products_collab_idx on public.collaboration_products(collaboration_id) where archived_at is null;
create index if not exists collaboration_products_product_idx on public.collaboration_products(product_id) where archived_at is null;

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(), collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  type text not null, platform text, quantity integer not null default 1, status text not null default 'Pending', due_at timestamptz,
  brief_url text, notes text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz,
  constraint deliverable_status_check check(status in ('Pending','Draft Received','Revision Requested','Approved','Published','Cancelled'))
);
create index if not exists deliverables_collab_idx on public.deliverables(collaboration_id) where archived_at is null;
create index if not exists deliverables_status_due_idx on public.deliverables(status, due_at) where archived_at is null;

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(), shipment_code text unique, collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  status text not null default 'Draft', carrier text, service_level text, tracking_number text, tracking_url text,
  address_id uuid references public.creator_addresses(id), address_snapshot jsonb not null default '{}'::jsonb,
  shipped_at timestamptz, delivered_at timestamptz, exception_notes text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz,
  constraint shipment_status_check check(status in ('Draft','Ready','Shipped','Delivered','Exception'))
);
create index if not exists shipments_collab_idx on public.shipments(collaboration_id, created_at desc) where archived_at is null;
create index if not exists shipments_status_idx on public.shipments(status, shipped_at) where archived_at is null;
create unique index if not exists shipments_tracking_unique on public.shipments(carrier, tracking_number) where tracking_number is not null and archived_at is null;

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(), shipment_id uuid not null references public.shipments(id) on delete cascade,
  product_id uuid not null references public.products(id), quantity integer not null default 1 check(quantity > 0), notes text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz,
  unique(shipment_id, product_id)
);
create index if not exists shipment_items_shipment_idx on public.shipment_items(shipment_id) where archived_at is null;
create index if not exists shipment_items_product_idx on public.shipment_items(product_id) where archived_at is null;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id), shipment_id uuid references public.shipments(id),
  movement_type text not null, quantity_delta integer not null, note text,
  created_at timestamptz not null default timezone('utc', now()), created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz,
  constraint inventory_movement_type_check check(movement_type in ('Opening','Adjustment','Reserved','Released','Shipped','Returned'))
);
create index if not exists inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc) where archived_at is null;
create unique index if not exists inventory_movement_shipment_unique on public.inventory_movements(shipment_id,product_id,movement_type) where shipment_id is not null and archived_at is null;

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(), collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  deliverable_id uuid references public.deliverables(id), platform text not null, format text, url text,
  status text not null default 'Planned', published_at timestamptz, views integer, likes integer, comments integer, shares integer, saves integer,
  last_metrics_at timestamptz, notes text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz,
  constraint publication_status_check check(status in ('Planned','Published','Removed'))
);
create index if not exists publications_collab_idx on public.publications(collaboration_id, published_at desc) where archived_at is null;
create index if not exists publications_status_idx on public.publications(status, published_at) where archived_at is null;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(), collaboration_id uuid not null references public.collaborations(id) on delete cascade,
  deliverable_id uuid references public.deliverables(id), publication_id uuid references public.publications(id),
  asset_type text, file_name text, storage_path text, external_url text, mime_type text, file_size_bytes bigint,
  usage_notes text, rights_status text,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz
);
create index if not exists assets_collab_idx on public.assets(collaboration_id, created_at desc) where archived_at is null;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null,
  collaboration_id uuid references public.collaborations(id) on delete cascade, creator_id uuid references public.creators(id) on delete cascade,
  action text not null, before_data jsonb, after_data jsonb, note text,
  created_at timestamptz not null default timezone('utc', now()), created_by uuid references public.crm_users(id), owner_id uuid references public.crm_users(id), archived_at timestamptz
);
create index if not exists activity_entity_idx on public.activity_logs(entity_type, entity_id, created_at desc);
create index if not exists activity_collab_idx on public.activity_logs(collaboration_id, created_at desc);

do $$ declare table_name text;
begin
  foreach table_name in array array['crm_users','creator_accounts','creator_pets','creator_addresses','outreach_records','campaigns','products','collaborations','collaboration_products','deliverables','shipments','shipment_items','publications','assets'] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.assign_crm_code()
returns trigger language plpgsql as $$
begin
  if tg_table_name='creators' then
    if new.creator_code is null then new.creator_code='CR-'||upper(right(replace(new.id::text,'-',''),8)); end if;
  elsif tg_table_name='collaborations' then
    if new.collaboration_code is null then new.collaboration_code='CO-'||upper(right(replace(new.id::text,'-',''),8)); end if;
  elsif tg_table_name='shipments' then
    if new.shipment_code is null then new.shipment_code='SH-'||upper(right(replace(new.id::text,'-',''),8)); end if;
  end if;
  return new;
end $$;
drop trigger if exists assign_creator_code on public.creators;
create trigger assign_creator_code before insert on public.creators for each row execute function public.assign_crm_code();
drop trigger if exists assign_collaboration_code on public.collaborations;
create trigger assign_collaboration_code before insert on public.collaborations for each row execute function public.assign_crm_code();
drop trigger if exists assign_shipment_code on public.shipments;
create trigger assign_shipment_code before insert on public.shipments for each row execute function public.assign_crm_code();

create or replace view public.creator_directory with (security_invoker=true) as
select c.*,
  account.platform as primary_platform, account.handle as primary_handle, account.profile_url as primary_profile_url,
  coalesce(outreach.status, 'Not Contacted') as outreach_status, outreach.last_contact_at, outreach.next_follow_up_at,
  coalesce(collab.collaboration_count, 0) as collaboration_count
from public.creators c
left join lateral (select a.platform,a.handle,a.profile_url from public.creator_accounts a where a.creator_id=c.id and a.archived_at is null order by a.is_primary desc,a.created_at asc limit 1) account on true
left join lateral (select o.status,o.last_contact_at,o.next_follow_up_at from public.outreach_records o where o.creator_id=c.id and o.archived_at is null order by o.updated_at desc limit 1) outreach on true
left join lateral (select count(*)::integer collaboration_count from public.collaborations x where x.creator_id=c.id and x.archived_at is null) collab on true
where c.archived_at is null;

create or replace view public.collaboration_directory with (security_invoker=true) as
select c.*,
  creator.display_name as creator_name,
  creator.creator_code,
  account.handle as creator_handle,
  campaign.name as campaign_name,
  coalesce(product_rollup.product_ids, '{}'::uuid[]) as product_ids,
  coalesce(product_rollup.product_names, '') as product_names,
  shipment.status as shipment_status,
  shipment.tracking_number,
  coalesce(deliverable_rollup.deliverables_total, 0) as deliverables_total,
  coalesce(deliverable_rollup.deliverables_completed, 0) as deliverables_completed
from public.collaborations c
join public.creators creator on creator.id=c.creator_id
left join public.campaigns campaign on campaign.id=c.campaign_id
left join lateral (
  select a.handle from public.creator_accounts a
  where a.creator_id=c.creator_id and a.archived_at is null
  order by a.is_primary desc,a.created_at asc limit 1
) account on true
left join lateral (
  select array_agg(cp.product_id order by cp.is_primary desc,p.name) as product_ids,
    string_agg(p.name, ', ' order by cp.is_primary desc,p.name) as product_names
  from public.collaboration_products cp join public.products p on p.id=cp.product_id
  where cp.collaboration_id=c.id and cp.archived_at is null and p.archived_at is null
) product_rollup on true
left join lateral (
  select s.status,s.tracking_number from public.shipments s
  where s.collaboration_id=c.id and s.archived_at is null
  order by s.created_at desc limit 1
) shipment on true
left join lateral (
  select count(*)::integer as deliverables_total,
    count(*) filter(where d.status in ('Approved','Published'))::integer as deliverables_completed
  from public.deliverables d where d.collaboration_id=c.id and d.archived_at is null
) deliverable_rollup on true
where c.archived_at is null;

do $$ declare table_name text;
begin
  foreach table_name in array array['creator_accounts','creator_pets','creator_addresses','outreach_records','campaigns','products','collaborations','collaboration_products','deliverables','shipments','shipment_items','inventory_movements','publications','assets','activity_logs'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "crm authenticated access" on public.%I', table_name);
    execute format('create policy "crm authenticated access" on public.%I for all to authenticated using (true) with check (true)', table_name);
  end loop;
end $$;

alter table public.crm_users enable row level security;
drop policy if exists "crm authenticated access" on public.crm_users;
drop policy if exists "crm users read team" on public.crm_users;
drop policy if exists "crm users maintain self" on public.crm_users;
create policy "crm users read team" on public.crm_users for select to authenticated using (true);
create policy "crm users maintain self" on public.crm_users for all to authenticated using (id=auth.uid()) with check (id=auth.uid());

alter table public.creators enable row level security;
drop policy if exists "crm authenticated access" on public.creators;
create policy "crm authenticated access" on public.creators for all to authenticated using (true) with check (true);

grant select,insert,update,delete on public.creators,public.creator_accounts,public.creator_pets,public.creator_addresses,public.outreach_records,public.campaigns,public.products,public.collaborations,public.collaboration_products,public.deliverables,public.shipments,public.shipment_items,public.inventory_movements,public.publications,public.assets,public.activity_logs to authenticated;
grant select,insert,update on public.crm_users to authenticated;
grant select on public.creator_directory,public.collaboration_directory to authenticated;
