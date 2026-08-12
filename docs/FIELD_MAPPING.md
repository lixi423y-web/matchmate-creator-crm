# Legacy Field Mapping

No legacy field is deleted or renamed. Backfill copies values into the V2 structure and keeps the old source intact.

| Legacy source | V2 destination | Rule |
| --- | --- | --- |
| `creators.id` | `creators.id` | Existing stable creator identity is preserved. |
| `handle`, `profile_url`, `followers`, `link_status` | `creator_accounts` | Creates one primary Instagram account. |
| `pet_details`, `dog_size` | `creator_pets.fit_notes`, `creator_pets.size` | Free text stays intact; no risky parsing. |
| `shipping_address` | `creator_addresses.full_address` | Preserved as one pasted address. |
| `phone` | `creators.contact_phone`, `creator_addresses.phone` | Contact value is copied, not removed. |
| `stage`, `last_touch`, `next_follow`, `dm_notes`, `last_message`, `conversation_link` | `outreach_records` | Legacy stages map to the new outreach lifecycle. |
| `collaboration_rounds` | `collaborations` | One old round becomes one V2 collaboration with the same UUID. |
| Confirmed creator rows without a round | `collaborations` | Creates one labelled legacy snapshot only when fulfillment/content data exists. |
| `final_product` | `collaboration_products` | Exact known product names are linked; unmatched text remains in legacy data for review. |
| `tracking_number`, round address | `shipments` | Tracking stays only in `tracking_number`; address becomes a snapshot. |
| `post_links`, `content_url`, `posted_date` | `publications` | Each live URL is its own record with its matching date. |
| `creator_assets` | `assets` | File metadata and public/external link are preserved against the related collaboration. |
| `notes`, `database_notes`, `performance_note`, `collab_history` | Creator or collaboration notes | Original source columns remain available after backfill. |

Legacy split fields such as `shipping_name`, `shipping_address1`, `shipping_address2`, city, state, ZIP and country are not reinterpreted by the SQL migration. They should be normalized during import only after detecting tracking-like values and verifying the resulting address. This avoids writing tracking numbers into address fields again.
