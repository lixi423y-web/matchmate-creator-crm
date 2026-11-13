# Collaboration-backed shipping handoff

## 2026-11-13 creator-first release

- Collaborations now lists Creator, Stage, Products & quantity, Recipient details, Outreach owner, Shipping owner, Shipping handoff and Publication. Campaign/dates/deliverables remain available in filters and details; existing CSV exports retain their scalar fields.
- Setting a shipping owner creates or updates only a Draft shipment. Saving recipient details also leaves the handoff unsubmitted. Both pages edit the same owner and product records.
- Hand over for shipping reviews existing products and address, then chooses the sender. No repeated address entry, identity selector, warehouse selector or acceptance form.
- To ship lists submitted Ready/Exception parcels, filtered by shipping owner. Mark shipped records dispatch and advances Stage without regressing content/publication stages.
- Recipient details can be edited directly from the list; updates retain the previous snapshot in activity history.
- No production migration or automatic historical assignment/submission. Baseline: creators 330, collaborations 41, shipments 42, addresses 14, activity logs 341.
- For this release, roll back frontend files to commit 40c5aa675055865b544224f6984e8e1b54522ad4 with a forward commit. Database rollback is unnecessary.

Approved preview: person-handoff-demo, 2026-11-12.

## Operation

1. Agree the creator's products and quantities, and save the address.
2. In Collaborations, select Submit for shipping. Review the copied address and assign one shipping owner.
3. Shipping handoff lists submitted shipments only. Pending includes Ready and Exception; All preserves sent records. Old Drafts are not automatically submitted.
4. The assigned owner checks products/address, hands the parcel to the carrier, then changes Status to Shipped and records dispatch time. Tracking may be added later.
5. To change the shipping owner, select a person and Save. No reason or acceptance checkbox is required. The previous and new owner are recorded automatically. With a shared login, assignment is a team convention, not per-person authentication.
6. Latest update shows a short timestamped change. Full records remain under the collaboration's Activity tab. Times are explicitly UTC; dispatch entry uses the browser's local time.

## Implementation and limits

- Existing collaborations, shipments, collaboration_products and activity_logs are reused. No production SQL, schema, Auth, grants or RLS changes.
- Collaboration owner and product selection are the same records in both views. Status advances Stage without regressing Published/Completed/Closed.
- Shipment and owner edits use updated_at compare-and-swap. New first handoffs use a stable shipment ID to reject duplicate concurrent submissions. Existing drafts retain their IDs. No automatic migration of old data.
- Queue reads are paginated, independent of the collaboration list's current page, and refresh every minute while active. Each save checks fresh context. This is not a server-side cross-table transaction or per-person access control.
- An activity/Stage failure after a successful save is reported as a warning; never resubmit a sent parcel to repair history.
- Shipments already dispatched need confirmation before product-record corrections; previous quantities are logged.

## Verification

Run Node --test tests/*.mjs, syntax checks and git diff --check. Integrated local UI uses synthetic data only. Production verification opens/cancels editors without saving business records.

Read-only pre-release counts: creators 330; creator_addresses 14; collaborations 41; shipments 42; activity_logs 335.

## Rollback

Restore only index.html, styles.css, src/app.js and src/data.js from pre-release commit ebceabfebf0d6395d7d39f1acaac4a4a77e85c0e in a new forward commit; remove the two new handoff modules if desired. Deploy through the same Pages workflow. Do not reset the database or reopen anon access. Records created through the handoff remain ordinary shipment/activity records readable by the prior interface.
