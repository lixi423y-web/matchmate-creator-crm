# Security

## First-version model

- Users sign in through Supabase Auth.
- The frontend sends the authenticated access token with every database request.
- RLS permits the `authenticated` role and does not rely on a shared CRM password.
- The project URL and publishable anon key may exist in frontend configuration.
- `service_role`, secret API keys and database passwords must never appear in browser code or GitHub.

## Cutover sequence

Migration `001` secures new V2 tables. Migration `003` removes anonymous access from legacy tables only after V1 is retired. It first grants authenticated access to those legacy tables so historical records remain available.

## Before production approval

- Confirm anonymous requests cannot select, insert, update or delete CRM records.
- Confirm an authenticated team member can perform required operations.
- Confirm session refresh and sign-out work.
- Confirm the public GitHub Pages site exposes no creator data before sign-in.
- Rotate any token or secret ever pasted into chat, screenshots, source control or a public page.

Role-based permissions, audit retention rules and restricted access to addresses/payment data are a later security phase.
