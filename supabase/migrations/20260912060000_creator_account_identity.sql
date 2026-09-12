-- Prevent simultaneous imports/adds of the same normalized social account.
-- No existing rows are rewritten or removed. Conflicts abort the transaction.
-- Includes archived accounts: review/reactivate the original instead of duplicating history.
begin;
create or replace function public.crm_instagram_identity(value text)
returns text language plpgsql immutable strict set search_path = pg_catalog as $$
declare result text := lower(btrim(value));
begin
  if result ~ '^(https?://|(www\.|m\.)?instagram\.com/)' then
    if result !~ '^(https?://)?(www\.|m\.)?instagram\.com/[a-z0-9._]{1,30}/?([?#].*)?$' then return null; end if;
    result := regexp_replace(result, '^(https?://)?(www\.|m\.)?instagram\.com/', '');
    result := regexp_replace(result, '[/?#].*$', '');
  else result := regexp_replace(result, '^@', ''); end if;
  if result !~ '^[a-z0-9._]{1,30}$' or result = any(array['p','reel','reels','stories','explore','direct','accounts','share']) then return null; end if;
  return result;
end $$;

create unique index if not exists creator_accounts_normalized_identity_unique
on public.creator_accounts (lower(btrim(platform)),
  (case when lower(btrim(platform))='instagram'
    then coalesce(public.crm_instagram_identity(handle),public.crm_instagram_identity(profile_url))
    else lower(ltrim(btrim(handle),'@')) end));
create unique index if not exists creator_accounts_instagram_url_unique
on public.creator_accounts (public.crm_instagram_identity(profile_url))
where lower(btrim(platform))='instagram';
commit;

-- Rollback (only if explicitly approved): remove these two indexes, then the
-- crm_instagram_identity(text) function. Do not change Auth, RLS or business rows.
