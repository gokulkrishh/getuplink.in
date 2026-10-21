-- Settings: "Sign out everywhere" and "Disconnect Tesla".

-- Disconnect clears the Tesla tokens but keeps owner_sub, so nobody else can claim the dashboard.
alter table public.oauth_tokens
  alter column access_token_enc drop not null,
  alter column refresh_token_enc drop not null,
  alter column expires_at drop not null;

-- Sessions signed in before this moment are no longer valid ("Sign out everywhere").
alter table public.oauth_tokens
  add column sessions_valid_after timestamptz not null default '-infinity';
