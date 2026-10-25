-- One Tesla token refresh at a time, across every server instance. Tesla's refresh tokens are single use,
-- and presenting one that was just spent can revoke the whole chain, including the pair just stored. The
-- request that refreshes first claims this lease; the others wait for the new tokens instead of calling
-- Tesla with the old one. A lease that's never released (the request died) runs out on its own.

alter table public.oauth_tokens add column refreshing_until timestamptz;

-- Rollback (manual, not run):
--   alter table public.oauth_tokens drop column if exists refreshing_until;
