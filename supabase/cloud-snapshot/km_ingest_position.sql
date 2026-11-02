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
$function$

