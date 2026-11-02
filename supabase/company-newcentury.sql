-- NEW CENTURY has its own catalog and retains the same individual report restrictions.
create table public.employees_newcentury (like public.employees_blokon including all);
create table public.vehicles_newcentury (like public.vehicles_blokon including all);
alter table public.vehicles_newcentury add foreign key (employee_id) references public.employees_newcentury(id);
create table public.bitacora_newcentury (like public.bitacora_blokon including all);
alter table public.bitacora_newcentury alter column company set default 'NEW CENTURY';
alter table public.bitacora_newcentury add foreign key (employee_id) references public.employees_newcentury(id);
alter table public.bitacora_newcentury add foreign key (vehicle_id) references public.vehicles_newcentury(id);
alter table public.employees_newcentury enable row level security;
alter table public.vehicles_newcentury enable row level security;
alter table public.bitacora_newcentury enable row level security;
revoke all on public.employees_newcentury, public.vehicles_newcentury, public.bitacora_newcentury from anon, authenticated;
grant all on public.employees_newcentury, public.vehicles_newcentury, public.bitacora_newcentury to service_role;
grant select on public.employees_newcentury, public.bitacora_newcentury to authenticated;
create policy km_employee_read_own on public.employees_newcentury for select to authenticated
using (active and id in (select a.employee_id from public.km_report_access a where a.user_id=(select auth.uid()) and a.company='newcentury' and a.active));
create policy km_bitacora_read_own on public.bitacora_newcentury for select to authenticated
using (exists (select 1 from public.km_report_access a
  where a.user_id=(select auth.uid()) and a.active and a.company='newcentury'
  and a.employee_id=bitacora_newcentury.employee_id)
  and exists (select 1 from public.employees_newcentury e
  where e.id=bitacora_newcentury.employee_id and e.active));
alter table public.km_mobile_devices drop constraint km_mobile_devices_company_check;
alter table public.km_mobile_devices add constraint km_mobile_devices_company_check check (company in ('blokon','conaser','security','newcentury'));
alter table public.km_mobile_trips drop constraint km_mobile_trips_company_check;
alter table public.km_mobile_trips add constraint km_mobile_trips_company_check check (company in ('blokon','conaser','security','newcentury'));
alter table public.km_report_access drop constraint km_report_access_company_check;
alter table public.km_report_access add constraint km_report_access_company_check check (company in ('blokon','conaser','security','newcentury'));
alter table public.vehicles_blokon alter column plate drop not null;
alter table public.vehicles_conaser alter column plate drop not null;
alter table public.vehicles_security alter column plate drop not null;
alter table public.vehicles_newcentury alter column plate drop not null;
create or replace view public.bitacora_consolidada with (security_invoker=true) as
select * from public.bitacora_blokon union all select * from public.bitacora_conaser
union all select * from public.bitacora_security union all select * from public.bitacora_newcentury;
CREATE OR REPLACE FUNCTION public.km_my_report(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
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
revoke all on function public.km_my_report(date,date) from public, anon;
grant execute on function public.km_my_report(date,date) to authenticated, service_role;
