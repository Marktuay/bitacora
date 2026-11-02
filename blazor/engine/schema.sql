-- Estructura extraída del proyecto actual, 17/10/2026. Sin datos ni contraseñas.
-- Ejecutar solo en una base NUEVA y dedicada a Bitácora KM.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS local_auth;
CREATE TABLE IF NOT EXISTS auth.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL,
 encrypted_password text NOT NULL, raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
 raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb, banned_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS local_users_email_key ON auth.users(lower(email));
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE TABLE IF NOT EXISTS local_auth.sessions (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 access_hash text NOT NULL UNIQUE,refresh_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,refresh_expires_at timestamptz NOT NULL,recovery boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS local_sessions_user ON local_auth.sessions(user_id);
CREATE TABLE IF NOT EXISTS local_auth.login_attempts(key text NOT NULL,attempted_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS local_attempt_key ON local_auth.login_attempts(key,attempted_at);
CREATE TABLE IF NOT EXISTS local_auth.recovery_tokens(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,code_hash text NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public."vehicles_blokon" (
 "id" text NOT NULL,
 "type" text NOT NULL,
 "brand" text,
 "plate" text,
 "traccar_device_id" text,
 "rate" numeric(10,2),
 "employee_id" text,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."vehicles_conaser" (
 "id" text NOT NULL,
 "type" text NOT NULL,
 "brand" text,
 "plate" text,
 "traccar_device_id" text,
 "rate" numeric(10,2),
 "employee_id" text,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."vehicles_security" (
 "id" text NOT NULL,
 "type" text NOT NULL,
 "brand" text,
 "plate" text,
 "traccar_device_id" text,
 "rate" numeric(10,2),
 "employee_id" text,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."employees_blokon" (
 "id" text NOT NULL,
 "name" text NOT NULL,
 "area" text,
 "role" text,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."bitacora_blokon" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "reviewed_at" timestamp with time zone,
 "date" date NOT NULL,
 "employee_id" text NOT NULL,
 "employee_name" text NOT NULL,
 "company" text DEFAULT 'BLOKON'::text NOT NULL,
 "area_employee" text,
 "vehicle_id" text NOT NULL,
 "vehicle_type" text,
 "brand" text,
 "plate" text,
 "area_request" text NOT NULL,
 "origin" text NOT NULL,
 "destination" text NOT NULL,
 "time_start" time without time zone NOT NULL,
 "time_end" time without time zone NOT NULL,
 "km_initial" numeric(12,2) NOT NULL,
 "km_final" numeric(12,2) NOT NULL,
 "km_travel" numeric(12,2) NOT NULL,
 "management_type" text,
 "order_reference" text,
 "result" text,
 "employee_observation" text,
 "support_path" text,
 "km_traccar" numeric(12,2),
 "difference_km" numeric(12,2),
 "review_status" text DEFAULT 'Pendiente'::text NOT NULL,
 "odometer_start_path" text NOT NULL,
 "odometer_end_path" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."employees_conaser" (
 "id" text NOT NULL,
 "name" text NOT NULL,
 "area" text,
 "role" text,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."bitacora_conaser" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "reviewed_at" timestamp with time zone,
 "date" date NOT NULL,
 "employee_id" text NOT NULL,
 "employee_name" text NOT NULL,
 "company" text DEFAULT 'CONASER'::text NOT NULL,
 "area_employee" text,
 "vehicle_id" text NOT NULL,
 "vehicle_type" text,
 "brand" text,
 "plate" text,
 "area_request" text NOT NULL,
 "origin" text NOT NULL,
 "destination" text NOT NULL,
 "time_start" time without time zone NOT NULL,
 "time_end" time without time zone NOT NULL,
 "km_initial" numeric(12,2) NOT NULL,
 "km_final" numeric(12,2) NOT NULL,
 "km_travel" numeric(12,2) NOT NULL,
 "management_type" text,
 "order_reference" text,
 "result" text,
 "employee_observation" text,
 "support_path" text,
 "km_traccar" numeric(12,2),
 "difference_km" numeric(12,2),
 "review_status" text DEFAULT 'Pendiente'::text NOT NULL,
 "odometer_start_path" text NOT NULL,
 "odometer_end_path" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."employees_security" (
 "id" text NOT NULL,
 "name" text NOT NULL,
 "area" text,
 "role" text,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."bitacora_security" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "reviewed_at" timestamp with time zone,
 "date" date NOT NULL,
 "employee_id" text NOT NULL,
 "employee_name" text NOT NULL,
 "company" text DEFAULT 'NEW CENTURY SECURITY'::text NOT NULL,
 "area_employee" text,
 "vehicle_id" text NOT NULL,
 "vehicle_type" text,
 "brand" text,
 "plate" text,
 "area_request" text NOT NULL,
 "origin" text NOT NULL,
 "destination" text NOT NULL,
 "time_start" time without time zone NOT NULL,
 "time_end" time without time zone NOT NULL,
 "km_initial" numeric(12,2) NOT NULL,
 "km_final" numeric(12,2) NOT NULL,
 "km_travel" numeric(12,2) NOT NULL,
 "management_type" text,
 "order_reference" text,
 "result" text,
 "employee_observation" text,
 "support_path" text,
 "km_traccar" numeric(12,2),
 "difference_km" numeric(12,2),
 "review_status" text DEFAULT 'Pendiente'::text NOT NULL,
 "odometer_start_path" text NOT NULL,
 "odometer_end_path" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."km_gps_positions" (
 "id" bigint NOT NULL,
 "device_id" uuid NOT NULL,
 "recorded_at" timestamp with time zone NOT NULL,
 "received_at" timestamp with time zone DEFAULT now() NOT NULL,
 "latitude" double precision NOT NULL,
 "longitude" double precision NOT NULL,
 "accuracy_m" double precision,
 "speed_kmh" double precision,
 "heading_deg" double precision,
 "altitude_m" double precision,
 "battery_pct" double precision,
 "valid" boolean DEFAULT true NOT NULL,
 "mock" boolean DEFAULT false NOT NULL,
 "source" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."km_mobile_trips" (
 "id" uuid NOT NULL,
 "device_id" uuid NOT NULL,
 "company" text NOT NULL,
 "entry_id" uuid NOT NULL,
 "started_at" timestamp with time zone NOT NULL,
 "ended_at" timestamp with time zone NOT NULL,
 "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
 "gps_flushed" boolean
);

CREATE TABLE IF NOT EXISTS public."km_traccar_relay_jobs" (
 "id" text NOT NULL,
 "operation" text NOT NULL,
 "payload" jsonb NOT NULL,
 "status" text DEFAULT 'queued'::text NOT NULL,
 "response" jsonb,
 "attempts" integer DEFAULT 0 NOT NULL,
 "available_at" timestamp with time zone DEFAULT now() NOT NULL,
 "lease_until" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public."km_mobile_devices" (
 "id" uuid NOT NULL,
 "company" text NOT NULL,
 "employee_id" text NOT NULL,
 "vehicle_id" text NOT NULL,
 "label" text NOT NULL,
 "pair_hash" text,
 "pair_expires_at" timestamp with time zone,
 "token_hash" text,
 "activated_at" timestamp with time zone,
 "active" boolean DEFAULT true NOT NULL,
 "traccar_unique_id" text NOT NULL,
 "traccar_device_id" bigint,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."km_gps_credentials" (
 "device_id" uuid NOT NULL,
 "token_hash" text NOT NULL,
 "enabled" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "last_received_at" timestamp with time zone,
 "rate_window" timestamp with time zone,
 "rate_count" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public."km_runtime_config" (
 "key" text NOT NULL,
 "value" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."km_report_access" (
 "user_id" uuid NOT NULL,
 "company" text NOT NULL,
 "employee_id" text NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "granted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."km_traccar_relay_status" (
 "id" text NOT NULL,
 "last_seen" timestamp with time zone NOT NULL,
 "traccar_online" boolean NOT NULL,
 "version" text NOT NULL
);

CREATE TABLE IF NOT EXISTS public."vehicles_newcentury" (
 "id" text NOT NULL,
 "type" text NOT NULL,
 "brand" text,
 "plate" text,
 "traccar_device_id" text,
 "rate" numeric(10,2),
 "employee_id" text,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."employees_newcentury" (
 "id" text NOT NULL,
 "name" text NOT NULL,
 "area" text,
 "role" text,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."km_employee_registrations" (
 "request_id" uuid NOT NULL,
 "actor_id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "company" text NOT NULL,
 "employee_id" text NOT NULL,
 "vehicle_id" text NOT NULL,
 "payload" jsonb NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."bitacora_newcentury" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "reviewed_at" timestamp with time zone,
 "date" date NOT NULL,
 "employee_id" text NOT NULL,
 "employee_name" text NOT NULL,
 "company" text DEFAULT 'NEW CENTURY'::text NOT NULL,
 "area_employee" text,
 "vehicle_id" text NOT NULL,
 "vehicle_type" text,
 "brand" text,
 "plate" text,
 "area_request" text NOT NULL,
 "origin" text NOT NULL,
 "destination" text NOT NULL,
 "time_start" time without time zone,
 "time_end" time without time zone,
 "km_initial" numeric(12,2),
 "km_final" numeric(12,2),
 "km_travel" numeric(12,2),
 "management_type" text,
 "order_reference" text,
 "result" text,
 "employee_observation" text,
 "support_path" text,
 "km_traccar" numeric(12,2),
 "difference_km" numeric(12,2),
 "review_status" text DEFAULT 'Pendiente'::text NOT NULL,
 "odometer_start_path" text,
 "odometer_end_path" text
);

CREATE TABLE IF NOT EXISTS public."km_fuel_renditions" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "company" text NOT NULL,
 "employee_id" text NOT NULL,
 "employee_name" text NOT NULL,
 "employee_area" text,
 "submitted_by" uuid NOT NULL,
 "vehicle_key" text NOT NULL,
 "fuel_date" date NOT NULL,
 "fuel_amount" numeric(12,2) NOT NULL,
 "fuel_price" numeric(12,4) NOT NULL,
 "period_from" date NOT NULL,
 "period_to" date NOT NULL,
 "km_since" numeric(14,2) NOT NULL,
 "km_period" numeric(14,2) NOT NULL,
 "liters" numeric(14,6) NOT NULL,
 "km_per_liter" numeric(14,6) NOT NULL,
 "next_amount" numeric(14,2) NOT NULL,
 "status" text DEFAULT 'Pendiente'::text NOT NULL,
 "reviewed_at" timestamp with time zone,
 "reviewed_by" uuid,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "voucher_number" text,
 "fuel_type" text,
 "odometer_initial" numeric(14,2),
 "odometer_final" numeric(14,2),
 "km_registered" numeric(14,2),
 "km_gap" numeric(14,2),
 "voucher_date" date
);

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_blokon_pkey' AND conrelid='public.vehicles_blokon'::regclass) THEN ALTER TABLE public."vehicles_blokon" ADD CONSTRAINT "vehicles_blokon_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_blokon_plate_key' AND conrelid='public.vehicles_blokon'::regclass) THEN ALTER TABLE public."vehicles_blokon" ADD CONSTRAINT "vehicles_blokon_plate_key" UNIQUE (plate); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_conaser_pkey' AND conrelid='public.vehicles_conaser'::regclass) THEN ALTER TABLE public."vehicles_conaser" ADD CONSTRAINT "vehicles_conaser_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_conaser_plate_key' AND conrelid='public.vehicles_conaser'::regclass) THEN ALTER TABLE public."vehicles_conaser" ADD CONSTRAINT "vehicles_conaser_plate_key" UNIQUE (plate); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_security_pkey' AND conrelid='public.vehicles_security'::regclass) THEN ALTER TABLE public."vehicles_security" ADD CONSTRAINT "vehicles_security_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_security_plate_key' AND conrelid='public.vehicles_security'::regclass) THEN ALTER TABLE public."vehicles_security" ADD CONSTRAINT "vehicles_security_plate_key" UNIQUE (plate); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_blokon_pkey' AND conrelid='public.employees_blokon'::regclass) THEN ALTER TABLE public."employees_blokon" ADD CONSTRAINT "employees_blokon_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_blokon_km_check' AND conrelid='public.bitacora_blokon'::regclass) THEN ALTER TABLE public."bitacora_blokon" ADD CONSTRAINT "bitacora_blokon_km_check" CHECK ((km_final >= km_initial)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_blokon_pkey' AND conrelid='public.bitacora_blokon'::regclass) THEN ALTER TABLE public."bitacora_blokon" ADD CONSTRAINT "bitacora_blokon_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_blokon_review_status_check' AND conrelid='public.bitacora_blokon'::regclass) THEN ALTER TABLE public."bitacora_blokon" ADD CONSTRAINT "bitacora_blokon_review_status_check" CHECK ((review_status = ANY (ARRAY['Pendiente'::text, 'Aprobado'::text, 'Revisar'::text, 'Rechazado'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_conaser_pkey' AND conrelid='public.employees_conaser'::regclass) THEN ALTER TABLE public."employees_conaser" ADD CONSTRAINT "employees_conaser_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_conaser_km_check' AND conrelid='public.bitacora_conaser'::regclass) THEN ALTER TABLE public."bitacora_conaser" ADD CONSTRAINT "bitacora_conaser_km_check" CHECK ((km_final >= km_initial)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_conaser_pkey' AND conrelid='public.bitacora_conaser'::regclass) THEN ALTER TABLE public."bitacora_conaser" ADD CONSTRAINT "bitacora_conaser_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_conaser_review_status_check' AND conrelid='public.bitacora_conaser'::regclass) THEN ALTER TABLE public."bitacora_conaser" ADD CONSTRAINT "bitacora_conaser_review_status_check" CHECK ((review_status = ANY (ARRAY['Pendiente'::text, 'Aprobado'::text, 'Revisar'::text, 'Rechazado'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_security_pkey' AND conrelid='public.employees_security'::regclass) THEN ALTER TABLE public."employees_security" ADD CONSTRAINT "employees_security_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_security_km_check' AND conrelid='public.bitacora_security'::regclass) THEN ALTER TABLE public."bitacora_security" ADD CONSTRAINT "bitacora_security_km_check" CHECK ((km_final >= km_initial)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_security_pkey' AND conrelid='public.bitacora_security'::regclass) THEN ALTER TABLE public."bitacora_security" ADD CONSTRAINT "bitacora_security_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_security_review_status_check' AND conrelid='public.bitacora_security'::regclass) THEN ALTER TABLE public."bitacora_security" ADD CONSTRAINT "bitacora_security_review_status_check" CHECK ((review_status = ANY (ARRAY['Pendiente'::text, 'Aprobado'::text, 'Revisar'::text, 'Rechazado'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_accuracy_m_check' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_accuracy_m_check" CHECK (((accuracy_m >= (0)::double precision) AND (accuracy_m < (100000)::double precision))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_altitude_m_check' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_altitude_m_check" CHECK (((altitude_m >= ('-1500'::integer)::double precision) AND (altitude_m <= (100000)::double precision))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_battery_pct_check' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_battery_pct_check" CHECK (((battery_pct >= (0)::double precision) AND (battery_pct <= (100)::double precision))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_device_id_recorded_at_latitude_longitude_key' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_device_id_recorded_at_latitude_longitude_key" UNIQUE (device_id, recorded_at, latitude, longitude); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_heading_deg_check' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_heading_deg_check" CHECK (((heading_deg >= (0)::double precision) AND (heading_deg <= (360)::double precision))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_latitude_check' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_latitude_check" CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_longitude_check' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_longitude_check" CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_pkey' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_source_check' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_source_check" CHECK ((source = ANY (ARRAY['osmand'::text, 'traccar-json'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_speed_kmh_check' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_speed_kmh_check" CHECK (((speed_kmh >= (0)::double precision) AND (speed_kmh < (2000)::double precision))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_trips_check' AND conrelid='public.km_mobile_trips'::regclass) THEN ALTER TABLE public."km_mobile_trips" ADD CONSTRAINT "km_mobile_trips_check" CHECK ((ended_at >= started_at)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_trips_company_check' AND conrelid='public.km_mobile_trips'::regclass) THEN ALTER TABLE public."km_mobile_trips" ADD CONSTRAINT "km_mobile_trips_company_check" CHECK ((company = ANY (ARRAY['blokon'::text, 'conaser'::text, 'security'::text, 'newcentury'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_trips_entry_id_key' AND conrelid='public.km_mobile_trips'::regclass) THEN ALTER TABLE public."km_mobile_trips" ADD CONSTRAINT "km_mobile_trips_entry_id_key" UNIQUE (entry_id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_trips_pkey' AND conrelid='public.km_mobile_trips'::regclass) THEN ALTER TABLE public."km_mobile_trips" ADD CONSTRAINT "km_mobile_trips_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_traccar_relay_jobs_id_check' AND conrelid='public.km_traccar_relay_jobs'::regclass) THEN ALTER TABLE public."km_traccar_relay_jobs" ADD CONSTRAINT "km_traccar_relay_jobs_id_check" CHECK ((length(id) = 64)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_traccar_relay_jobs_operation_check' AND conrelid='public.km_traccar_relay_jobs'::regclass) THEN ALTER TABLE public."km_traccar_relay_jobs" ADD CONSTRAINT "km_traccar_relay_jobs_operation_check" CHECK ((operation = ANY (ARRAY['position'::text, 'device'::text, 'route'::text, 'summary'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_traccar_relay_jobs_pkey' AND conrelid='public.km_traccar_relay_jobs'::regclass) THEN ALTER TABLE public."km_traccar_relay_jobs" ADD CONSTRAINT "km_traccar_relay_jobs_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_traccar_relay_jobs_status_check' AND conrelid='public.km_traccar_relay_jobs'::regclass) THEN ALTER TABLE public."km_traccar_relay_jobs" ADD CONSTRAINT "km_traccar_relay_jobs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'done'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_devices_company_check' AND conrelid='public.km_mobile_devices'::regclass) THEN ALTER TABLE public."km_mobile_devices" ADD CONSTRAINT "km_mobile_devices_company_check" CHECK ((company = ANY (ARRAY['blokon'::text, 'conaser'::text, 'security'::text, 'newcentury'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_devices_pair_hash_key' AND conrelid='public.km_mobile_devices'::regclass) THEN ALTER TABLE public."km_mobile_devices" ADD CONSTRAINT "km_mobile_devices_pair_hash_key" UNIQUE (pair_hash); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_devices_pkey' AND conrelid='public.km_mobile_devices'::regclass) THEN ALTER TABLE public."km_mobile_devices" ADD CONSTRAINT "km_mobile_devices_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_devices_token_hash_key' AND conrelid='public.km_mobile_devices'::regclass) THEN ALTER TABLE public."km_mobile_devices" ADD CONSTRAINT "km_mobile_devices_token_hash_key" UNIQUE (token_hash); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_devices_traccar_unique_id_key' AND conrelid='public.km_mobile_devices'::regclass) THEN ALTER TABLE public."km_mobile_devices" ADD CONSTRAINT "km_mobile_devices_traccar_unique_id_key" UNIQUE (traccar_unique_id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_credentials_pkey' AND conrelid='public.km_gps_credentials'::regclass) THEN ALTER TABLE public."km_gps_credentials" ADD CONSTRAINT "km_gps_credentials_pkey" PRIMARY KEY (device_id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_credentials_token_hash_check' AND conrelid='public.km_gps_credentials'::regclass) THEN ALTER TABLE public."km_gps_credentials" ADD CONSTRAINT "km_gps_credentials_token_hash_check" CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_credentials_token_hash_key' AND conrelid='public.km_gps_credentials'::regclass) THEN ALTER TABLE public."km_gps_credentials" ADD CONSTRAINT "km_gps_credentials_token_hash_key" UNIQUE (token_hash); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_runtime_config_pkey' AND conrelid='public.km_runtime_config'::regclass) THEN ALTER TABLE public."km_runtime_config" ADD CONSTRAINT "km_runtime_config_pkey" PRIMARY KEY (key); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_report_access_company_check' AND conrelid='public.km_report_access'::regclass) THEN ALTER TABLE public."km_report_access" ADD CONSTRAINT "km_report_access_company_check" CHECK ((company = ANY (ARRAY['blokon'::text, 'conaser'::text, 'security'::text, 'newcentury'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_report_access_pkey' AND conrelid='public.km_report_access'::regclass) THEN ALTER TABLE public."km_report_access" ADD CONSTRAINT "km_report_access_pkey" PRIMARY KEY (user_id, company, employee_id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_traccar_relay_status_id_check' AND conrelid='public.km_traccar_relay_status'::regclass) THEN ALTER TABLE public."km_traccar_relay_status" ADD CONSTRAINT "km_traccar_relay_status_id_check" CHECK ((id = 'pilot'::text)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_traccar_relay_status_pkey' AND conrelid='public.km_traccar_relay_status'::regclass) THEN ALTER TABLE public."km_traccar_relay_status" ADD CONSTRAINT "km_traccar_relay_status_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_newcentury_pkey' AND conrelid='public.vehicles_newcentury'::regclass) THEN ALTER TABLE public."vehicles_newcentury" ADD CONSTRAINT "vehicles_newcentury_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_newcentury_plate_key' AND conrelid='public.vehicles_newcentury'::regclass) THEN ALTER TABLE public."vehicles_newcentury" ADD CONSTRAINT "vehicles_newcentury_plate_key" UNIQUE (plate); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_newcentury_pkey' AND conrelid='public.employees_newcentury'::regclass) THEN ALTER TABLE public."employees_newcentury" ADD CONSTRAINT "employees_newcentury_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_employee_registrations_company_check' AND conrelid='public.km_employee_registrations'::regclass) THEN ALTER TABLE public."km_employee_registrations" ADD CONSTRAINT "km_employee_registrations_company_check" CHECK ((company = ANY (ARRAY['blokon'::text, 'conaser'::text, 'security'::text, 'newcentury'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_employee_registrations_pkey' AND conrelid='public.km_employee_registrations'::regclass) THEN ALTER TABLE public."km_employee_registrations" ADD CONSTRAINT "km_employee_registrations_pkey" PRIMARY KEY (request_id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_blokon_km_check' AND conrelid='public.bitacora_newcentury'::regclass) THEN ALTER TABLE public."bitacora_newcentury" ADD CONSTRAINT "bitacora_blokon_km_check" CHECK ((km_final >= km_initial)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_blokon_review_status_check' AND conrelid='public.bitacora_newcentury'::regclass) THEN ALTER TABLE public."bitacora_newcentury" ADD CONSTRAINT "bitacora_blokon_review_status_check" CHECK ((review_status = ANY (ARRAY['Pendiente'::text, 'Aprobado'::text, 'Revisar'::text, 'Rechazado'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_newcentury_pkey' AND conrelid='public.bitacora_newcentury'::regclass) THEN ALTER TABLE public."bitacora_newcentury" ADD CONSTRAINT "bitacora_newcentury_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_newcentury_required_or_two_oct_2026_historical' AND conrelid='public.bitacora_newcentury'::regclass) THEN ALTER TABLE public."bitacora_newcentury" ADD CONSTRAINT "bitacora_newcentury_required_or_two_oct_2026_historical" CHECK ((((time_start IS NOT NULL) AND (time_end IS NOT NULL) AND (km_initial IS NOT NULL) AND (km_final IS NOT NULL) AND (km_travel IS NOT NULL) AND (odometer_start_path IS NOT NULL) AND (odometer_end_path IS NOT NULL)) OR ((employee_id = 'NEW-c99ac78a86f14357a7718b712d92214c'::text) AND (((id = 'cb335120-4bbe-4c13-b150-837657652d48'::uuid) AND (date = '2026-10-01'::date)) OR ((id = '408597a9-bd25-4eef-8a7c-e01a42307e71'::uuid) AND (date = '2026-10-10'::date))) AND (origin = 'Bolonia'::text) AND (destination = 'Blok on Mateare'::text) AND (order_reference = 'EXCEPCION_HISTORICA_20261012'::text)) OR ((employee_id = 'NEW-bfafaa9052864ce9b55f0a72cce59fc4'::text) AND (vehicle_id = 'VEH-bfafaa9052864ce9b55f0a72cce59fc4'::text) AND (order_reference = 'EXCEPCION_HISTORICA_ANDREW_20261014'::text) AND (km_travel = (km_final - km_initial)) AND ((km_traccar IS NULL) OR (km_traccar = km_travel)) AND ((difference_km IS NULL) OR (difference_km = (0)::numeric)) AND (employee_observation IS NULL) AND ((((((((date = '2026-09-29'::date) AND (km_initial = (34066)::numeric) AND (km_final = (34084)::numeric)) OR ((date = '2026-09-29'::date) AND (km_initial = (34084)::numeric) AND (km_final = (34100)::numeric))) OR ((date = '2026-09-30'::date) AND (km_initial = (34100)::numeric) AND (km_final = (34118)::numeric))) OR ((date = '2026-09-30'::date) AND (km_initial = (34118)::numeric) AND (km_final = (34134)::numeric))) OR ((date = '2026-10-01'::date) AND (km_initial = (34134)::numeric) AND (km_final = (34152)::numeric))) OR ((date = '2026-10-01'::date) AND (km_initial = (34152)::numeric) AND (km_final = (34168)::numeric))) OR ((date = '2026-10-02'::date) AND (km_initial = (34168)::numeric) AND (km_final = (34186)::numeric)))))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_check" CHECK (((fuel_date <= period_to) AND (period_from <= period_to))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_company_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_company_check" CHECK ((company = ANY (ARRAY['blokon'::text, 'conaser'::text, 'security'::text, 'newcentury'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_fuel_amount_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_fuel_amount_check" CHECK ((fuel_amount > (0)::numeric)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_fuel_price_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_fuel_price_check" CHECK ((fuel_price > (0)::numeric)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_gasoline_type_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_gasoline_type_check" CHECK (((fuel_type IS NULL) OR (fuel_type = ANY (ARRAY['super'::text, 'regular'::text, 'diesel'::text])))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_km_per_liter_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_km_per_liter_check" CHECK ((km_per_liter > (0)::numeric)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_km_period_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_km_period_check" CHECK ((km_period >= (0)::numeric)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_km_since_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_km_since_check" CHECK ((km_since >= (0)::numeric)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_liters_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_liters_check" CHECK ((liters > (0)::numeric)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_next_amount_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_next_amount_check" CHECK ((next_amount >= (0)::numeric)); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_pkey' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_pkey" PRIMARY KEY (id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_fuel_renditions_status_check' AND conrelid='public.km_fuel_renditions'::regclass) THEN ALTER TABLE public."km_fuel_renditions" ADD CONSTRAINT "km_fuel_renditions_status_check" CHECK ((status = ANY (ARRAY['Pendiente'::text, 'Verificado'::text, 'Anulado'::text]))); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_blokon_employee_id_fkey' AND conrelid='public.vehicles_blokon'::regclass) THEN ALTER TABLE public."vehicles_blokon" ADD CONSTRAINT "vehicles_blokon_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees_blokon(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_conaser_employee_id_fkey' AND conrelid='public.vehicles_conaser'::regclass) THEN ALTER TABLE public."vehicles_conaser" ADD CONSTRAINT "vehicles_conaser_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees_conaser(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_security_employee_id_fkey' AND conrelid='public.vehicles_security'::regclass) THEN ALTER TABLE public."vehicles_security" ADD CONSTRAINT "vehicles_security_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees_security(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_blokon_employee_id_fkey' AND conrelid='public.bitacora_blokon'::regclass) THEN ALTER TABLE public."bitacora_blokon" ADD CONSTRAINT "bitacora_blokon_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees_blokon(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_blokon_vehicle_id_fkey' AND conrelid='public.bitacora_blokon'::regclass) THEN ALTER TABLE public."bitacora_blokon" ADD CONSTRAINT "bitacora_blokon_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES vehicles_blokon(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_conaser_employee_id_fkey' AND conrelid='public.bitacora_conaser'::regclass) THEN ALTER TABLE public."bitacora_conaser" ADD CONSTRAINT "bitacora_conaser_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees_conaser(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_conaser_vehicle_id_fkey' AND conrelid='public.bitacora_conaser'::regclass) THEN ALTER TABLE public."bitacora_conaser" ADD CONSTRAINT "bitacora_conaser_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES vehicles_conaser(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_security_employee_id_fkey' AND conrelid='public.bitacora_security'::regclass) THEN ALTER TABLE public."bitacora_security" ADD CONSTRAINT "bitacora_security_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees_security(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_security_vehicle_id_fkey' AND conrelid='public.bitacora_security'::regclass) THEN ALTER TABLE public."bitacora_security" ADD CONSTRAINT "bitacora_security_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES vehicles_security(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_positions_device_id_fkey' AND conrelid='public.km_gps_positions'::regclass) THEN ALTER TABLE public."km_gps_positions" ADD CONSTRAINT "km_gps_positions_device_id_fkey" FOREIGN KEY (device_id) REFERENCES km_mobile_devices(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_mobile_trips_device_id_fkey' AND conrelid='public.km_mobile_trips'::regclass) THEN ALTER TABLE public."km_mobile_trips" ADD CONSTRAINT "km_mobile_trips_device_id_fkey" FOREIGN KEY (device_id) REFERENCES km_mobile_devices(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_gps_credentials_device_id_fkey' AND conrelid='public.km_gps_credentials'::regclass) THEN ALTER TABLE public."km_gps_credentials" ADD CONSTRAINT "km_gps_credentials_device_id_fkey" FOREIGN KEY (device_id) REFERENCES km_mobile_devices(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_report_access_user_id_fkey' AND conrelid='public.km_report_access'::regclass) THEN ALTER TABLE public."km_report_access" ADD CONSTRAINT "km_report_access_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_newcentury_employee_id_fkey' AND conrelid='public.vehicles_newcentury'::regclass) THEN ALTER TABLE public."vehicles_newcentury" ADD CONSTRAINT "vehicles_newcentury_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees_newcentury(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_newcentury_employee_id_fkey' AND conrelid='public.bitacora_newcentury'::regclass) THEN ALTER TABLE public."bitacora_newcentury" ADD CONSTRAINT "bitacora_newcentury_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES employees_newcentury(id); END IF; END $m$;

DO $m$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bitacora_newcentury_vehicle_id_fkey' AND conrelid='public.bitacora_newcentury'::regclass) THEN ALTER TABLE public."bitacora_newcentury" ADD CONSTRAINT "bitacora_newcentury_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES vehicles_newcentury(id); END IF; END $m$;

CREATE INDEX IF NOT EXISTS vehicles_blokon_employee_id_idx ON public.vehicles_blokon USING btree (employee_id);

CREATE INDEX IF NOT EXISTS vehicles_conaser_employee_id_idx ON public.vehicles_conaser USING btree (employee_id);

CREATE INDEX IF NOT EXISTS vehicles_security_employee_id_idx ON public.vehicles_security USING btree (employee_id);

CREATE INDEX IF NOT EXISTS bitacora_blokon_employee_date_idx ON public.bitacora_blokon USING btree (employee_id, date DESC);

CREATE INDEX IF NOT EXISTS bitacora_blokon_vehicle_date_idx ON public.bitacora_blokon USING btree (vehicle_id, date DESC);

CREATE INDEX IF NOT EXISTS bitacora_conaser_employee_date_idx ON public.bitacora_conaser USING btree (employee_id, date DESC);

CREATE INDEX IF NOT EXISTS bitacora_conaser_vehicle_date_idx ON public.bitacora_conaser USING btree (vehicle_id, date DESC);

CREATE INDEX IF NOT EXISTS bitacora_security_employee_date_idx ON public.bitacora_security USING btree (employee_id, date DESC);

CREATE INDEX IF NOT EXISTS bitacora_security_vehicle_date_idx ON public.bitacora_security USING btree (vehicle_id, date DESC);

CREATE INDEX IF NOT EXISTS km_mobile_trips_device_time ON public.km_mobile_trips USING btree (device_id, started_at);

CREATE INDEX IF NOT EXISTS km_mobile_trips_company_entry ON public.km_mobile_trips USING btree (company, entry_id);

CREATE INDEX IF NOT EXISTS km_traccar_relay_pending ON public.km_traccar_relay_jobs USING btree (available_at, created_at) WHERE (status <> 'done'::text);

CREATE INDEX IF NOT EXISTS km_traccar_relay_expiry ON public.km_traccar_relay_jobs USING btree (expires_at);

CREATE INDEX IF NOT EXISTS vehicles_newcentury_employee_id_idx ON public.vehicles_newcentury USING btree (employee_id);

CREATE INDEX IF NOT EXISTS bitacora_newcentury_employee_id_date_idx ON public.bitacora_newcentury USING btree (employee_id, date DESC);

CREATE INDEX IF NOT EXISTS bitacora_newcentury_vehicle_id_date_idx ON public.bitacora_newcentury USING btree (vehicle_id, date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS bitacora_newcentury_andrew_historical_unique ON public.bitacora_newcentury USING btree (employee_id, date, km_initial, km_final) WHERE ((employee_id = 'NEW-bfafaa9052864ce9b55f0a72cce59fc4'::text) AND (order_reference = 'EXCEPCION_HISTORICA_ANDREW_20261014'::text));

CREATE UNIQUE INDEX IF NOT EXISTS km_fuel_renditions_active_once ON public.km_fuel_renditions USING btree (company, employee_id, vehicle_key, period_from, period_to) WHERE (status <> 'Anulado'::text);

CREATE INDEX IF NOT EXISTS km_fuel_renditions_find_idx ON public.km_fuel_renditions USING btree (company, period_to DESC, employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS km_fuel_renditions_active_period_once ON public.km_fuel_renditions USING btree (company, employee_id, period_from, period_to) WHERE (status <> 'Anulado'::text);

CREATE OR REPLACE VIEW public."bitacora_consolidada" AS SELECT bitacora_blokon.id,
    bitacora_blokon.created_at,
    bitacora_blokon.reviewed_at,
    bitacora_blokon.date,
    bitacora_blokon.employee_id,
    bitacora_blokon.employee_name,
    bitacora_blokon.company,
    bitacora_blokon.area_employee,
    bitacora_blokon.vehicle_id,
    bitacora_blokon.vehicle_type,
    bitacora_blokon.brand,
    bitacora_blokon.plate,
    bitacora_blokon.area_request,
    bitacora_blokon.origin,
    bitacora_blokon.destination,
    bitacora_blokon.time_start,
    bitacora_blokon.time_end,
    bitacora_blokon.km_initial,
    bitacora_blokon.km_final,
    bitacora_blokon.km_travel,
    bitacora_blokon.management_type,
    bitacora_blokon.order_reference,
    bitacora_blokon.result,
    bitacora_blokon.employee_observation,
    bitacora_blokon.support_path,
    bitacora_blokon.km_traccar,
    bitacora_blokon.difference_km,
    bitacora_blokon.review_status,
    bitacora_blokon.odometer_start_path,
    bitacora_blokon.odometer_end_path
   FROM bitacora_blokon
UNION ALL
 SELECT bitacora_conaser.id,
    bitacora_conaser.created_at,
    bitacora_conaser.reviewed_at,
    bitacora_conaser.date,
    bitacora_conaser.employee_id,
    bitacora_conaser.employee_name,
    bitacora_conaser.company,
    bitacora_conaser.area_employee,
    bitacora_conaser.vehicle_id,
    bitacora_conaser.vehicle_type,
    bitacora_conaser.brand,
    bitacora_conaser.plate,
    bitacora_conaser.area_request,
    bitacora_conaser.origin,
    bitacora_conaser.destination,
    bitacora_conaser.time_start,
    bitacora_conaser.time_end,
    bitacora_conaser.km_initial,
    bitacora_conaser.km_final,
    bitacora_conaser.km_travel,
    bitacora_conaser.management_type,
    bitacora_conaser.order_reference,
    bitacora_conaser.result,
    bitacora_conaser.employee_observation,
    bitacora_conaser.support_path,
    bitacora_conaser.km_traccar,
    bitacora_conaser.difference_km,
    bitacora_conaser.review_status,
    bitacora_conaser.odometer_start_path,
    bitacora_conaser.odometer_end_path
   FROM bitacora_conaser
UNION ALL
 SELECT bitacora_security.id,
    bitacora_security.created_at,
    bitacora_security.reviewed_at,
    bitacora_security.date,
    bitacora_security.employee_id,
    bitacora_security.employee_name,
    bitacora_security.company,
    bitacora_security.area_employee,
    bitacora_security.vehicle_id,
    bitacora_security.vehicle_type,
    bitacora_security.brand,
    bitacora_security.plate,
    bitacora_security.area_request,
    bitacora_security.origin,
    bitacora_security.destination,
    bitacora_security.time_start,
    bitacora_security.time_end,
    bitacora_security.km_initial,
    bitacora_security.km_final,
    bitacora_security.km_travel,
    bitacora_security.management_type,
    bitacora_security.order_reference,
    bitacora_security.result,
    bitacora_security.employee_observation,
    bitacora_security.support_path,
    bitacora_security.km_traccar,
    bitacora_security.difference_km,
    bitacora_security.review_status,
    bitacora_security.odometer_start_path,
    bitacora_security.odometer_end_path
   FROM bitacora_security
UNION ALL
 SELECT bitacora_newcentury.id,
    bitacora_newcentury.created_at,
    bitacora_newcentury.reviewed_at,
    bitacora_newcentury.date,
    bitacora_newcentury.employee_id,
    bitacora_newcentury.employee_name,
    bitacora_newcentury.company,
    bitacora_newcentury.area_employee,
    bitacora_newcentury.vehicle_id,
    bitacora_newcentury.vehicle_type,
    bitacora_newcentury.brand,
    bitacora_newcentury.plate,
    bitacora_newcentury.area_request,
    bitacora_newcentury.origin,
    bitacora_newcentury.destination,
    bitacora_newcentury.time_start,
    bitacora_newcentury.time_end,
    bitacora_newcentury.km_initial,
    bitacora_newcentury.km_final,
    bitacora_newcentury.km_travel,
    bitacora_newcentury.management_type,
    bitacora_newcentury.order_reference,
    bitacora_newcentury.result,
    bitacora_newcentury.employee_observation,
    bitacora_newcentury.support_path,
    bitacora_newcentury.km_traccar,
    bitacora_newcentury.difference_km,
    bitacora_newcentury.review_status,
    bitacora_newcentury.odometer_start_path,
    bitacora_newcentury.odometer_end_path
   FROM bitacora_newcentury;

CREATE OR REPLACE FUNCTION public.km_claim_traccar_relay_jobs(p_limit integer DEFAULT 30)
 RETURNS SETOF km_traccar_relay_jobs
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 update public.km_traccar_relay_jobs j
 set status='processing', lease_until=now()+interval '45 seconds', attempts=j.attempts+1
 where j.id in (
  select q.id from public.km_traccar_relay_jobs q
  where q.expires_at>now() and q.available_at<=now()
    and (q.status='queued' or q.status='processing' and q.lease_until<now())
  order by q.available_at,q.created_at
  for update skip locked limit greatest(1,least(p_limit,100))
 ) returning j.*
$function$;

CREATE OR REPLACE FUNCTION public.km_gps_trip_report(p_trip_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 t public.km_mobile_trips%rowtype;
 p record;
 anchor_lat float8; anchor_lon float8; anchor_accuracy float8; anchor_time timestamptz;
 first_time timestamptz; last_time timestamptz;
 prev_lat float8; prev_lon float8; step_distance float8;
 meters float8:=0; distance float8; seconds float8; threshold float8;
 total integer:=0; accepted integer:=0; rejected integer:=0; jitter integer:=0;
 missing_accuracy integer:=0; gaps integer:=0; conflicts integer:=0;
 coords jsonb:='[]'::jsonb; segments jsonb:='[]'::jsonb;
 duration float8; status text;
begin
 select * into t from public.km_mobile_trips where id=p_trip_id;
 if not found then return jsonb_build_object('ok',false,'code','TRIP_NOT_FOUND'); end if;
 -- Include only this device's fixes captured inside the recorded trip interval.
 -- Late uploads remain visible when the report is queried again.
 for p in select * from public.km_gps_positions
 where device_id=t.device_id and recorded_at>=t.started_at and recorded_at<=t.ended_at
 order by recorded_at,id
 loop
   total:=total+1;
   if not p.valid or p.mock or p.accuracy_m>50 or p.speed_kmh>160 then
     rejected:=rejected+1; continue;
   end if;
   if p.accuracy_m is null then missing_accuracy:=missing_accuracy+1; end if;
   if anchor_time is not null then
     seconds:=extract(epoch from(p.recorded_at-last_time));
     if seconds<=0 then conflicts:=conflicts+1; rejected:=rejected+1; continue; end if;
     distance:=6371008.8*2*asin(sqrt(least(1.0,greatest(0.0,
       power(sin(radians(p.latitude-anchor_lat)/2),2)+
       cos(radians(anchor_lat))*cos(radians(p.latitude))*
       power(sin(radians(p.longitude-anchor_lon)/2),2)))));
     if seconds>120 then
       gaps:=gaps+1;
       if jsonb_array_length(coords)>0 then segments:=segments||jsonb_build_array(coords); end if;
       coords:='[]'::jsonb;
     else
       step_distance:=6371008.8*2*asin(sqrt(least(1.0,greatest(0.0,
       power(sin(radians(p.latitude-prev_lat)/2),2)+cos(radians(prev_lat))*cos(radians(p.latitude))*
       power(sin(radians(p.longitude-prev_lon)/2),2)))));
       if step_distance/seconds*3.6>160 then rejected:=rejected+1; continue; end if;
       threshold:=greatest(5.0,least(25.0,greatest(coalesce(anchor_accuracy,5),coalesce(p.accuracy_m,5))));
       if distance<threshold then
         jitter:=jitter+1; accepted:=accepted+1; last_time:=p.recorded_at;
         -- Keep the spatial anchor to preserve slow movement; temporal continuity uses last_time.
         prev_lat:=p.latitude;prev_lon:=p.longitude;
         continue;
       end if;
       meters:=meters+distance;
     end if;
   end if;
   accepted:=accepted+1;
   first_time:=coalesce(first_time,p.recorded_at); last_time:=p.recorded_at;
   coords:=coords||jsonb_build_array(jsonb_build_array(p.longitude,p.latitude));
   anchor_lat:=p.latitude;anchor_lon:=p.longitude;anchor_accuracy:=p.accuracy_m;anchor_time:=p.recorded_at;
   prev_lat:=p.latitude;prev_lon:=p.longitude;
 end loop;
 if jsonb_array_length(coords)>0 then segments:=segments||jsonb_build_array(coords); end if;
 duration:=extract(epoch from(t.ended_at-t.started_at));
 status:=case
 when accepted<2 then 'sin_gps_suficiente'
 when duration<180 then 'recorrido_menor_3_minutos'
 when gaps>0 or rejected>0 or missing_accuracy>0
 or first_time>t.started_at+interval '120 seconds'
 or last_time<t.ended_at-interval '120 seconds'
 then 'gps_incompleto_o_por_revisar'
 else 'gps_registrado' end;
 return jsonb_build_object('ok',true,'trip_id',t.id,'entry_id',t.entry_id,
 'company',t.company,'started_at',t.started_at,'ended_at',t.ended_at,
 'duration_seconds',duration,
 'distance_km',case when accepted>=2 then round((meters/1000)::numeric,3) else null end,
 'gps_span_seconds',coalesce(extract(epoch from(last_time-first_time)),0),
 'points_total',total,'points_usable',accepted,'points_rejected',rejected,
 'points_without_accuracy',missing_accuracy,'stationary_or_small_moves',jitter,
 'gaps',gaps,'timestamp_conflicts',conflicts,'status',status,'segments',segments,
 'calculation','gps_haversine_v1','max_accuracy_m',50,'max_gap_seconds',120,
 'max_speed_kmh',160,'minimum_duration_seconds',180);
end;
$function$;

CREATE OR REPLACE FUNCTION public.km_ingest_position(p_unique_id text, p_token_hash text, p_position jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_device uuid;
 v_credential public.km_gps_credentials%rowtype;
 v_id bigint;
 v_time timestamptz;
 v_window timestamptz:=date_trunc('minute',clock_timestamp());
begin
 select d.id into v_device from public.km_mobile_devices d
 join public.km_gps_credentials c on c.device_id=d.id
 where d.traccar_unique_id=p_unique_id and d.active and d.activated_at is not null
 and c.enabled and c.token_hash=p_token_hash;
 if v_device is null then return jsonb_build_object('ok',false,'code','UNAUTHORIZED'); end if;
 select * into v_credential from public.km_gps_credentials where device_id=v_device for update;
 -- Recheck after acquiring the lock in case credentials were rotated or disabled.
 if not v_credential.enabled or v_credential.token_hash<>p_token_hash then
   return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
 end if;
 v_time:=(p_position->>'recorded_at')::timestamptz;
 if v_time is null or not isfinite(v_time) or v_time<clock_timestamp()-interval '30 days'
 or v_time>clock_timestamp()+interval '5 minutes' then
   return jsonb_build_object('ok',false,'code','INVALID_TIMESTAMP');
 end if;
 if v_credential.rate_window=v_window and v_credential.rate_count>=120 then
   return jsonb_build_object('ok',false,'code','RATE_LIMITED');
 end if;
 insert into public.km_gps_positions
 (device_id,recorded_at,latitude,longitude,accuracy_m,speed_kmh,heading_deg,altitude_m,battery_pct,valid,mock,source)
 values(v_device,v_time,(p_position->>'latitude')::float8,(p_position->>'longitude')::float8,
 (p_position->>'accuracy_m')::float8,(p_position->>'speed_kmh')::float8,
 (p_position->>'heading_deg')::float8,(p_position->>'altitude_m')::float8,
 (p_position->>'battery_pct')::float8,coalesce((p_position->>'valid')::boolean,true),
 coalesce((p_position->>'mock')::boolean,false),p_position->>'source')
 on conflict(device_id,recorded_at,latitude,longitude) do nothing returning id into v_id;
 update public.km_gps_credentials set last_received_at=clock_timestamp(),
 rate_count=case when rate_window=v_window then rate_count+1 else 1 end,rate_window=v_window
 where device_id=v_device;
 return jsonb_build_object('ok',true,'duplicate',v_id is null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.km_my_report(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_uid uuid:=(select auth.uid()); profiles jsonb; items jsonb; total numeric; row_count bigint;
begin
 if v_uid is null then raise exception 'Debe iniciar sesión' using errcode='42501'; end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
 or p_to<p_from or p_to-p_from>365 then
 raise exception 'Seleccione un período válido de hasta 366 días' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x order by x.company,x.name),'[]'::jsonb) into profiles
 from (
   select 'blokon' as company,'BLOKON' as company_name,id as employee_id,name,area from public.employees_blokon
   union all
   select 'conaser','CONASER',id,name,area from public.employees_conaser
   union all
   select 'security','NEW CENTURY SECURITY',id,name,area from public.employees_security
   union all
   select 'newcentury','NEW CENTURY',id,name,area from public.employees_newcentury
 ) x where exists (select 1 from public.km_report_access a
   where a.user_id=v_uid and a.active and a.company=x.company and a.employee_id=x.employee_id);
 if jsonb_array_length(profiles)=0 then raise exception 'Su cuenta no tiene una bitácora habilitada' using errcode='42501'; end if;
 select count(*) into row_count from public.bitacora_consolidada where date between p_from and p_to
 and exists (select 1 from public.km_report_access a where a.user_id=v_uid and a.active
   and a.employee_id=bitacora_consolidada.employee_id and a.company=case bitacora_consolidada.company
   when 'BLOKON' then 'blokon' when 'CONASER' then 'conaser'
   when 'NEW CENTURY SECURITY' then 'security' when 'NEW CENTURY' then 'newcentury' end);
 if row_count>5000 then raise exception 'El período contiene demasiados registros; seleccione un rango menor' using errcode='22023'; end if;
 select coalesce(jsonb_agg(x order by x.date,x.time_start,x.id),'[]'::jsonb),
        coalesce(sum(x.km_travel),0) into items,total
 from (
 select id,date,employee_id,employee_name,company,area_employee,vehicle_id,vehicle_type,
 brand,plate,area_request,origin,destination,time_start,time_end,km_initial,km_final,km_travel,
 management_type,order_reference,result,employee_observation,review_status,km_traccar,difference_km,
 odometer_start_path,odometer_end_path,support_path
 from public.bitacora_consolidada where date between p_from and p_to
 and exists (select 1 from public.km_report_access a where a.user_id=v_uid and a.active
   and a.employee_id=bitacora_consolidada.employee_id and a.company=case bitacora_consolidada.company
   when 'BLOKON' then 'blokon' when 'CONASER' then 'conaser'
   when 'NEW CENTURY SECURITY' then 'security' when 'NEW CENTURY' then 'newcentury' end)
 ) x;
 return jsonb_build_object('profiles',profiles,'from',p_from,'to',p_to,'items',items,
 'count',row_count,'total_km',total,'read_only',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.km_register_employee(p_request_id uuid, p_actor_id uuid, p_user_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c text; e text; v text; saved public.km_employee_registrations; associated text; enabled boolean;
begin
 c:=p_data->>'company';
 if c is null or c not in ('blokon','conaser','security','newcentury') or p_request_id is null or p_actor_id is null or p_user_id is null
 or length(trim(coalesce(p_data->>'name','')))<2 or length(p_data->>'name')>200
 or length(trim(coalesce(p_data->>'area','')))<2 or length(p_data->>'area')>120 then
 raise exception 'Datos del alta inválidos' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into saved from public.km_employee_registrations where request_id=p_request_id;
 if found then
  if saved.actor_id<>p_actor_id or saved.user_id<>p_user_id or saved.payload<>p_data then raise exception 'Alta utilizada con otros datos' using errcode='23505'; end if;
  return jsonb_build_object('employeeId',saved.employee_id,'vehicleId',saved.vehicle_id,'name',p_data->>'name','repeated',true);
 end if;
 e:=upper(left(c,3))||'-'||replace(p_request_id::text,'-','');
 v:=nullif(p_data->>'vehicleId','');
 if v is not null then
  execute format('select employee_id,active from public.%I where id=$1 for update','vehicles_'||c) into associated,enabled using v;
  if enabled is distinct from true or associated is not null then raise exception 'Vehículo no disponible' using errcode='23505'; end if;
 else
  if length(trim(coalesce(p_data->>'type','')))<2 or length(p_data->>'type')>120 or length(coalesce(p_data->>'plate',''))>40 then raise exception 'Vehículo inválido' using errcode='22023'; end if;
  v:='VEH-'||replace(p_request_id::text,'-','');
 end if;
 execute format('insert into public.%I(id,name,area,role,active) values($1,$2,$3,$4,true)','employees_'||c)
 using e,p_data->>'name',p_data->>'area',nullif(p_data->>'role','');
 if nullif(p_data->>'vehicleId','') is null then
  execute format('insert into public.%I(id,type,brand,plate,employee_id,active) values($1,$2,$3,$4,$5,true)','vehicles_'||c)
  using v,p_data->>'type',nullif(p_data->>'brand',''),nullif(p_data->>'plate',''),e;
 else execute format('update public.%I set employee_id=$1 where id=$2','vehicles_'||c) using e,v;
 end if;
 insert into public.km_report_access(user_id,company,employee_id,active) values(p_user_id,c,e,true);
 insert into public.km_employee_registrations(request_id,actor_id,user_id,company,employee_id,vehicle_id,payload)
 values(p_request_id,p_actor_id,p_user_id,c,e,v,p_data);
 return jsonb_build_object('employeeId',e,'vehicleId',v,'name',p_data->>'name','repeated',false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.km_relay_protect_completed_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- A stale, parallel failure must not change a successfully delivered position back to queued.
  IF OLD.status = 'done' AND NEW.status <> 'done' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.km_rotate_gps_token(p_device_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_token text; v_unique text;
begin
 select traccar_unique_id into v_unique from public.km_mobile_devices
 where id=p_device_id and active and activated_at is not null for update;
 if not found then raise exception 'Dispositivo inexistente, inactivo o sin activar'; end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.km_gps_credentials(device_id,token_hash)
 values(p_device_id,encode(extensions.digest(v_token,'sha256'),'hex'))
 on conflict(device_id) do update set token_hash=excluded.token_hash,enabled=true,
 created_at=clock_timestamp(),rate_window=null,rate_count=0;
 return jsonb_build_object('device_id',p_device_id,'unique_id',v_unique,'token',v_token);
end;
$function$;

DROP TRIGGER IF EXISTS km_relay_protect_completed_jobs ON public.km_traccar_relay_jobs;
CREATE TRIGGER km_relay_protect_completed_jobs BEFORE UPDATE OF status ON public.km_traccar_relay_jobs FOR EACH ROW EXECUTE FUNCTION km_relay_protect_completed_jobs();

COMMIT;
