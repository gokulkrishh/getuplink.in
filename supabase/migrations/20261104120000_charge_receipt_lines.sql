-- An attached invoice's own lines (energy, fees, idle or parking, discounts, each tax), as the owner's AI
-- reads them off the invoice and sends them with attach_charge_invoice (lib/invoice-items.ts). Saved only
-- when they add up to amount_total within ₹1 and the taxes agree with them; otherwise the invoice is saved
-- without lines and the app keeps showing Before GST and GST.
--
-- line_items: { "path": invoice_path when they were sent (null with no file), "total": amount_total,
-- "lines": [{ label, kind, amount, kwh?, rate?, taxRate? }] }. The app uses it only while path still equals
-- invoice_path and the lines still add up to amount_total, so a replaced invoice never shows the old lines.
--
-- Additive and nullable, with no default: adding them doesn't rewrite the table. charge_receipts keeps its
-- RLS as it is (enabled, no policies, nothing granted to anon or authenticated): only the service-role key
-- reads or writes these columns, like the rest of the row.

alter table public.charge_receipts
  add column line_items jsonb check (line_items is null or jsonb_typeof(line_items) = 'object'),
  add column lines_at timestamptz;

comment on column public.charge_receipts.line_items is
  'The invoice''s printed lines as the owner''s AI sent them, only when they add up to amount_total. Null: none sent.';
comment on column public.charge_receipts.lines_at is 'When line_items was saved.';

notify pgrst, 'reload schema';

-- Rollback (manual, not run):
--   alter table public.charge_receipts drop column if exists lines_at, drop column if exists line_items;
