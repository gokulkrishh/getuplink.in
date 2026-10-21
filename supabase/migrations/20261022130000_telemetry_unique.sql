-- The receiver now sends with on_conflict=vin,field,created_at so re-sent records (car resends,
-- retries after a timeout) are skipped. Remove any existing duplicates first, keeping the earliest row.
delete from public.telemetry_readings a
  using public.telemetry_readings b
  where a.vin = b.vin and a.field = b.field and a.created_at = b.created_at and a.id > b.id;

create unique index telemetry_readings_vin_field_created_key
  on public.telemetry_readings (vin, field, created_at);

-- The unique index also serves the old (vin, field, created_at desc) lookups.
drop index public.telemetry_readings_vin_field_created_idx;
