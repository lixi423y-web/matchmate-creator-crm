begin;

-- A seeding creator may agree before the final format or platform is known.
alter table public.deliverables alter column type drop not null;

-- Keep older databases aligned with the complete product picker.
insert into public.products(sku,name,category)
values
('RB-SET','Rose Bloom Set','Set'),('MS-SET','Mocha Sky Set','Set'),('LM-SET','Lavender Mist Set','Set'),
('WC-SET','Wildflower Charm Necklace Set','Set'),('OP-SET','Ocean Pearl Necklace Set','Set'),('ED-SET','Emerald Dew Necklace Set','Set'),
('RB-SCR','Rose Bloom Scrunchie','Scrunchie'),('MS-SCR','Mocha Sky Scrunchie','Scrunchie'),('LM-SCR','Lavender Mist Scrunchie','Scrunchie'),
('RB-BAN','Rose Bloom Bandana','Bandana'),('MS-BAN','Mocha Sky Bandana','Bandana'),('LM-BAN','Lavender Mist Bandana','Bandana'),
('WC-NEC','Wildflower Charm Necklace','Necklace'),('OP-NEC','Ocean Pearl Necklace','Necklace'),('ED-NEC','Emerald Dew Necklace','Necklace')
on conflict(sku) do update set name=excluded.name,category=excluded.category,active=true,archived_at=null;

commit;
