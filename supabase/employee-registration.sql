-- Alta indivisible de empleado, vehículo y acceso. Solo la API privada puede ejecutarla.
create table public.km_employee_registrations (
 request_id uuid primary key,
 actor_id uuid not null,
 user_id uuid not null,
 company text not null check(company in ('blokon','conaser','security','newcentury')),
 employee_id text not null,
 vehicle_id text not null,
 payload jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.km_employee_registrations enable row level security;
revoke all on public.km_employee_registrations from public,anon,authenticated;
grant all on public.km_employee_registrations to service_role;
create function public.km_register_employee(p_request_id uuid,p_actor_id uuid,p_user_id uuid,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
$$;
revoke all on function public.km_register_employee(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.km_register_employee(uuid,uuid,uuid,jsonb) to service_role;
