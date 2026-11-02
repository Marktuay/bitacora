-- Un único vale de gasolina por colaborador y período de rendición.
-- Conserva las columnas antiguas y rendiciones anteriores.
alter table public.km_fuel_renditions
 add column if not exists voucher_number text,
 add column if not exists fuel_type text,
 add column if not exists odometer_initial numeric(14,2),
 add column if not exists odometer_final numeric(14,2),
 add column if not exists km_registered numeric(14,2),
 add column if not exists km_gap numeric(14,2);
alter table public.km_fuel_renditions
 add constraint km_fuel_renditions_gasoline_type_check
 check (fuel_type is null or fuel_type in ('regular','super'));
create unique index if not exists km_fuel_renditions_active_period_once
 on public.km_fuel_renditions(company,employee_id,period_from,period_to)
 where status <> 'Anulado';
-- La tabla permanece protegida: sin acceso directo para usuarios o visitantes.
alter table public.km_fuel_renditions enable row level security;
revoke all on public.km_fuel_renditions from anon,authenticated;
grant select,insert,update on public.km_fuel_renditions to service_role;
