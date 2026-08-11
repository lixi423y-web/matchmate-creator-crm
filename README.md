# Matchmate Creator CRM v2

Internal creator operations workspace for Matchmate Growth. This branch is a non-deployed V2 candidate; the existing V1 source remains available in `legacy-v1/` for comparison and rollback.

## Scope

The main navigation intentionally contains only:

1. Dashboard
2. Creators
3. Collaborations

Creator records hold long-term profile and outreach data. A collaboration is created only after a creator agrees. Products, deliverables, shipments, publications, assets, rights and cost details belong to that collaboration, so repeat rounds never overwrite one another.

## Local demo

The demo generates 1,000 creators in memory and does not write to Supabase.

```sh
python3 -m http.server 8798
```

Open `http://127.0.0.1:8798/?demo=1&size=1000`.

Run the repeatable 1,000-creator data smoke test with the bundled Node runtime:

```sh
node tests/demo-smoke.mjs
```

## Supabase setup

1. Create a separate Supabase branch or staging project and take a production backup.
2. Run `supabase/migrations/001_crm_v2_additive_schema.sql` in staging.
3. Create the allowed team users in Supabase Auth.
4. Run `supabase/migrations/002_legacy_backfill.sql`.
5. Run `supabase/verification.sql` and complete user acceptance testing.
6. Copy `config.example.js` to `config.js`, using only the project URL and publishable anon key.
7. Run `003_security_cutover.sql` only after V1 is retired and V2 is approved.

Never put a `service_role` or secret key in this repository. The browser uses Supabase Auth and authenticated RLS.

## Inventory boundary

V2 includes products, shipment items and append-only inventory movement records. It does not automatically decrement production stock yet. Enable that only after Matchmate confirms the inventory source of truth and whether stock is deducted at reservation or shipment.

## Release boundary

This branch must be reviewed through a Draft PR. Do not merge or deploy it until database backup, migration verification, authentication, RLS and UAT are complete.
