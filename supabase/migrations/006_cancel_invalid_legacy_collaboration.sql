-- Repair a legacy DM-sent round that was incorrectly promoted to a confirmed collaboration.
update public.collaborations
set stage='Closed',
    notes=concat_ws(E'\n',nullif(notes,''),'Cancelled 2026-08-12: Legacy migration created this collaboration from an unconfirmed DM-sent round.'),
    updated_at=now()
where id='8bd9eef9-1d19-446a-bb2a-f9d7f408f949'
  and stage='Confirmed — Awaiting Details'
  and not exists (
    select 1 from public.shipments
    where collaboration_id='8bd9eef9-1d19-446a-bb2a-f9d7f408f949'
      and archived_at is null
  );
