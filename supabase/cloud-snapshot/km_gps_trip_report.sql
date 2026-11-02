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
$function$

