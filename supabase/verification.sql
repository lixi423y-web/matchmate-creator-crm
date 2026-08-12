-- Read-only verification queries. Run after 002_legacy_backfill.sql.

select 'creators' as entity, count(*) as rows from public.creators
union all select 'creator_accounts',count(*) from public.creator_accounts
union all select 'creator_pets',count(*) from public.creator_pets
union all select 'creator_addresses',count(*) from public.creator_addresses
union all select 'outreach_records',count(*) from public.outreach_records
union all select 'collaborations',count(*) from public.collaborations
union all select 'collaboration_products',count(*) from public.collaboration_products
union all select 'shipments',count(*) from public.shipments
union all select 'publications',count(*) from public.publications
union all select 'assets',count(*) from public.assets
order by entity;

select 'accounts without creator' as check_name,count(*) as failures from public.creator_accounts x left join public.creators c on c.id=x.creator_id where c.id is null
union all select 'outreach without creator',count(*) from public.outreach_records x left join public.creators c on c.id=x.creator_id where c.id is null
union all select 'collaborations without creator',count(*) from public.collaborations x left join public.creators c on c.id=x.creator_id where c.id is null
union all select 'products without collaboration',count(*) from public.collaboration_products x left join public.collaborations c on c.id=x.collaboration_id where c.id is null
union all select 'shipments without collaboration',count(*) from public.shipments x left join public.collaborations c on c.id=x.collaboration_id where c.id is null
union all select 'publications without collaboration',count(*) from public.publications x left join public.collaborations c on c.id=x.collaboration_id where c.id is null
union all select 'assets without collaboration',count(*) from public.assets x left join public.collaborations c on c.id=x.collaboration_id where c.id is null;

-- Legacy-to-v2 completeness checks. Every migrated source record should remain traceable.
select 'legacy rounds missing collaboration' as check_name,count(*) as failures
from public.collaboration_rounds r
where coalesce(nullif(r.final_product,''),nullif(r.shipping_address,''),nullif(r.tracking_number,''),nullif(r.posted_date::text,'')) is not null
and not exists(select 1 from public.collaborations c where c.id=r.id)
union all
select 'legacy asset missing v2 asset',count(*)
from public.creator_assets a
where not exists(
  select 1 from public.assets x
  where x.external_url=a.public_url
    and (x.file_name=a.file_name or (x.file_name is null and a.file_name is null))
)
union all
select 'legacy post link missing publication',count(*)
from public.collaboration_rounds r
cross join lateral jsonb_array_elements(coalesce(r.post_links,'[]'::jsonb)) link
where nullif(link->>'url','') is not null
and not exists(select 1 from public.publications p where p.collaboration_id=r.id and p.url=link->>'url');

select creator_code,count(*) from public.creators where creator_code is not null group by creator_code having count(*)>1;
select carrier,tracking_number,count(*) from public.shipments where tracking_number is not null and archived_at is null group by carrier,tracking_number having count(*)>1;

select c.creator_code,c.display_name,a.platform,a.handle,o.status as outreach_status,
  x.collaboration_code,x.collaboration_name,x.stage,p.product_names,s.tracking_number,s.address_snapshot
from public.creators c
left join public.creator_accounts a on a.creator_id=c.id and a.is_primary and a.archived_at is null
left join lateral (select status from public.outreach_records where creator_id=c.id and archived_at is null order by updated_at desc limit 1) o on true
left join public.collaborations x on x.creator_id=c.id and x.archived_at is null
left join public.collaboration_directory p on p.id=x.id
left join lateral (select tracking_number,address_snapshot from public.shipments where collaboration_id=x.id and archived_at is null order by created_at desc limit 1) s on true
order by c.updated_at desc,x.created_at desc
limit 50;
