# Single-SKU shipping quantities — 2026-10-19

User approved the preview and release. Product selection now offers only single
SKUs. Unselected quantity is 0 (not stored); selecting starts at 1; unchecking or
entering 0 deselects. Only positive integer quantities are submitted. Lists and
packing instructions show SKU quantities. Login/Auth/RLS are unchanged; the
password-free local preview is not part of this production commit.

## Historical conversion

- Textile set: one matching bandana + one matching scrunchie per set.
- Necklace set: two matching necklaces per set.
- Preflight: 43 total product rows, 42 active, including 39 active set rows.
- Read-only plan: 66 active individual-SKU lines, 81 physical units afterwards.
- Catalog set products remain intact; no catalog row is deleted or archived.
- Original set lines are retained as archived rows; existing single lines are
  reused, quantities summed. Stale archived single quantities are not added.
- The operation in `supabase/operations/20261019_expand_shipping_sets.sql`
  requires a matching private pre-operation snapshot. It aborts on drift,
  unknown composition, missing single SKU, quantity mismatch, or any change to
  the other 16 business tables. It contains no Auth/grant/policy changes.
- Private snapshots under local `outputs/private-*` must NEVER be committed.

## Verification and rollback

Run all smoke tests, JavaScript syntax checks and `git diff --check`; verify the
quantity transitions and save/reopen in the isolated demo, then production UI.
No synthetic production shipment or order is created for testing.

Execute the operation once inside a transaction with lock/statement timeouts,
supplying the saved product-row array via the transaction-local
`matchmate.sku_backup` setting. Check results before any retry: a stale snapshot
must fail rather than apply again. Verify active set count=0, active lines=66,
total units=81, original rows retained, and unchanged business-table counts.

For rollback, restore the previous frontend commit with a normal revert (never
force-push). Data rollback is separate: use the private before/after snapshots,
first require the current product rows to match the saved post-operation state,
archive newly created component lines, and restore the original line quantities
and archive flags. Stop on subsequent human edits; do not overwrite them or
reopen anonymous access. No other table or shipment status should be modified.
