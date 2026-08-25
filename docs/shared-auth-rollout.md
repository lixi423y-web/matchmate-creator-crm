# Shared Supabase Auth rollout

This change replaces the public shared-link data path with one manually managed Supabase email/password account. It does not add registration, roles, invitations, or a service-role key.

## Before the maintenance window

1. Review the frontend, `tests/auth-smoke.mjs`, and `supabase/migrations/007_authenticated_crm_access.sql`.
2. Confirm the target project is `kcibsvltzcjpnuqnzfld`.
3. In Supabase Dashboard, open **Authentication > Users > Add user** and create the shared internal email/password user. Use the Dashboard option to mark the email confirmed.
4. Under the Email provider/Auth settings, keep email/password sign-in enabled and disable public user sign-ups. The CRM intentionally has no Sign Up or Create Account control.
5. Share the credentials outside GitHub and outside the CRM source. Do not place them in `config.js`, HTML, JavaScript, SQL, screenshots, tickets, or chat logs.
6. Confirm a current Supabase backup is available.

## SQL execution order

Do not run any SQL until this change set is approved.

1. In Supabase SQL Editor, capture the pre-cutover counts with the read-only query below and save only the counts:

   ```sql
   select 'creators' as entity, count(*) as row_count from public.creators
   union all select 'creator_addresses', count(*) from public.creator_addresses
   union all select 'collaborations', count(*) from public.collaborations
   union all select 'shipments', count(*) from public.shipments
   union all select 'activity_logs', count(*) from public.activity_logs
   order by entity;
   ```

2. In a short maintenance window, publish the reviewed Auth frontend commit. Confirm a signed-out/private window shows only the login page and makes no CRM REST requests.
3. Run the complete `007_authenticated_crm_access.sql` file once. It is wrapped in a transaction and changes grants/RLS policies only.
4. Run the same count query again. Every result must equal the pre-cutover result.
5. Check that each listed table has `crm authenticated access`, that `crm shared link access` is absent, and that `anon` has no table or view grants.
6. Complete the authenticated and anonymous tests below before ending the maintenance window.

The frontend-first ordering keeps the login experience testable before the policy cutover. Keep the gap between steps 2 and 3 as short as possible because direct anonymous REST access remains possible until step 3 finishes. If zero exposure time is more important than a brief outage, reverse steps 2 and 3; the old frontend will be unavailable until the Auth frontend is published.

## Manual acceptance tests

1. Open the CRM in a private/incognito window. Only the Sign in page may render; Dashboard and CRM tables must remain absent from the network log.
2. Enter an incorrect email or password. The page must stay signed out and show a generic error.
3. Sign in with the shared account. Verify Dashboard, Creators, Collaborations, addresses, shipments, and history can be read. Edit one non-sensitive test field, save it, restore the original value, and confirm both saves succeed.
4. Refresh the page. The same session must restore without another password prompt.
5. Click Logout. The CRM disappears immediately. A later creator/address request must not be sent until another successful login.
6. In a separate private window, repeat the two anonymous REST checks below. Expected result: HTTP 401 or 403 and no CRM rows.
7. Compare the post-cutover counts with step 1. They must be identical.

Anonymous checks use placeholders only; do not paste the real publishable key into a committed file:

```sh
curl -i "$SUPABASE_URL/rest/v1/creators?select=id&limit=1" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"

curl -i "$SUPABASE_URL/rest/v1/creator_addresses?select=id&limit=1" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
```

## Expected request headers after login

Every CRM REST request uses the public/publishable key only as `apikey`. User authorization comes from the restored Supabase session:

```text
apikey: <publishable key>
Authorization: Bearer <session.access_token>
```

The password and access token must never be copied into source control or the rollout notes.

## Rollback

Preferred rollback keeps the database locked to authenticated users:

1. Stop the rollout and leave `007_authenticated_crm_access.sql` in place.
2. Fix or revert the Auth frontend on a review branch, retest login, then publish the corrected frontend.
3. Do not deploy the old anonymous frontend while `007` is active; it cannot access CRM data and will show errors.

Emergency availability rollback reopens the original security exposure and requires explicit approval:

1. Re-run the existing `supabase/migrations/005_shared_link_access.sql` to restore `anon` policies/grants.
2. Revert the frontend to the prior known-good commit and publish it.
3. Record the anonymous-access window and schedule a new Auth cutover immediately.

This emergency path does not delete data, but it again allows anyone with the public project configuration to read and edit CRM records. It should not be used as the normal rollback.
