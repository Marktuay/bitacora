-- Associations supplied by the administrator on 2026-10-01.
-- Preserve existing plates, rates, trips, GPS history and device assignments.
insert into public.employees_blokon (id,name) values ('BLO-CARLOS-DIAZ','CARLOS JOSE DIAZ MORENO') on conflict(id) do nothing;
insert into public.employees_newcentury (id,name) values ('NC-GABRIELA-BLANDON','GABRIELA BLANDON') on conflict(id) do nothing;
update public.vehicles_blokon set employee_id='BLO-036',type='Carro',brand='Toyota Tercel' where id='VEH-002';
update public.vehicles_blokon set employee_id='BLO-065',type='Moto',brand='AKT Hunter' where id='VEH-001';
insert into public.vehicles_blokon (id,type,brand,plate,employee_id) values ('VEH-016','SUV / Hatchback',null,null,'BLO-CARLOS-DIAZ') on conflict(id) do nothing;
update public.vehicles_blokon set employee_id='BLO-CARLOS-DIAZ',type='SUV / Hatchback',brand=null where id='VEH-016';
insert into public.vehicles_blokon (id,type,brand,plate,employee_id) values ('VEH-017','Carro','Suzuki',null,'BLO-001') on conflict(id) do nothing;
update public.vehicles_blokon set employee_id='BLO-001',type='Carro',brand='Suzuki' where id='VEH-017';
update public.vehicles_conaser set employee_id='CON-010',type='Camioneta',brand='Mazda' where id='VEH-005';
update public.vehicles_conaser set employee_id='CON-005',type='Sedán',brand='Hyundai' where id='VEH-003';
update public.vehicles_conaser set employee_id='CON-012',type='Moto',brand='Genesis' where id='VEH-004';
update public.vehicles_conaser set employee_id='CON-020',type='Moto',brand='AKT 150' where id='VEH-008';
update public.vehicles_conaser set employee_id='CON-013',type='Moto',brand='Pulsar' where id='VEH-006';
update public.vehicles_conaser set employee_id='CON-008',type='Moto',brand='Genesis' where id='VEH-007';
insert into public.vehicles_newcentury (id,type,brand,plate,employee_id) values ('VEH-018','Camioneta','Chevrolet',null,'NC-GABRIELA-BLANDON') on conflict(id) do nothing;
update public.vehicles_newcentury set employee_id='NC-GABRIELA-BLANDON',type='Camioneta',brand='Chevrolet' where id='VEH-018';
update public.vehicles_security set employee_id='SEC-015',type='Moto',brand='Sky Go' where id='VEH-012';
update public.vehicles_security set employee_id='SEC-002',type='Sedán',brand='Kia Rio' where id='VEH-011';
update public.vehicles_security set employee_id='SEC-078',type='Moto',brand='Boxer' where id='VEH-015';
update public.vehicles_security set employee_id='SEC-077',type='Moto',brand='Dayun' where id='VEH-013';
update public.vehicles_security set employee_id='SEC-059',type='Moto',brand='Genesis' where id='VEH-014';
update public.vehicles_security set employee_id='SEC-016',type='Moto',brand='Genesis' where id='VEH-009';
insert into public.vehicles_security (id,type,brand,plate,employee_id) values ('VEH-019','Moto','Pulsar',null,'SEC-084') on conflict(id) do nothing;
update public.vehicles_security set employee_id='SEC-084',type='Moto',brand='Pulsar' where id='VEH-019';
update public.vehicles_security set employee_id='SEC-048',type='Moto',brand='AKT' where id='VEH-010';
