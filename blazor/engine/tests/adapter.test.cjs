const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.NODE_ENV='test';process.env.BITACORA_TEST_DATABASE='memory://';process.env.DATABASE_URL='postgresql://test-only/bitacora';process.env.LOCAL_AUTH_SECRET='test-secret-only';process.env.BITACORA_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'km-test-'));
const {pool}=require('../database.cjs'),A=require('../adapter.cjs'),auth=require('../local-auth.cjs'),{seed,ids,password}=require('./fixtures.cjs');
let session;
before(async()=>{await seed(pool());session=await auth.api('token?grant_type=password',{method:'POST',body:JSON.stringify({email:'colaborador@example.invalid',password})});});
after(async()=>{await pool().end();fs.rmSync(process.env.BITACORA_DATA_DIR,{recursive:true,force:true});});
test('El esquema conserva las 22 tablas originales y sus campos',async()=>{
 for(const table of require('../schema.json').tables){const columns=await pool().query('select column_name from information_schema.columns where table_schema=\'public\' and table_name=$1 order by ordinal_position',[table.name]);assert.deepEqual(columns.rows.map(x=>x.column_name),table.columns.map(x=>x.name));}
});
test('Filtros de lectura, orden y paginación usan PostgreSQL',async()=>{
 const r=await A.rest('/rest/v1/employees_blokon?select=id,name&active=eq.true&order=name.desc&limit=1');assert.equal(r.length,1);assert.equal(r[0].id,'e-hidden');assert.deepEqual(Object.keys(r[0]).sort(),['id','name']);
});
test('Los parámetros maliciosos no pueden convertirse en SQL',async()=>{
 await assert.rejects(()=>A.rest('/rest/v1/employees_blokon?name;DROP_TABLE=eq.x'),/Campo inválido/);
 assert.deepEqual(await A.rest('/rest/v1/employees_blokon?name=eq.%27%3Bdrop%20table%20auth.users%3B--'),[]);
 assert.equal((await A.rest('/auth/v1/admin/users')).users.length,4);
});
test('Una sesión de colaborador solo puede consultar sus asignaciones',async()=>{
 const r=await A.rest('/rest/v1/km_report_access?select=user_id,employee_id',{headers:{Authorization:'Bearer '+session.access_token}});assert.equal(r.length,1);assert.equal(r[0].user_id,ids.employee);
 const employees=await A.rest('/rest/v1/employees_blokon?select=id,name',{headers:{Authorization:'Bearer '+session.access_token}});assert.deepEqual(employees.map(x=>x.id),['e-blokon']);
 await assert.rejects(()=>A.rest('/rest/v1/bitacora_blokon',{headers:{Authorization:'Bearer '+session.access_token}}),/Consulta no autorizada/);
 await assert.rejects(()=>A.rest('/rest/v1/employees_blokon',{method:'DELETE',headers:{Authorization:'Bearer '+session.access_token}}),/Operación no autorizada/);
});
test('La función de reporte usa la identidad local y no devuelve otra área',async()=>{
 const r=await A.rest('/rest/v1/rpc/km_my_report',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body:JSON.stringify({p_from:'2026-10-01',p_to:'2026-10-15'})});assert.equal(r.profiles.length,1);assert.equal(r.profiles[0].employee_id,'e-blokon');
});
test('Las altas conservan transacción e idempotencia',async()=>{
 const request='20000000-0000-4000-8000-000000000001',data={company:'blokon',name:'ALTA PRUEBA',area:'OPERACIONES',role:'Auxiliar',type:'Moto',brand:'Prueba',plate:'NEW-TEST',vehicleId:'',email:'colaborador@example.invalid'};
 const options={method:'POST',body:JSON.stringify({p_request_id:request,p_actor_id:ids.admin,p_user_id:ids.employee,p_data:data})};
 const first=await A.rest('/rest/v1/rpc/km_register_employee',options),second=await A.rest('/rest/v1/rpc/km_register_employee',options);assert.equal(first.employeeId,second.employeeId);assert.equal(second.repeated,true);
 options.body=JSON.stringify({p_request_id:request,p_actor_id:ids.admin,p_user_id:ids.employee,p_data:{...data,name:'CAMBIO'}});await assert.rejects(()=>A.rest('/rest/v1/rpc/km_register_employee',options),/Alta utilizada/);
});
test('Upsert y predicados nulos conservan la cola móvil sin duplicar',async()=>{
 const device={id:'30000000-0000-4000-8000-000000000001',company:'blokon',employee_id:'e-blokon',vehicle_id:'v-blokon',label:'PRUEBA',token_hash:'a'.repeat(64),traccar_unique_id:'test-device'};
 const opts={method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(device)};
 assert.equal((await A.rest('/rest/v1/km_mobile_devices?on_conflict=id',opts)).length,1);assert.equal((await A.rest('/rest/v1/km_mobile_devices?on_conflict=id',opts)).length,0);
 assert.equal((await A.rest('/rest/v1/km_mobile_devices?activated_at=is.null&active=eq.true')).length,1);
 await A.rest('/rest/v1/km_mobile_devices?id=eq.'+device.id,{method:'PATCH',body:JSON.stringify({activated_at:new Date().toISOString()})});
 assert.equal((await A.rest('/rest/v1/km_mobile_devices?activated_at=is.null')).length,0);
});
test('Login, renovación rotativa y cierre invalidan las sesiones',async()=>{
 await assert.rejects(()=>auth.api('token?grant_type=password',{method:'POST',body:JSON.stringify({email:'colaborador@example.invalid',password:'incorrecta'})}),e=>e.status===401);
 const renewed=await auth.api('token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});assert.notEqual(renewed.access_token,session.access_token);assert.equal(await auth.getSession(session.access_token),null);
 await assert.rejects(()=>auth.api('token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})}),e=>e.status===401);
 await auth.api('logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+renewed.access_token}});assert.equal(await auth.getSession(renewed.access_token),null);
});
test('Los soportes son privados y no permiten salir de su carpeta',async()=>{
 const S=require('../storage.cjs');
 await assert.rejects(()=>S.operation('/storage/v1/object/bitacora-soportes/blokon/support/%2e%2e%5csecret',{method:'POST',body:Buffer.from('x')}),/Ruta inválida/);
 const route='/storage/v1/object/bitacora-soportes/blokon/support/2026-10-17/test.pdf';
 await S.operation(route,{method:'POST',body:Buffer.from('%PDF-test')});assert.equal((await S.operation(route.replace('/object/','/object/info/'),{})).content_type,'application/pdf');
 const signed=await S.operation(route.replace('/object/','/object/sign/'),{method:'POST'});assert.match(signed.signedURL,/^\/evidence\/bitacora-soportes\/blokon/);
 await assert.rejects(()=>S.operation(route,{method:'POST',body:Buffer.from('%PDF-test')}),/409/);
});
test('La cola durable entrega registros completos y los reclama una sola vez',async()=>{
 const id='b'.repeat(64),options={method:'POST',body:JSON.stringify({id,operation:'position',payload:{id:'test-device',lat:'12',lon:'-86'},expires_at:new Date(Date.now()+60000).toISOString()})};
 await A.rest('/rest/v1/km_traccar_relay_jobs',options);
 const filtered=await A.rest('/rest/v1/km_traccar_relay_jobs?operation=eq.position&status=in.(queued,processing)&payload-%3E%3Eid=eq.test-device');assert.equal(filtered.length,1);
 const jobs=await A.rest('/rest/v1/rpc/km_claim_traccar_relay_jobs',{method:'POST',body:JSON.stringify({p_limit:30})});assert.equal(jobs.length,1);assert.equal(jobs[0].id,id);assert.equal(jobs[0].payload.id,'test-device');
 assert.deepEqual(await A.rest('/rest/v1/rpc/km_claim_traccar_relay_jobs',{method:'POST',body:JSON.stringify({p_limit:30})}),[]);
});
