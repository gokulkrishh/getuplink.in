-- Named MCP connectors: up to 5 per account (Settings → Advanced), one per AI app ("Claude", "Grok"), each
-- removed on its own. Until now an account had one token, keyed by user_id.
--
-- Each row gets an id (the key Settings removes it by) and a name. The existing token of each account
-- keeps working and is named "Connector". The cap of 5 is the app's (lib/server/connector-token.ts).
--
-- Deploy this before the code. Between the two, existing tokens keep working; only the old Settings'
-- Create or Replace token fails (its upsert names the user_id key this drops).

alter table public.connector_token add column id bigint generated always as identity;
alter table public.connector_token add column name text not null default 'Connector'
  check (name = btrim(name) and char_length(name) between 1 and 40);
-- Every new row names itself.
alter table public.connector_token alter column name drop default;

alter table public.connector_token drop constraint connector_token_pkey;
alter table public.connector_token add constraint connector_token_pkey primary key (id);

-- The MCP route's lookup by hash; two tokens never share one.
create unique index connector_token_token_hash_key on public.connector_token (token_hash);
-- Settings' list, the scoped deletes and the cascade from users.
create index connector_token_user_created_idx on public.connector_token (user_id, created_at);

-- RLS stays on with no policies: only the service-role key (server side) can read or write.
revoke all on sequence public.connector_token_id_seq from anon, authenticated;

notify pgrst, 'reload schema';

-- Rollback (manual, not run). Keeps each account's newest token and deletes the rest; redeploy the
-- previous code after it.
--   delete from public.connector_token t using public.connector_token newer
--     where newer.user_id = t.user_id and (newer.created_at, newer.id) > (t.created_at, t.id);
--   drop index public.connector_token_user_created_idx;
--   drop index public.connector_token_token_hash_key;
--   alter table public.connector_token drop constraint connector_token_pkey;
--   alter table public.connector_token add constraint connector_token_pkey primary key (user_id);
--   alter table public.connector_token drop column name;
--   alter table public.connector_token drop column id;
--   notify pgrst, 'reload schema';
