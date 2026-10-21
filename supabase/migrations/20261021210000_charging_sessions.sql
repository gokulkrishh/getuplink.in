-- Supercharger sessions from the Fleet API charging history. Only written when TESLA_CHARGING=1.
create table public.charging_sessions (
  session_id text primary key, -- Tesla's sessionId
  vehicle_vin text,
  site_name text, -- e.g. "Bengaluru, Nexus Koramangala"
  started_at timestamptz,
  stopped_at timestamptz,
  energy_kwh numeric(8, 2), -- from the CHARGING fee's usageBase (kWh)
  cost_total numeric(10, 2), -- sum of fees' totalDue
  currency text, -- from the fees' currencyCode
  fees jsonb, -- raw fee lines
  invoices jsonb, -- [{ fileName, contentId, invoiceType }]
  raw jsonb, -- the whole history item as Tesla returned it
  fetched_at timestamptz not null default now()
);

create index charging_sessions_started_at_idx on public.charging_sessions (started_at desc);

-- RLS is on with no policies, like the other tables: only the service role (this server) can access it.
alter table public.charging_sessions enable row level security;
