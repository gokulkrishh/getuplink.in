-- Invoices for third-party charging sessions, attached by the owner's AI through the Uplink MCP connector
-- (lib/charge-receipts.ts does the matching). One per session; the amounts are what the invoice says.
-- Restrict, not cascade: a session rebuild only deletes open sessions and invoices attach only to
-- finished ones, so a delete that hits an invoice is a bug that should fail loudly, not lose it.

create table public.charge_receipts (
  session_id bigint primary key references public.stream_charge_sessions (id) on delete restrict,
  network text not null,                 -- as printed, e.g. "ChargeMOD"
  station text,                          -- as printed on the invoice
  started_at timestamptz,                -- the invoice's own times
  ended_at timestamptz,
  kwh_billed numeric(8,2) check (kwh_billed > 0),
  amount_total numeric(10,2) not null check (amount_total > 0), -- what was paid, GST included
  gst numeric(10,2) check (gst >= 0),
  currency text not null default 'INR',
  invoice_path text,                     -- path in the private charge-invoices bucket, null when only the numbers were sent
  invoice_number text,                   -- as printed, when the invoice has one
  -- Where it came from, e.g. "gmail:<message id>" or "chat:<file hash>". The bot's scheduled Gmail run
  -- sees the same emails again every 6 hours; this lets a repeat be recognised and skipped.
  source_ref text unique,
  source text not null default 'connector', -- 'gmail' (a scheduled run) or 'chat' (shared by the owner)
  added_at timestamptz not null default now()
);

-- The same invoice can't land on two sessions.
create unique index charge_receipts_network_number_idx
  on public.charge_receipts (lower(network), invoice_number)
  where invoice_number is not null;

comment on table public.charge_receipts is
  'Third-party charging invoices, one per stream_charge_sessions row. Real billed amounts only, never estimates.';

alter table public.charge_receipts enable row level security;
-- No policies: only the service-role key (server side) can read or write.

revoke all on table public.charge_receipts from anon, authenticated;

-- Invoice files: a private bucket, read only through the owner-only route
-- /api/charging/receipt/[session id] with the service-role key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('charge-invoices', 'charge-invoices', false, 3145728, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- The MCP connector's token (any AI client: a Grok bot, Claude, ChatGPT), created and revoked in
-- Settings → Integrations. One row, like oauth_tokens. Only a SHA-256 hash is kept: the token is random
-- and long, so a fast hash is enough, and it can't be shown again.
create table public.connector_token (
  owner text primary key default 'tesla' check (owner = 'tesla'),
  token_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table public.connector_token enable row level security;
-- No policies: only the service-role key (server side) can read or write.

revoke all on table public.connector_token from anon, authenticated;

-- Rollback (manual, not run):
--   drop table if exists public.connector_token;
--   delete from storage.objects where bucket_id = 'charge-invoices'; delete from storage.buckets where id = 'charge-invoices';
--   drop table if exists public.charge_receipts;
