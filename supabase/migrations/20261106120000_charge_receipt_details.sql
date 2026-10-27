-- The rest of what an invoice prints, beyond its lines and the fixed columns: payment method, station and
-- charger IDs, booking ID, the operator's GSTIN and SAC, and whatever else a network adds. Each network
-- prints its own, so they're kept as label and value pairs rather than a column each (lib/invoice-details.ts).
-- Never anything about the owner: the AI is told not to send it and the app drops labels that look personal.
--
-- details: [{ "label": "Paid by", "value": "App Wallet" }, ...], at most 12.
--
-- Additive and nullable, with no default: adding it doesn't rewrite the table. charge_receipts keeps its RLS
-- as it is (enabled, no policies, nothing granted to anon or authenticated): only the service-role key reads
-- or writes it, like the rest of the row.

alter table public.charge_receipts
  add column details jsonb check (details is null or jsonb_typeof(details) = 'array');

comment on column public.charge_receipts.details is
  'Other details printed on the invoice, as [{label, value}] the owner''s AI sent. Null: none sent.';

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   alter table public.charge_receipts drop column if exists details;
