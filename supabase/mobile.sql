-- Ejecutar en la base destino. Es aditivo: no modifica empleados, vehículos ni bitácoras.
create table if not exists public.km_mobile_devices (
 id uuid primary key,
 company text not null check(company in ('blokon','conaser','security')),
 employee_id text not null,
 vehicle_id text not null,
 label text not null,
 pair_hash text unique,
 pair_expires_at timestamptz,
 token_hash text unique,
 activated_at timestamptz,
 active boolean not null default true,
 traccar_unique_id text not null unique,
 traccar_device_id bigint,
 created_at timestamptz not null default now()
);
create table if not exists public.km_mobile_trips (
 id uuid primary key,
 device_id uuid not null references public.km_mobile_devices(id),
 company text not null check(company in ('blokon','conaser','security')),
 entry_id uuid not null unique,
 started_at timestamptz not null,
 ended_at timestamptz not null,
 synced_at timestamptz not null default now(),
 gps_flushed boolean,
 check(ended_at>=started_at)
);
create index if not exists km_mobile_trips_device_time on public.km_mobile_trips(device_id,started_at);
create index if not exists km_mobile_trips_company_entry on public.km_mobile_trips(company,entry_id);
alter table public.km_mobile_devices enable row level security;
alter table public.km_mobile_trips enable row level security;
revoke all on public.km_mobile_devices,public.km_mobile_trips from anon,authenticated;
grant all on public.km_mobile_devices,public.km_mobile_trips to service_role;
