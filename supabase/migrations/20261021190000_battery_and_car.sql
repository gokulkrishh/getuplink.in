-- Battery and car details from vehicle_data (charge_state, vehicle_config), recorded while the car is online.
alter table public.snapshots
  add column battery_level smallint, -- percent
  add column battery_range_km numeric(6, 1), -- Tesla reports miles; converted to km
  add column charging_state text, -- e.g. Charging, Complete, Disconnected, Stopped
  add column charge_limit smallint; -- percent

alter table public.vehicles
  add column model text, -- e.g. "Model Y", from vehicle_config.car_type
  add column exterior_color text, -- e.g. "Pearl White", from vehicle_config.exterior_color
  add column trim_badging text; -- raw vehicle_config.trim_badging, e.g. "74d" (not shown yet)
