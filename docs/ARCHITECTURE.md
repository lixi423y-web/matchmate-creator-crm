# Architecture

## Runtime

- Static HTML, CSS and ES modules can be hosted on GitHub Pages or another static host.
- Supabase Postgres is the source of truth.
- Supabase Auth supplies user identity.
- Row Level Security allows authenticated team members and blocks anonymous CRM access after cutover.
- The public publishable key identifies the Supabase project; it is not a database secret.

## Business model

```text
Creator
|- Creator Accounts
|- Creator Pets
|- Creator Addresses
|- Outreach Records
`- Collaborations
   |- Collaboration Products -> Products
   |- Deliverables
   |- Shipments -> Shipment Items -> Products
   |- Publications
   |- Assets
   `- Activity Logs
```

Creator data is durable. Outreach exists before an agreement. A collaboration begins only after agreement and represents one complete round. A shipment is one fulfillment attempt and stores an immutable address snapshot. Multiple shipments can belong to the same collaboration.

## Performance design

- List views use server-side search, filters, sorting and pagination.
- Default page size is 50; supported sizes are 25, 50 and 100.
- Search waits 300 ms after typing.
- Creator and collaboration relations load only after the detail drawer opens.
- Dashboard totals use bounded count queries instead of downloading the database.
- Database indexes cover owner, tier, fit, outreach status, collaboration stage, shipment status, product and relationship joins.
- CSV exports page through filtered server results and stop at 10,000 rows per export.

## Security boundary

The RLS policy in V2 is team-wide authenticated access for the first internal version. This is deliberately simpler than role-based permissions, but materially safer than anonymous access. Per-user or per-owner policies can be added later without changing the data model.
