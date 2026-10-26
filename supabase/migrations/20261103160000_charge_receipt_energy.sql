-- The energy line of a third-party charging invoice, before GST, as printed. With amount_total and gst it
-- splits what was paid into energy, other fees (session, parking, platform) and GST for the Spend
-- breakdown. Null when the invoice doesn't print an energy line or the AI didn't send one: never derived.

alter table public.charge_receipts
  add column energy_amount numeric(10, 2) check (energy_amount > 0);

alter table public.charge_receipts
  add constraint charge_receipts_energy_within_total
  check (energy_amount is null or energy_amount + coalesce(gst, 0) <= amount_total);

comment on column public.charge_receipts.energy_amount is
  'The invoice''s energy charge before GST, as printed. Fees = amount_total - gst - energy_amount when both are known.';

-- Rollback (manual, not run):
--   alter table public.charge_receipts drop constraint if exists charge_receipts_energy_within_total;
--   alter table public.charge_receipts drop column if exists energy_amount;
