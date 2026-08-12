-- Matchmate Creator CRM v2 legacy backfill.
-- Additive and idempotent: legacy tables and columns are never deleted or renamed.
-- Run after 001, after a database backup, and before 003_security_cutover.sql.

create or replace function public.try_timestamptz(value text)
returns timestamptz language plpgsql immutable as $$
begin
  if nullif(trim(value),'') is null then return null; end if;
  return value::timestamptz;
exception when others then return null;
end $$;

update public.creators
set creator_code=coalesce(creator_code,'CR-'||upper(right(replace(id::text,'-',''),8))),
    display_name=coalesce(nullif(display_name,''),nullif(trim(leading '@' from handle),''),'Unnamed creator'),
    nickname=coalesce(nullif(nickname,''),nullif(trim(leading '@' from handle),'')),
    preferred_contact_method=coalesce(nullif(preferred_contact_method,''),'Instagram DM'),
    contact_phone=coalesce(nullif(contact_phone,''),nullif(phone,'')),
    relationship_status=coalesce(nullif(relationship_status,''),case when coalesce(collab_count,0)>1 then 'Repeat Partner' else 'New' end),
    tags=coalesce(tags,'{}')
where creator_code is null or display_name is null or nickname is null or contact_phone is null;

insert into public.creator_accounts(creator_id,platform,handle,profile_url,followers,is_primary,link_status,last_verified_at)
select c.id,'Instagram',trim(leading '@' from c.handle),nullif(c.profile_url,''),
  case
    when lower(replace(c.followers,',','')) ~ '^[0-9]+(\.[0-9]+)?k$' then round(replace(lower(replace(c.followers,',','')),'k','')::numeric*1000)::integer
    when replace(c.followers,',','') ~ '^[0-9]+$' then replace(c.followers,',','')::integer
    else null
  end,
  true,c.link_status,c.updated_at
from public.creators c
where nullif(c.handle,'') is not null
on conflict(platform,handle) do update set profile_url=excluded.profile_url,followers=excluded.followers,is_primary=true,link_status=excluded.link_status;

-- Legacy stored pet information as one free-text block. Preserve it intact.
insert into public.creator_pets(creator_id,size,fit_notes)
select c.id,nullif(c.dog_size,''),nullif(c.pet_details,'')
from public.creators c
where coalesce(nullif(c.dog_size,''),nullif(c.pet_details,'')) is not null
and not exists(select 1 from public.creator_pets p where p.creator_id=c.id and p.archived_at is null);

-- Legacy stored the complete pasted address in one field; do not split or reinterpret it.
insert into public.creator_addresses(creator_id,label,full_address,phone,is_default)
select c.id,'Legacy shipping address',c.shipping_address,nullif(c.phone,''),true
from public.creators c
where nullif(c.shipping_address,'') is not null
and not exists(select 1 from public.creator_addresses a where a.creator_id=c.id and a.is_default and a.archived_at is null);

insert into public.outreach_records(creator_id,status,channel,last_contact_at,next_follow_up_at,notes,message_summary,conversation_url)
select c.id,
  case
    when c.stage='Not contacted' then 'Not Contacted'
    when c.stage='DM sent' then 'Contacted'
    when c.stage='Follow-up sent' then 'Follow-up Due'
    when c.stage='No reply after 2 follow-ups' then 'No Response'
    when c.stage='Replied' then 'Replied'
    when c.stage='Negotiating' then 'Negotiating'
    when c.stage='Declined' then 'Declined'
    when c.stage='Paused' then 'Paused'
    else 'Converted'
  end,
  'Instagram DM',public.try_timestamptz(c.last_touch::text),public.try_timestamptz(c.next_follow::text),
  coalesce(nullif(c.dm_notes,''),nullif(c.notes,'')),nullif(c.last_message,''),nullif(c.conversation_link,'')
from public.creators c
where not exists(select 1 from public.outreach_records o where o.creator_id=c.id and o.archived_at is null);

insert into public.products(sku,name,category)
values
('RB-SET','Rose Bloom Set','Set'),('MS-SET','Mocha Sky Set','Set'),('LM-SET','Lavender Mist Set','Set'),
('WC-SET','Wildflower Charm Necklace Set','Set'),('OP-SET','Ocean Pearl Necklace Set','Set'),('ED-SET','Emerald Dew Necklace Set','Set'),
('RB-SCR','Rose Bloom Scrunchie','Scrunchie'),('MS-SCR','Mocha Sky Scrunchie','Scrunchie'),('LM-SCR','Lavender Mist Scrunchie','Scrunchie'),
('RB-BAN','Rose Bloom Bandana','Bandana'),('MS-BAN','Mocha Sky Bandana','Bandana'),('LM-BAN','Lavender Mist Bandana','Bandana'),
('WC-NEC','Wildflower Charm Necklace','Necklace'),('OP-NEC','Ocean Pearl Necklace','Necklace'),('ED-NEC','Emerald Dew Necklace','Necklace')
on conflict(sku) do update set name=excluded.name,category=excluded.category;

-- Confirmed collaboration rounds become collaboration records. Outreach-only rows stay in outreach_records.
do $$
begin
  if to_regclass('public.collaboration_rounds') is not null then
    insert into public.collaborations(id,collaboration_code,creator_id,collaboration_name,type,stage,start_date,rights_status,payment_status,is_repeat,notes,created_at,updated_at)
    select r.id,'CO-'||upper(right(replace(r.id::text,'-',''),8)),r.creator_id,'Legacy Round '||coalesce(r.round_number,1),'Seeding',
      case when r.stage in ('Address received','Ready to ship') then 'Ready to Fulfill'
           when r.stage='Shipped' then 'In Fulfillment' when r.stage='Delivered' then 'Delivered'
           when r.stage='Posted' then 'Published' when r.stage in ('Declined','Paused') then 'Closed'
           else 'Confirmed — Awaiting Details' end,
      r.created_at::date,coalesce(nullif(r.rights_status,''),'Not Discussed'),coalesce(nullif(r.payment_status,''),'Gifted'),
      coalesce(r.round_number,1)>1,nullif(r.performance_note,''),r.created_at,r.created_at
    from public.collaboration_rounds r
    where coalesce(nullif(r.final_product,''),nullif(r.shipping_address,''),nullif(r.tracking_number,''),nullif(r.posted_date::text,'')) is not null
    and not exists(select 1 from public.collaborations c where c.id=r.id);
  end if;
end $$;

-- Some early users never created an explicit round. Preserve each confirmed creator snapshot once.
insert into public.collaborations(creator_id,collaboration_name,type,stage,start_date,rights_status,payment_status,is_repeat,notes,created_at,updated_at)
select c.id,'Legacy creator snapshot','Seeding',
  case when c.stage in ('Address received','Ready to ship') then 'Ready to Fulfill'
       when c.stage='Shipped' then 'In Fulfillment' when c.stage='Delivered' then 'Delivered'
       when c.stage='Posted' then 'Published' else 'Confirmed — Awaiting Details' end,
  c.created_at::date,coalesce(nullif(c.rights_status,''),'Not Discussed'),coalesce(nullif(c.payment_status,''),'Gifted'),coalesce(c.collab_count,0)>1,
  concat_ws(E'\n',nullif(c.performance_note,''),nullif(c.collab_history,'')),c.created_at,c.updated_at
from public.creators c
where c.stage in ('Address received','Ready to ship','Shipped','Delivered','Posted')
and coalesce(nullif(c.final_product,''),nullif(c.shipping_address,''),nullif(c.tracking_number,''),nullif(c.content_url,'')) is not null
and not exists(select 1 from public.collaborations x where x.creator_id=c.id);

-- Product matching supports both one product and comma-separated legacy selections.
insert into public.collaboration_products(collaboration_id,product_id,quantity,is_primary)
select x.id,p.id,1,row_number() over(partition by x.id order by p.name)=1
from public.collaborations x
join public.creators c on c.id=x.creator_id
cross join lateral regexp_split_to_table(coalesce(c.final_product,''), E'\\s*[,|\\n]\\s*') selected_product
join public.products p on lower(trim(selected_product))=lower(p.name)
where x.collaboration_name='Legacy creator snapshot'
on conflict(collaboration_id,product_id) do nothing;

do $$
begin
  if to_regclass('public.collaboration_rounds') is not null then
    insert into public.collaboration_products(collaboration_id,product_id,quantity,is_primary)
    select x.id,p.id,1,row_number() over(partition by x.id order by p.name)=1
    from public.collaborations x join public.collaboration_rounds r on r.id=x.id
    cross join lateral regexp_split_to_table(coalesce(r.final_product,''), E'\\s*[,|\\n]\\s*') selected_product
    join public.products p on lower(trim(selected_product))=lower(p.name)
    on conflict(collaboration_id,product_id) do nothing;

    insert into public.shipments(collaboration_id,status,tracking_number,address_snapshot,shipped_at,delivered_at,created_at)
    select x.id,case when r.stage='Delivered' then 'Delivered' when nullif(r.tracking_number,'') is not null or r.stage='Shipped' then 'Shipped' else 'Ready' end,
      nullif(r.tracking_number,''),jsonb_build_object('full_address',coalesce(r.shipping_address,''),'source','legacy collaboration round'),
      case when r.stage in ('Shipped','Delivered') then r.created_at end,
      case when r.stage='Delivered' then r.created_at end,r.created_at
    from public.collaborations x join public.collaboration_rounds r on r.id=x.id
    where (r.stage in ('Shipped','Delivered') or (nullif(r.final_product,'') is not null and nullif(r.shipping_address,'') is not null))
    and not exists(select 1 from public.shipments s where s.collaboration_id=x.id and coalesce(s.tracking_number,'')=coalesce(r.tracking_number,''));

    insert into public.publications(collaboration_id,platform,format,url,status,published_at,notes)
    select r.id,coalesce(link->>'platform','Instagram'),'Post',link->>'url','Published',public.try_timestamptz(link->>'posted_date'),nullif(r.performance_note,'')
    from public.collaboration_rounds r cross join lateral jsonb_array_elements(coalesce(r.post_links,'[]'::jsonb)) link
    where nullif(link->>'url','') is not null and exists(select 1 from public.collaborations x where x.id=r.id)
    and not exists(select 1 from public.publications p where p.collaboration_id=r.id and p.url=link->>'url');
  end if;
end $$;

-- Create one shipment/publication for legacy creator snapshots when applicable.
insert into public.shipments(collaboration_id,status,tracking_number,address_snapshot,shipped_at,delivered_at,created_at)
select x.id,case when c.stage='Delivered' then 'Delivered' when nullif(c.tracking_number,'') is not null or c.stage='Shipped' then 'Shipped' else 'Ready' end,
  nullif(c.tracking_number,''),jsonb_build_object('full_address',coalesce(c.shipping_address,''),'source','legacy creator snapshot'),
  case when c.stage in ('Shipped','Delivered') then c.updated_at end,case when c.stage='Delivered' then c.updated_at end,c.created_at
from public.collaborations x join public.creators c on c.id=x.creator_id
where x.collaboration_name='Legacy creator snapshot' and (c.stage in ('Shipped','Delivered') or nullif(c.shipping_address,'') is not null)
and not exists(select 1 from public.shipments s where s.collaboration_id=x.id);

insert into public.publications(collaboration_id,platform,format,url,status,published_at,notes)
select x.id,'Instagram','Post',c.content_url,'Published',public.try_timestamptz(c.posted_date::text),nullif(c.performance_note,'')
from public.collaborations x join public.creators c on c.id=x.creator_id
where x.collaboration_name='Legacy creator snapshot' and nullif(c.content_url,'') is not null
and not exists(select 1 from public.publications p where p.collaboration_id=x.id and p.url=c.content_url);

do $$
begin
  if to_regclass('public.creator_assets') is not null then
    insert into public.assets(collaboration_id,asset_type,file_name,storage_path,external_url,mime_type,usage_notes,created_at)
    select coalesce(round_collab.id,creator_collab.id),a.asset_type,a.file_name,a.storage_path,a.public_url,a.mime_type,a.notes,a.created_at
    from public.creator_assets a
    left join public.collaborations round_collab on round_collab.id=a.round_id
    left join lateral (select x.id from public.collaborations x where x.creator_id=a.creator_id order by x.created_at desc limit 1) creator_collab on true
    where coalesce(round_collab.id,creator_collab.id) is not null
    and not exists(select 1 from public.assets x where x.collaboration_id=coalesce(round_collab.id,creator_collab.id) and x.external_url=a.public_url);
  end if;
end $$;
