-- One-time, explicitly approved CRM product-line conversion, not a schema migration.
-- Run inside a transaction after setting matchmate.sku_backup to a fresh JSON
-- array of ALL collaboration_products rows ordered by id, saved privately first.
-- Original sets are archived, never deleted. No product catalog row is changed.
-- A stale snapshot or any unexpected business-table change aborts everything.
DO $operation$
DECLARE
  snapshot jsonb := current_setting('matchmate.sku_backup', true)::jsonb;
  current_rows jsonb;
  expected_items jsonb;
  actual_items jsonb;
  protected_before jsonb := '{}'::jsonb;
  protected_after jsonb := '{}'::jsonb;
  table_name text;
  digest text;
  source record;
  component record;
  composition constant jsonb := '{"RB-SET":{"RB-BAN":1,"RB-SCR":1},"MS-SET":{"MS-BAN":1,"MS-SCR":1},"LM-SET":{"LM-BAN":1,"LM-SCR":1},"WC-SET":{"WC-NEC":2},"OP-SET":{"OP-NEC":2},"ED-SET":{"ED-NEC":2}}';
BEGIN
  LOCK TABLE public.collaboration_products IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(jsonb_agg(to_jsonb(cp) ORDER BY cp.id),'[]'::jsonb)
    INTO current_rows FROM public.collaboration_products cp;
  IF snapshot IS NULL OR snapshot IS DISTINCT FROM current_rows THEN
    RAISE EXCEPTION 'Missing or stale private product backup; no changes applied';
  END IF;
  FOREACH table_name IN ARRAY ARRAY['creators','creator_accounts','creator_pets','creator_addresses','outreach_records','campaigns','products','collaborations','deliverables','shipments','shipment_items','inventory_movements','publications','assets','activity_logs','crm_users'] LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text, %L ORDER BY t.id),%L)) FROM public.%I t',',','',table_name) INTO digest;
    protected_before := protected_before || jsonb_build_object(table_name,digest);
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.collaboration_products cp JOIN public.products p ON p.id=cp.product_id WHERE cp.archived_at IS NULL AND p.category='Set' AND NOT composition ? p.sku) THEN
    RAISE EXCEPTION 'Unknown set composition; review before converting';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(composition) s CROSS JOIN LATERAL jsonb_each_text(s.value) c LEFT JOIN public.products p ON p.sku=c.key AND p.archived_at IS NULL WHERE p.id IS NULL) THEN
    RAISE EXCEPTION 'A required single SKU is unavailable';
  END IF;
  SELECT coalesce(jsonb_object_agg(item_key,quantity),'{}'::jsonb) INTO expected_items
  FROM (
    SELECT cp.collaboration_id::text||':'||single.id::text AS item_key,
      sum(cp.quantity::bigint*coalesce(c.value::integer,1)) AS quantity
    FROM public.collaboration_products cp JOIN public.products p ON p.id=cp.product_id
    LEFT JOIN LATERAL jsonb_each_text(composition->p.sku) c ON true
    JOIN public.products single ON single.sku=coalesce(c.key,p.sku)
    WHERE cp.archived_at IS NULL GROUP BY cp.collaboration_id,single.id
  ) expected;
  FOR source IN
    SELECT cp.*,p.sku FROM public.collaboration_products cp JOIN public.products p ON p.id=cp.product_id
    WHERE cp.archived_at IS NULL AND composition ? p.sku ORDER BY cp.collaboration_id,cp.id FOR UPDATE OF cp
  LOOP
    FOR component IN SELECT p.id,(c.value)::integer AS multiplier FROM jsonb_each_text(composition->source.sku) c JOIN public.products p ON p.sku=c.key LOOP
      INSERT INTO public.collaboration_products AS existing
        (collaboration_id,product_id,quantity,is_primary,notes,created_at,created_by,owner_id)
      VALUES(source.collaboration_id,component.id,source.quantity*component.multiplier,source.is_primary,
        'Expanded from '||source.sku||' ['||source.id::text||']',source.created_at,source.created_by,source.owner_id)
      ON CONFLICT(collaboration_id,product_id) DO UPDATE SET
        quantity=(CASE WHEN existing.archived_at IS NULL THEN existing.quantity ELSE 0 END)+EXCLUDED.quantity,
        archived_at=NULL,is_primary=existing.is_primary OR EXCLUDED.is_primary,
        notes=coalesce(existing.notes,EXCLUDED.notes);
    END LOOP;
    UPDATE public.collaboration_products SET archived_at=transaction_timestamp() WHERE id=source.id;
  END LOOP;
  SELECT coalesce(jsonb_object_agg(collaboration_id::text||':'||product_id::text,quantity),'{}'::jsonb)
    INTO actual_items FROM public.collaboration_products WHERE archived_at IS NULL;
  IF actual_items IS DISTINCT FROM expected_items THEN RAISE EXCEPTION 'SKU quantities did not reconcile; rolled back'; END IF;
  FOREACH table_name IN ARRAY ARRAY['creators','creator_accounts','creator_pets','creator_addresses','outreach_records','campaigns','products','collaborations','deliverables','shipments','shipment_items','inventory_movements','publications','assets','activity_logs','crm_users'] LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text, %L ORDER BY t.id),%L)) FROM public.%I t',',','',table_name) INTO digest;
    protected_after := protected_after || jsonb_build_object(table_name,digest);
  END LOOP;
  IF protected_before IS DISTINCT FROM protected_after THEN RAISE EXCEPTION 'Unrelated business data changed; conversion rolled back'; END IF;
END
$operation$;
