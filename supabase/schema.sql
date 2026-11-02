create extension if not exists pgcrypto;

create table if not exists public.employees_blokon (
  id text primary key,
  name text not null,
  area text,
  role text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles_blokon (
  id text primary key,
  type text not null,
  brand text,
  plate text not null unique,
  traccar_device_id text,
  rate numeric(10,2),
  employee_id text references public.employees_blokon(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bitacora_blokon (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  date date not null,
  employee_id text not null references public.employees_blokon(id),
  employee_name text not null,
  company text not null default 'BLOKON',
  area_employee text,
  vehicle_id text not null references public.vehicles_blokon(id),
  vehicle_type text,
  brand text,
  plate text,
  area_request text not null,
  origin text not null,
  destination text not null,
  time_start time not null,
  time_end time not null,
  km_initial numeric(12,2) not null,
  km_final numeric(12,2) not null,
  km_travel numeric(12,2) not null,
  management_type text,
  order_reference text,
  result text,
  employee_observation text,
  odometer_start_path text,
  odometer_end_path text,
  support_path text,
  km_traccar numeric(12,2),
  difference_km numeric(12,2),
  review_status text not null default 'Pendiente' check (review_status in ('Pendiente','Aprobado','Revisar','Rechazado')),
  constraint bitacora_blokon_km_check check (km_final >= km_initial)
);
create index if not exists bitacora_blokon_employee_date_idx on public.bitacora_blokon(employee_id,date desc);
create index if not exists bitacora_blokon_vehicle_date_idx on public.bitacora_blokon(vehicle_id,date desc);

alter table public.employees_blokon enable row level security;
alter table public.vehicles_blokon enable row level security;
alter table public.bitacora_blokon enable row level security;

create table if not exists public.employees_conaser (
  id text primary key,
  name text not null,
  area text,
  role text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles_conaser (
  id text primary key,
  type text not null,
  brand text,
  plate text not null unique,
  traccar_device_id text,
  rate numeric(10,2),
  employee_id text references public.employees_conaser(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bitacora_conaser (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  date date not null,
  employee_id text not null references public.employees_conaser(id),
  employee_name text not null,
  company text not null default 'CONASER',
  area_employee text,
  vehicle_id text not null references public.vehicles_conaser(id),
  vehicle_type text,
  brand text,
  plate text,
  area_request text not null,
  origin text not null,
  destination text not null,
  time_start time not null,
  time_end time not null,
  km_initial numeric(12,2) not null,
  km_final numeric(12,2) not null,
  km_travel numeric(12,2) not null,
  management_type text,
  order_reference text,
  result text,
  employee_observation text,
  odometer_start_path text,
  odometer_end_path text,
  support_path text,
  km_traccar numeric(12,2),
  difference_km numeric(12,2),
  review_status text not null default 'Pendiente' check (review_status in ('Pendiente','Aprobado','Revisar','Rechazado')),
  constraint bitacora_conaser_km_check check (km_final >= km_initial)
);
create index if not exists bitacora_conaser_employee_date_idx on public.bitacora_conaser(employee_id,date desc);
create index if not exists bitacora_conaser_vehicle_date_idx on public.bitacora_conaser(vehicle_id,date desc);

alter table public.employees_conaser enable row level security;
alter table public.vehicles_conaser enable row level security;
alter table public.bitacora_conaser enable row level security;

create table if not exists public.employees_security (
  id text primary key,
  name text not null,
  area text,
  role text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles_security (
  id text primary key,
  type text not null,
  brand text,
  plate text not null unique,
  traccar_device_id text,
  rate numeric(10,2),
  employee_id text references public.employees_security(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bitacora_security (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  date date not null,
  employee_id text not null references public.employees_security(id),
  employee_name text not null,
  company text not null default 'NEW CENTURY SECURITY',
  area_employee text,
  vehicle_id text not null references public.vehicles_security(id),
  vehicle_type text,
  brand text,
  plate text,
  area_request text not null,
  origin text not null,
  destination text not null,
  time_start time not null,
  time_end time not null,
  km_initial numeric(12,2) not null,
  km_final numeric(12,2) not null,
  km_travel numeric(12,2) not null,
  management_type text,
  order_reference text,
  result text,
  employee_observation text,
  odometer_start_path text,
  odometer_end_path text,
  support_path text,
  km_traccar numeric(12,2),
  difference_km numeric(12,2),
  review_status text not null default 'Pendiente' check (review_status in ('Pendiente','Aprobado','Revisar','Rechazado')),
  constraint bitacora_security_km_check check (km_final >= km_initial)
);
create index if not exists bitacora_security_employee_date_idx on public.bitacora_security(employee_id,date desc);
create index if not exists bitacora_security_vehicle_date_idx on public.bitacora_security(vehicle_id,date desc);

alter table public.employees_security enable row level security;
alter table public.vehicles_security enable row level security;
alter table public.bitacora_security enable row level security;

create or replace view public.bitacora_consolidada with (security_invoker=true) as
select * from public.bitacora_blokon
union all select * from public.bitacora_conaser
union all select * from public.bitacora_security;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('bitacora-soportes','bitacora-soportes',false,3145728,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
