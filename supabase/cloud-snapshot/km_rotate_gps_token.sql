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
$function$

