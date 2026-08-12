# Non-destructive Migration Plan

## Phase 0: Freeze and protect

1. Export every existing table and take a Supabase database backup.
2. Record row counts for `creators`, `collaboration_rounds` and `creator_assets`.
3. Keep V1 live and do not change its tables, columns or Pages deployment.

## Phase 1: Build in staging

1. Create a Supabase branch or staging project from production.
2. Run `001_crm_v2_additive_schema.sql`.
3. Confirm all tables, foreign keys, indexes, views and authenticated policies were created.
4. Create test team accounts in Supabase Auth.

## Phase 2: Backfill

1. Run `002_legacy_backfill.sql` in staging.
2. Run `verification.sql`.
3. Review any unmatched product names and records without a collaboration.
4. Sample at least the eight known fulfillment records and compare creator, address, pet, product, tracking, post links and assets against V1.

## Phase 3: User acceptance

Verify sign-in, 1,000-row pagination, creator search/filter, outreach history, create collaboration, multiple products, multiple shipments, publication links, assets, bulk update and CSV export.

## Phase 4: Controlled cutover

1. Schedule a short write freeze.
2. Repeat backup, schema migration, backfill and verification in production.
3. Configure the V2 frontend with the publishable key only.
4. Confirm V2 reads and writes authenticated data.
5. Retire V1, then run `003_security_cutover.sql` to remove anonymous access.
6. Deploy V2 only after final acceptance.

## Rollback

- Do not run destructive SQL.
- If V2 fails before security cutover, stop using V2 and continue V1; all old tables and columns remain.
- If V2 fails after security cutover, restore the prior anonymous policies only for the minimum rollback window, redeploy V1 and investigate. Do not delete V2 tables.
- Restore the database backup only if additive changes caused corruption; normal rollback should not require restore.

## Inventory

Automatic inventory decrement is intentionally deferred. Before enabling it, confirm the authoritative product stock table, SKU mapping, reservation behavior, cancellation/release behavior, returns and whether decrement happens at `Ready` or `Shipped`.
