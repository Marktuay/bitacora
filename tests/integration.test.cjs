const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const path = require('node:path');
const crypto = require('node:crypto');
let mock,app,base,dbBase;
const tables = {}, files = new Map();
tables.km_mobile_devices=[];tables.km_mobile_trips=[];
let failMetadata=false, gpsAvailable=true;
const gpsDevices=[],gpsPositions=[];
for(const c of ['blokon','conaser','security','newcentury']){
 tables[`employees_${c}`]=[{id:`e-${c}`,name:`COLABORADOR PRUEBA ${c.toUpperCase()}`,area:'AUDITORIA',active:true}];
 tables[`vehicles_${c}`]=[{id:`v-${c}`,type:'Moto',brand:'PRUEBA',plate:`TEST-${c}`,employee_id:`e-${c}`,active:true}];
 tables[`bitacora_${c}`]=[];
}
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data))};
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
const body=async req=>{let b=[];for await(const c of req)b.push(c);return Buffer.concat(b)};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=';
const auth={cookie:'km_access=test-admin-token'};
async function request(route,options={}){const r=await fetch(base+route,options);const b=Buffer.from(await r.arrayBuffer());return {status:r.status,headers:r.headers,bytes:b,json:r.headers.get('content-type')?.includes('json')?JSON.parse(b):null};}
before(async()=>{
 mock=http.createServer(async(req,res)=>{
  try{
   if(req.url.startsWith('/gps/')){
    if(!gpsAvailable)return json(res,503,{error:'temporarily offline'});
    if(req.url.startsWith('/gps/ingest')){gpsPositions.push(Object.fromEntries(new URLSearchParams((await body(req)).toString())));return json(res,200,{});}
    assert.equal(req.headers.authorization,'Basic '+Buffer.from('test:gps').toString('base64'));
    if(req.method==='POST'){const d=JSON.parse(await body(req));d.id=gpsDevices.length+1;gpsDevices.push(d);return json(res,200,d);}
    return json(res,200,gpsDevices);
   }
   if(req.url==='/auth/v1/user'){if(req.headers.authorization==='Bearer test-admin-token')return json(res,200,{id:'admin-id',email:'admin@example.invalid',app_metadata:{bitacora_role:'admin'}});return json(res,401,{error:'Invalid token'});}
   assert.equal(req.headers.apikey,'eyJ-test-server-key');
   assert.equal(req.headers.authorization,'Bearer eyJ-test-server-key');
   const u=new URL(req.url,'http://localhost'),p=u.pathname;
   if(p.startsWith('/storage/v1/object/info/bitacora-soportes/')){
    const f=files.get(decodeURIComponent(p.split('/bitacora-soportes/')[1]));return json(res,f?200:404,f?{content_type:f.type}:{error:'not found'});
   }
   if(p.startsWith('/storage/v1/object/sign/bitacora-soportes/'))return json(res,200,{signedURL:`/object/sign/bitacora-soportes/${p.split('/bitacora-soportes/')[1]}?token=test`});
   if(p.startsWith('/storage/v1/object/bitacora-soportes/')){files.set(decodeURIComponent(p.split('/bitacora-soportes/')[1]),{type:req.headers['content-type'],bytes:await body(req)});return json(res,200,{Key:p});}
   const table=p.split('/').at(-1);if(!tables[table])return json(res,404,{error:'table not found'});
   let rows=tables[table].filter(row=>[...u.searchParams].every(([k,v])=>{
    if(['select','limit','offset','order','on_conflict'].includes(k))return true;
    const [op,...parts]=v.split('.'),value=parts.join('.');
    return op==='eq'?String(row[k])===value:op==='gte'?row[k]>=value:op==='lte'?row[k]<=value:op==='gt'?row[k]>value:op==='is'&&value==='null'?row[k]==null:true;
   }));
   if(req.method==='POST'){
    if(table==='km_mobile_trips'&&failMetadata){failMetadata=false;return json(res,503,{error:'simulated outage after entry commit'});}
    const item=JSON.parse(await body(req));
    if(tables[table].some(x=>x.id===item.id))return json(res,req.headers.prefer?.includes('ignore-duplicates')?201:409,[]);
    if(table==='km_mobile_devices')Object.assign(item,{active:true,created_at:new Date().toISOString()});
    tables[table].push(item);return json(res,201,[item]);
   }
   if(req.method==='PATCH'){const patch=JSON.parse(await body(req));rows.forEach(row=>Object.assign(row,patch));return json(res,200,rows);}
   const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||1000);
   return json(res,200,rows.slice(offset,offset+limit));
  }catch(e){json(res,500,{error:e.message});}
 });
 await listen(mock);dbBase=`http://127.0.0.1:${mock.address().port}`;
 Object.assign(process.env,{SUPABASE_URL:dbBase,SUPABASE_SECRET_KEY:'eyJ-test-server-key',AUDIT_PIN:'test-audit',REPORT_PIN:'test-report',BITACORA_GPS_PROVIDER:'traccar'});
 app=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.split('/').at(-1);await require(`../api/${name}.js`)(req,res);}catch(e){json(res,500,{error:e.message});}});
 await listen(app);base=`http://127.0.0.1:${app.address().port}`;
});
after(async()=>{await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>mock.close(r))]);});
const post=(data,headers={})=>({method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
for(const company of ['blokon','conaser','security','newcentury'])test(`Recorrido completo: ${company}`,async()=>{
 const catalog=await request(`/api/catalog?company=${company}`,{headers:auth});assert.equal(catalog.status,200);assert.equal(catalog.json.demo,false);assert.equal(catalog.json.employees.length,1);
 const trip={date:'2026-09-22',employeeId:`e-${company}`,vehicleId:`v-${company}`,areaRequest:'AUDITORIA',origin:'PRUEBA ORIGEN',destination:'PRUEBA DESTINO',timeStart:'08:00',timeEnd:'09:00',kmInitial:100,kmFinal:125,managementType:'Verificación técnica',orderReference:'TEST-ONLY'};
 assert.equal((await request(`/api/entries?company=${company}`,post(trip))).status,400);
 const photos=[];
 for(const kind of ['odometer-start','odometer-end']){
  const up=await request('/api/support',post({company,kind,fileName:'odometro.png',contentType:'image/png',base64:png}));assert.equal(up.status,201);photos.push(up.json.path);
 }
 Object.assign(trip,{odometerStartPath:photos[0],odometerEndPath:photos[1]});
 assert.equal((await request(`/api/entries?company=${company}`,post({...trip,odometerEndPath:photos[1]+'missing'}))).status,400);
 assert.equal((await request(`/api/entries?company=${company}`,post({...trip,kmInitial:-1}))).status,400);
 assert.equal((await request(`/api/entries?company=${company}`,post({...trip,date:'2026-02-30'}))).status,400);
 const saved=await request(`/api/entries?company=${company}`,post(trip));assert.equal(saved.status,201);assert.equal(saved.json.item.km_travel,25);
 const q=`company=${company}&employeeId=e-${company}&from=2026-09-16&to=2026-09-30`;
 assert.equal((await request(`/api/entries?${q}`)).status,401);
 const audit=await request(`/api/entries?${q}`,{headers:auth});assert.equal(audit.json.items.length,1);
 const changed=await request(`/api/entries?company=${company}`,{method:'PATCH',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({id:saved.json.item.id,reviewStatus:'Aprobado',kmTraccar:24,kmTravel:999})});assert.equal(changed.json.item.difference_km,-1);
 const support=await request(`/api/support?path=${encodeURIComponent(photos[0])}`,{headers:auth});assert.equal(support.status,200);assert.ok(support.json.url.startsWith(dbBase+'/storage/v1/object/sign/'));
 assert.equal((await request(`/api/report?${q}`)).status,401);
 const report=await request(`/api/report?${q}`,{headers:auth});assert.equal(report.json.items.length,1);
 const excel=await request(`/api/report-xlsx?${q}`,{headers:auth});assert.equal(excel.status,200);
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(excel.bytes);assert.equal(wb.worksheets[0].getCell('H8').value,25);assert.equal(wb.worksheets[0].getCell('H9').value,25);
 const pdf=await request(`/api/report-pdf?${q}`,{headers:auth});assert.equal(pdf.status,200);assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync(`test-results/${company}.xlsx`,excel.bytes);fs.writeFileSync(`test-results/${company}.pdf`,pdf.bytes);
});
test('Archivos inválidos, aislamiento y acceso cerrado sin PIN',async()=>{
 assert.equal((await request('/api/support',post({company:'invalid',kind:'odometer-start',contentType:'image/png',base64:png}))).status,400);
 assert.equal((await request('/api/support',post({company:'blokon',kind:'odometer-start',contentType:'image/png',base64:Buffer.from('not an image').toString('base64')}))).status,400);
 const beforePin=process.env.AUDIT_PIN;delete process.env.AUDIT_PIN;assert.equal((await request('/api/entries?company=blokon')).status,401);process.env.AUDIT_PIN=beforePin;
 const beforeReport=process.env.REPORT_PIN;delete process.env.REPORT_PIN;assert.equal((await request('/api/report?company=blokon')).status,401);process.env.REPORT_PIN=beforeReport;
 assert.equal((await request('/api/report?company=blokon&employeeId=e-blokon&from=2026-10-01&to=2026-09-01',{headers:auth})).status,400);
});
test('Reportes completos con más de 500 gestiones',async()=>{
 const first=tables.bitacora_blokon[0];tables.bitacora_blokon=Array.from({length:501},(_,i)=>({...first,id:`batch-${i}`,km_travel:1}));
 const q='company=blokon&employeeId=e-blokon&from=2026-09-01&to=2026-09-30';
 const report=await request(`/api/report?${q}`,{headers:auth});assert.equal(report.json.items.length,501);
 const audit=await request(`/api/entries?${q}`,{headers:auth});assert.equal(audit.json.items.length,501);
 const excel=await request(`/api/report-xlsx?${q}`,{headers:auth});const wb=new ExcelJS.Workbook();await wb.xlsx.load(excel.bytes);assert.equal(wb.worksheets[0].getCell('H509').value,501);
});
for(const company of ['blokon','conaser','security','newcentury'])test(`Android: activación, fotos, reintentos y recorrido nocturno ${company}`,async()=>{
 const pairData={company,employeeId:`e-${company}`,vehicleId:`v-${company}`};
 const route=action=>'/api/traccar?action=mobile-'+action;
 assert.equal((await request(route('pair-create'),post(pairData))).status,401);
 const paired=await request(route('pair-create'),post(pairData,auth));assert.equal(paired.status,201);
 const token=crypto.randomBytes(32).toString('hex'),headers={'x-device-token':token};
 const act=await request(route('activate'),post({code:paired.json.code,deviceToken:token}));assert.equal(act.status,200);assert.equal(act.json.profile.company,company);
 assert.equal((await request(route('activate'),post({code:paired.json.code,deviceToken:token}))).status,200,'Recupera confirmación de activación perdida');
 assert.equal((await request(route('activate'),post({code:paired.json.code,deviceToken:crypto.randomBytes(32).toString('hex')}))).status,401,'Código no se reutiliza con otro teléfono');
 assert.equal((await request(route('profile'),{headers})).status,200);
 assert.equal((await request(route('profile'),{headers:{'x-device-token':'incorrect'}})).status,401);
 const photos=[];
 for(const kind of ['odometer-start','odometer-end']){
  const payload={company,kind,contentType:'image/png',base64:png,uploadId:crypto.randomUUID()};const n=files.size;
  assert.equal((await request('/api/support',post(payload))).status,401);
  const first=await request('/api/support',post(payload,headers));assert.equal(first.status,201);
  const retry=await request('/api/support',post(payload,headers));assert.equal(retry.status,200);assert.equal(first.json.path,retry.json.path);assert.equal(files.size,n+1);photos.push(first.json.path);
 }
 const supportPayload={company,kind:'support',contentType:'application/pdf',base64:Buffer.from('%PDF-1.4\n% Support fixture\n%%EOF').toString('base64'),uploadId:crypto.randomUUID()};
 const support=await request('/api/support',post(supportPayload,headers));assert.equal(support.status,201);
 const supportRetry=await request('/api/support',post(supportPayload,headers));assert.equal(supportRetry.status,200);assert.equal(supportRetry.json.path,support.json.path);
 const trip={id:crypto.randomUUID(),startedAt:'2026-09-21T05:50:00.000Z',endedAt:'2026-09-21T06:10:00.000Z',areaRequest:'AUDITORIA',origin:'Ruta de prueba',destination:'Regreso de prueba',kmInitial:100,kmFinal:130,odometerStartPath:photos[0],odometerEndPath:photos[1],managementType:'Visita de auditoría',orderReference:'MOVIL-2026-001',result:'Realizado',observation:'Gestión completa guardada sin conexión.',supportPath:support.json.path};
 assert.equal((await request(route('submit'),post({...trip,odometerEndPath:''},headers))).status,400);
 assert.equal((await request(route('submit'),post({...trip,supportPath:support.json.path+'missing'},headers))).status,400);
 assert.equal((await request(route('submit'),post({...trip,supportPath:support.json.path.replace(company,company==='blokon'?'conaser':'blokon')},headers))).status,400);
 failMetadata=true;const n=tables[`bitacora_${company}`].length;
 assert.equal((await request(route('submit'),post(trip,headers))).status,503,'Corte después de guardar bitácora conserva reintento');
 const submitted=await request(route('submit'),post(trip,headers));assert.equal(submitted.status,200);assert.equal(submitted.json.id,trip.id);
 assert.equal((await request(route('submit'),post(trip,headers))).status,200);
 assert.equal(tables[`bitacora_${company}`].length,n+1,'Un solo registro pese a reintentos');
 assert.equal(tables.km_mobile_trips.filter(x=>x.id===trip.id).length,1);
 const entry=tables[`bitacora_${company}`].find(x=>x.id===trip.id);assert.equal(entry.date,'2026-09-20');assert.equal(entry.time_start,'23:50');assert.equal(entry.time_end,'00:10');assert.equal(entry.km_travel,30);
 for(const [column,key] of [['management_type','managementType'],['order_reference','orderReference'],['result','result'],['employee_observation','observation'],['support_path','supportPath']])assert.equal(entry[column],trip[key]);
 const report=await request(`/api/report?company=${company}&employeeId=e-${company}&from=2026-09-20&to=2026-09-20`,{headers:auth});assert.equal(report.status,200);assert.equal(report.json.items.find(x=>x.id===trip.id).support_path,trip.supportPath);
 assert.equal((await request(route('submit'),post({...trip,kmFinal:999},headers))).status,409);
 assert.equal((await request(route('submit'),post({...trip,result:'No realizado'},headers))).status,409);
 assert.equal((await request(route('submit'),post({...trip,supportPath:''},headers))).status,409);
 Object.assign(process.env,{TRACCAR_BASE_URL:dbBase+'/gps',TRACCAR_INGEST_URL:dbBase+'/gps/ingest',TRACCAR_USER:'test',TRACCAR_PASSWORD:'gps'});
 const position={method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id:token,lat:'12.13',lon:'-86.25',timestamp:'1790000000',speed:'20'})};
 gpsAvailable=false;assert.equal((await request(route('position'),position)).status,503,'Servidor GPS caído: no confirma ni descarta punto');
 gpsAvailable=true;assert.equal((await request(route('position'),position)).status,200);assert.equal(gpsPositions.at(-1).id,'bkm-'+paired.json.id);assert.notEqual(gpsPositions.at(-1).id,token);
 assert.equal((await request(route('revoke'),post({id:paired.json.id},auth))).status,200);
 assert.equal((await request(route('profile'),{headers})).status,401);assert.equal((await request(route('position'),position)).status,401);
});
test('Android: catálogo administrativo y recorrido con vehículo autorizado de otro colaborador',async()=>{
 const vehicle={id:'v-loan',plate:'MOTO-PRESTADA',brand:'Moto',type:'Moto',employee_id:'otro',active:true};tables.vehicles_blokon.push(vehicle);
 const token=crypto.randomBytes(32).toString('hex'),headers={'x-device-token':token};
 try{
  const login=await request('/api/traccar?action=mobile-session',{headers:auth});assert.equal(login.status,200);
  const available=login.json.profiles.find(p=>p.company==='blokon'&&p.id==='e-blokon').vehicles;
  assert.ok(available.some(v=>v.id==='v-blokon'));assert.ok(!available.some(v=>v.id==='v-loan'));
  const enrolled=await request('/api/traccar?action=mobile-enroll',post({company:'blokon',employeeId:'e-blokon',vehicleId:vehicle.id,deviceToken:token},auth));assert.equal(enrolled.status,201);
  const photos=[];for(const kind of ['odometer-start','odometer-end']){const r=await request('/api/support',post({company:'blokon',kind,contentType:'image/png',base64:png,uploadId:crypto.randomUUID()},headers));assert.equal(r.status,201);photos.push(r.json.path);}
  const trip={id:crypto.randomUUID(),startedAt:'2026-09-22T14:00:00.000Z',endedAt:'2026-09-22T14:10:00.000Z',areaRequest:'AUDITORIA',origin:'Prueba',destination:'Regreso',kmInitial:200,kmFinal:205,odometerStartPath:photos[0],odometerEndPath:photos[1]};
  const submitted=await request('/api/traccar?action=mobile-submit',post(trip,headers));assert.equal(submitted.status,200);assert.equal(submitted.json.item.vehicle_id,vehicle.id);assert.equal(submitted.json.item.employee_id,'e-blokon');assert.equal(submitted.json.item.km_travel,5);
  assert.equal(vehicle.employee_id,'otro');
  assert.equal((await request('/api/traccar?action=mobile-session',post({company:'security',employeeId:'e-security',vehicleId:vehicle.id},{...headers,...auth}))).status,400);
 }finally{tables.vehicles_blokon=tables.vehicles_blokon.filter(v=>v.id!==vehicle.id);}
});
test('Android: códigos vencidos y catálogos inactivos se rechazan',async()=>{
 const p=await request('/api/traccar?action=mobile-pair-create',post({company:'blokon',employeeId:'e-blokon',vehicleId:'v-blokon'},auth));
 tables.km_mobile_devices.find(x=>x.id===p.json.id).pair_expires_at='2000-01-01T00:00:00Z';
 assert.equal((await request('/api/traccar?action=mobile-activate',post({code:p.json.code,deviceToken:crypto.randomBytes(32).toString('hex')}))).status,401);
 tables.employees_blokon[0].active=false;
 assert.equal((await request('/api/traccar?action=mobile-pair-create',post({company:'blokon',employeeId:'e-blokon',vehicleId:'v-blokon'},auth))).status,400);
 tables.employees_blokon[0].active=true;
});
