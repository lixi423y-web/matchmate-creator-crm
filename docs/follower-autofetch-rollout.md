# Automatic followers — guarded Free-plan trial

## Live failure diagnosis — 2026-10-16

User reported missing followers for `janasosta`. Targeted read confirmed account
was created at 08:11:10 UTC with followers null. Logs confirmed OPTIONS 204 and
POST 200 but no persisted count. A backend-only, non-scraping startup health check
then returned `{configured:true,httpStatus:401}` from Apify `users/me`.
Configuration presence was not sufficient proof of valid provider authentication.
Blocked on user replacing `APIFY_TOKEN` directly in Supabase with a valid Apify
credential; no secret values were read or logged. Do not recreate the creator,
overwrite followers with zero, or claim automatic fetching works yet.
Function v4 retains gateway JWT verification and all existing Auth/RLS checks.
The diagnostic logs only boolean checks/status codes; it does not scrape or modify
CRM data. The backend currently accepts only accounts created within 10 minutes,
so a failed older creator will need a deliberate authenticated retry path after
provider authentication is corrected. That retry path is not implemented yet.

## Current verified status — 2026-10-14

Supabase connection verified; project `kcibsvltzcjpnuqnzfld` is ACTIVE_HEALTHY.
Protected Edge Function `creator-followers` version 3 is ACTIVE with
`verify_jwt: true`. Actual no-Authorization and invalid-JWT requests both
returned HTTP 401. All 8 local smoke suites passed again. No SQL or business
data writes were executed by the agent. User confirmed secret saved; actual CORS
preflight returned HTTP 204 and `X-CRM-Followers-Configured: true`, proving required
configuration presence without exposing values or making any provider request.
Frontend trial is enabled via `creatorFollowersAutoFetch: true`.
Authenticated/provider/first real creator integration remains pending the user's
next normal Add creator; existing browser sessions are inaccessible to this connector
and session tokens must not be read. Do not claim a live fetch has passed until the
persisted primary-account count is verified. Existing production data is not a test fixture.

Base: main `4d87558cfc0ca47b8cfc54c371b8472441fccca3`.
No SQL migration, table deletion, RLS/grant changes, service-role client, redesign,
or existing follower-value backfill is included.

## Behavior

After **manual Add creator** succeeds, a detached request queries the newly saved
primary Instagram account. The creator remains saved if enrichment fails.
CSV imports and existing profile edits do not start queries in this first trial.
Only blank account followers are filled. Zero is valid; unknown remains null.
The list refreshes in-place without navigation or reopening the editor.
Closing the page may cancel the browser request; this is not a durable job queue.
There is no automatic retry on refresh, login, or provider failure.

## Protected backend

`creator-followers` verifies the caller through Supabase Auth, requires the existing
shared CRM UUID, and forwards the caller JWT to PostgREST so existing RLS still
applies. It accepts a creator UUID, not arbitrary provider URLs or usernames.
Only new (<10 minutes) primary Instagram accounts are eligible.
The conditional PATCH changes only `creator_accounts.followers`, and requires
the original account/handle, primary state, unarchived state and a still-null count.
Concurrent manual values are preserved. Addresses and shipment data never go to Apify.

Only Apify's tested official actor `7RQ4RlfRihUhflQtJ` is used, with one public
username, a 30-second run timeout, and `$0.01` maximum actor charge per run.
The guard requires `users/me` to prove `isPaying === false`, plan ID `FREE`, and
zero monthly base price; unknown or paid plans fail closed without running the actor.
Provider errors and billing information are never forwarded or logged.
Deduplication is best-effort per Edge isolate, **not** a global exactly-once lock
or a guaranteed monthly budget. The provider's Free-plan limit must be confirmed
in the actual account before enabling; never upgrade, add payment, or permit overage.

## One-time secret entry (user only)

Project: `kcibsvltzcjpnuqnzfld`. Keep all existing Auth/RLS unchanged.

1. User creates/chooses an Apify API credential with only the permissions needed
   to read their plan and run/read the specified actor results. Do not send it in chat.
2. User pastes that credential directly into Supabase Edge Function Secrets as
   `APIFY_TOKEN`. The agent must not read, copy, screenshot, or store its value.
3. The runtime reads the built-in `SUPABASE_PUBLISHABLE_KEYS.default` and
   `SUPABASE_URL`; no extra manual public-key setting is needed if available.
   Optional overrides: `CRM_PUBLISHABLE_KEY`, `CRM_ORIGIN`.
   `FOLLOWERS_AUTOFETCH_ENABLED` defaults to `true`, but the absence of `APIFY_TOKEN`
   still blocks all queries. Set this flag to `false` to stop provider calls.
   No database/password key is read or needed.
4. Deploy both Edge Function files from source. Keep gateway JWT verification
   enabled if compatible with this project's JWT; never remove handler-side Auth
   validation. No production SQL is required.
5. Verify missing/invalid JWT denied and required configuration present in the
   live endpoint. Unit-test shared-user authorization, Free-only guard and
   conditional writes. Do not read existing user sessions to perform live tests.
6. Publish the guarded frontend trial with `creatorFollowersAutoFetch: true`.
   Complete final live acceptance with the user's next real Add creator: verify
   the real Free-plan guard, returned provider count, actual persisted account count,
   no login/refresh queries, manual value preservation, unchanged page location,
   and Logout. Local mock tests do not substitute for these live checks.

## Rollback / stop

Set backend `FOLLOWERS_AUTOFETCH_ENABLED` to `false` first to stop provider calls;
set frontend `creatorFollowersAutoFetch` to `false`. Existing creators and follower
values remain. Do not reopen anon permissions. No DB rollback is needed.

## Tests

Run all `tests/*smoke.mjs`, JS syntax checks and `git diff --check`.
2026-10-11: all 8 smoke suites, all `src/*.js`/handler syntax checks and diff
whitespace check passed locally. Dashboard session expired during setup; backend
deployment/secret configuration have not occurred. GitHub connector transport
failed during the final remote check; these draft changes remain local only.

New smoke uses synthetic credentials and mocked services only; it does not consume
credits or change production. Live backend/frontend integration remains pending.

API contracts: https://docs.apify.com/api/v2/users-me-get and
https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post.
