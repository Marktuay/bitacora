-- Rendiciones voluntarias de combustible: usuario gestor presenta, Auditor Corporativo verifica.
-- Solo se consulta mediante API servidor; ninguna clave de servicio va al navegador.
create table if not exists public.km_fuel_renditions (
 id uuid primary key default gen_random_uuid(),
 company text not null check (company in ('blokon','conaser','security','newcentury')),
 employee_id text not null,
 employee_name text not null,
 employee_area text,
 submitted_by uuid not null,
 vehicle_key text not null,
 fuel_date date not null,
 fuel_amount numeric(12,2) not null check (fuel_amount>0),
 fuel_price numeric(12,4) not null check (fuel_price>0),
 period_from date not null,
 period_to date not null,
 km_since numeric(14,2) not null check (km_since>=0),
 km_period numeric(14,2) not null check (km_period>=0),
 liters numeric(14,6) not null check (liters>0),
 km_per_liter numeric(14,6) not null check (km_per_liter>0),
 next_amount numeric(14,2) not null check (next_amount>=0),
 status text not null default 'Pendiente' check (status in ('Pendiente','Verificado','Anulado')),
 reviewed_at timestamptz,
 reviewed_by uuid,
 created_at timestamptz not null default now(),
 check (fuel_date<=period_to and period_from<=period_to)
);
create unique index if not exists km_fuel_renditions_active_once
 on public.km_fuel_renditions(company,employee_id,vehicle_key,period_from,period_to)
 where status<>'Anulado';
create index if not exists km_fuel_renditions_find_idx
 on public.km_fuel_renditions(company,period_to desc,employee_id);
alter table public.km_fuel_renditions enable row level security;
revoke all on public.km_fuel_renditions from anon,authenticated;
grant select,insert,update on public.km_fuel_renditions to service_role;
