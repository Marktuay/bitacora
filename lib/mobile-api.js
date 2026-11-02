const crypto=require('node:crypto');
const C=require('../api/_config');
const A=require('./auth');
const COMPANY_AREAS=require('../config/manager-areas.json');
const tokenOK=x=>/^[a-f0-9]{64}$/.test(x||'');
const uuidOK=x=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x||'');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const write={'Content-Type':'application/json',Prefer:'return=representation'};
async function one(table,filters){return (await C.sb(C.tablePath(table,new URLSearchParams({select:'*',...filters,limit:'1'}))))?.[0]||null;}
async function device(token){return tokenOK(token)?one('km_mobile_devices',{token_hash:`eq.${hash(token)}`,active:'eq.true'}):null;}
function publicDevice(d,e,v){return {id:d.id,company:d.company,employee:e,vehicle:v,label:d.label,gpsPanelUrl:'/reportes',gpsReady:(process.env.BITACORA_GPS_PROVIDER||'traccar')==='traccar'?require('./traccar-gps').configured():C.dbReady(),gpsProvider:process.env.BITACORA_GPS_PROVIDER||'traccar',areas:[...(COMPANY_AREAS[d.company]||[])]};}
async function profile(d){const c=C.getCompany(d.company);const [e,v]=await Promise.all([one(c.employees,{id:`eq.${d.employee_id}`}),one(c.vehicles,{id:`eq.${d.vehicle_id}`})]);if(!e||!v||e.active===false||v.active===false)throw Error('Catálogo asignado no disponible');return publicDevice(d,e,v);}
function traccarHeaders(){if(process.env.TRACCAR_GATEWAY_TOKEN)return {'X-Gateway-Token':process.env.TRACCAR_GATEWAY_TOKEN};if(process.env.TRACCAR_TOKEN)return {Authorization:`Bearer ${process.env.TRACCAR_TOKEN}`};if(process.env.TRACCAR_USER&&process.env.TRACCAR_PASSWORD)return {Authorization:`Basic ${Buffer.from(`${process.env.TRACCAR_USER}:${process.env.TRACCAR_PASSWORD}`).toString('base64')}`};throw Error('Credenciales Traccar no configuradas');}
async function ensureTraccar(d){
 if(d.traccar_device_id)return Number(d.traccar_device_id);
 if(!require('./traccar-relay').direct()){
  const found=await require('./traccar-relay').call('device',{uniqueId:d.traccar_unique_id,name:d.label,company:d.company});
  await C.sb(C.tablePath('km_mobile_devices',new URLSearchParams({id:`eq.${d.id}`})),{method:'PATCH',headers:write,body:JSON.stringify({traccar_device_id:found.id})});return Number(found.id);
 }
 const base=process.env.TRACCAR_BASE_URL?.replace(/\/$/,'');if(!base)throw Error('Servidor Traccar pendiente');
 const headers=traccarHeaders(),q=new URLSearchParams({uniqueId:d.traccar_unique_id});
 let r=await fetch(`${base}/api/devices?${q}`,{headers,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Traccar no disponible');
 const list=await r.json();let found=list.find(x=>x.uniqueId===d.traccar_unique_id);
 if(!found){r=await fetch(`${base}/api/devices`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:d.label,uniqueId:d.traccar_unique_id,attributes:{bitacoraCompany:d.company}}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('No se pudo registrar el dispositivo GPS');found=await r.json();}
 await C.sb(C.tablePath('km_mobile_devices',new URLSearchParams({id:`eq.${d.id}`})),{method:'PATCH',headers:write,body:JSON.stringify({traccar_device_id:found.id})});return Number(found.id);
}
async function formBody(req){if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;let b=typeof req.body==='string'?req.body:'';if(!b)for await(const x of req)b+=x;if(b.length>8192)throw Error('Formulario demasiado grande');return Object.fromEntries(new URLSearchParams(b));}
async function loginProfiles(auth){
 const profiles=[];
 if(auth.admin){
  for(const c of Object.values(C.COMPANY)){
   const [employees,vehicles]=await Promise.all([
    C.allRows(c.employees,new URLSearchParams({select:'id,name,area',active:'eq.true',order:'name.asc,id.asc'})),
    C.allRows(c.vehicles,new URLSearchParams({select:'id,plate,type,brand,employee_id',active:'eq.true',order:'plate.asc,id.asc'}))
   ]);
   for(const e of employees){const associated=vehicles.filter(v=>v.employee_id===e.id);if(associated.length===1)profiles.push({...e,company:c.slug,vehicles:associated});}
  }
  return profiles;
 }
 const assigned=await A.assignments(auth),companies=[...new Set(assigned.map(x=>x.company).filter(x=>C.getCompany(x)))],vehicleCache=new Map();
 if(companies.length>1)throw A.fail(409,'Esta cuenta tiene colaboradores asignados en más de una empresa. Auditoría debe corregir el acceso.');
 for(const e of assigned.filter(x=>!companies.length||x.company===companies[0])){
  const c=C.getCompany(e.company);if(!c)continue;
  if(!vehicleCache.has(c.slug))vehicleCache.set(c.slug,await C.allRows(c.vehicles,new URLSearchParams({select:'id,plate,type,brand,employee_id',active:'eq.true',order:'plate.asc,id.asc'})));
  profiles.push({...e,company:c.slug,vehicles:vehicleCache.get(c.slug).filter(v=>v.employee_id===e.id)});
 }
 return profiles.sort((a,b)=>(a.company+a.name).localeCompare(b.company+b.name,'es'));
}
async function entryCall(req,body,context){let status=200;const headers={};let data;const res={setHeader(k,v){headers[k]=v;},get statusCode(){return status},set statusCode(x){status=x},end(x){data=JSON.parse(x)}};await require('../api/entries')({method:'POST',url:`/api/entries?company=${context.company}`,headers:req.headers,body,mobileContext:context},res);return {status,data};}
async function handler(req,res){
 const u=new URL(req.url,'http://localhost'),action=u.searchParams.get('action');
 if(!C.dbReady())return C.send(res,503,{error:'Base de datos no configurada'});
 try{
  if(action==='mobile-pair-create'&&req.method==='POST'){
   if(!await C.requireAudit(req,res))return C.send(res,401,{error:'Sesión de auditoría requerida'});
   const b=await C.readJson(req),c=C.getCompany(b.company);if(!c)return C.send(res,400,{error:'Empresa inválida'});
   const [e,v]=await Promise.all([one(c.employees,{id:`eq.${b.employeeId}`}),one(c.vehicles,{id:`eq.${b.vehicleId}`})]);
   if(!e||!v||e.active===false||v.active===false)return C.send(res,400,{error:'Colaborador o vehículo inválido'});
   const id=crypto.randomUUID(),code=crypto.randomBytes(16).toString('hex');
   await C.sb(C.tablePath('km_mobile_devices'),{method:'POST',headers:write,body:JSON.stringify({id,company:c.slug,employee_id:e.id,vehicle_id:v.id,label:`${c.name} · ${e.name} · ${v.plate||'Placa pendiente'}`,pair_hash:hash(code),pair_expires_at:new Date(Date.now()+30*60000).toISOString(),traccar_unique_id:`bkm-${id}`})});
   return C.send(res,201,{code,id,expiresMinutes:30});
  }
  if(action==='mobile-activate'&&req.method==='POST'){
   const b=await C.readJson(req);if(!/^[a-f0-9]{32}$/.test(b.code||'')||!tokenOK(b.deviceToken))return C.send(res,400,{error:'Código de activación inválido'});
   const existing=await device(b.deviceToken);if(existing)return C.send(res,200,{profile:await profile(existing)});
   const rows=await C.sb(C.tablePath('km_mobile_devices',new URLSearchParams({pair_hash:`eq.${hash(b.code)}`,pair_expires_at:`gt.${new Date().toISOString()}`,activated_at:'is.null',active:'eq.true'})),{method:'PATCH',headers:write,body:JSON.stringify({token_hash:hash(b.deviceToken),activated_at:new Date().toISOString(),pair_hash:null})});
   if(!rows?.length)return C.send(res,401,{error:'Código vencido o ya utilizado. Solicitá uno nuevo.'});return C.send(res,200,{profile:await profile(rows[0])});
  }
  if(action==='mobile-devices'&&req.method==='GET'){
   if(!await C.requireAudit(req,res))return C.send(res,401,{error:'Sesión de auditoría requerida'});
   return C.send(res,200,{items:await C.allRows('km_mobile_devices',new URLSearchParams({select:'id,label,company,active,activated_at,traccar_device_id,created_at',order:'created_at.desc,id.desc'}))});
  }
  if(action==='mobile-revoke'&&req.method==='POST'){
   if(!await C.requireAudit(req,res))return C.send(res,401,{error:'Sesión de auditoría requerida'});const b=await C.readJson(req);if(!uuidOK(b.id))return C.send(res,400,{error:'Dispositivo inválido'});
   await C.sb(C.tablePath('km_mobile_devices',new URLSearchParams({id:`eq.${b.id}`})),{method:'PATCH',headers:write,body:JSON.stringify({active:false,pair_hash:null})});return C.send(res,200,{ok:true});
  }
  if(action==='mobile-position'&&req.method==='POST'){
   const p=await formBody(req),d=await device(p.id);if(!d)return C.send(res,401,{error:'Dispositivo no autorizado'});
   if(p.lat==null||p.lon==null)return C.send(res,200,{accepted:false});
   const lat=Number(p.lat),lon=Number(p.lon),t=Number(p.timestamp),timestampMs=t>=1e12?t:t*1000;if([p.lat,p.lon,p.timestamp].some(x=>!String(x??'').trim())||![lat,lon,t].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lon)>180||t<0||timestampMs>Date.now()+300000)return C.send(res,400,{accepted:false});
   if((process.env.BITACORA_GPS_PROVIDER||'traccar')!=='traccar'){try{const r=await require('./gps').ingestLegacy(d,p);return C.send(res,200,{accepted:true,duplicate:r.duplicate});}catch(e){return C.send(res,e.status||503,{error:'Ubicación no registrada; conservar para reintento'});}}
   await ensureTraccar(d);
   const data=new URLSearchParams({id:d.traccar_unique_id,lat:String(lat),lon:String(lon),timestamp:String(t)});
   for(const k of ['accuracy','altitude','speed','bearing','batt','charge'])if(p[k]!=null&&String(p[k]).length<40)data.set(k,String(p[k]));
   if(!require('./traccar-relay').direct()){await require('./traccar-relay').enqueue('position',Object.fromEntries(data));return C.send(res,200,{accepted:true,queued:true});}
   const r=await fetch(process.env.TRACCAR_INGEST_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...(process.env.TRACCAR_GATEWAY_TOKEN?{'X-Gateway-Token':process.env.TRACCAR_GATEWAY_TOKEN}:{})},body:data,signal:AbortSignal.timeout(12000)});
   return C.send(res,r.ok?200:503,{accepted:r.ok});
  }
  if(action==='mobile-session'&&req.method==='GET'){
   const auth=await A.session(req,res),d=await device(req.headers['x-device-token']);
   return C.send(res,200,{email:auth.user.email||'',admin:auth.admin,passwordChangeRequired:require('./password').required(auth.user),managedCompanies:A.managedCompanies(auth),current:d?await profile(d):null,profiles:await loginProfiles(auth)});
  }
  if(action==='mobile-enroll'&&req.method==='POST'){
   const auth=await A.session(req,res),b=await C.readJson(req),c=C.getCompany(b.company);
   if(!c||!tokenOK(b.deviceToken))throw A.fail(400,'Asignación inválida');
   // No permitir que una cuenta vuelva a registrar un dispositivo revocado.
   const revoked=await one('km_mobile_devices',{token_hash:`eq.${hash(b.deviceToken)}`,active:'eq.false'});
   if(revoked)throw A.fail(403,'Dispositivo revocado. Solicitá a Auditoría que autorice su reactivación.');
   const [e,v]=await Promise.all([one(c.employees,{id:`eq.${b.employeeId}`,active:'eq.true'}),one(c.vehicles,{id:`eq.${b.vehicleId}`,active:'eq.true'})]);
   if(!e||!v||!auth.admin&&v.employee_id&&v.employee_id!==e.id)throw A.fail(400,'Colaborador o vehículo inválido');
   if(!auth.admin){const allowed=await A.assignments(auth);if(!allowed.some(x=>x.company===c.slug&&x.id===e.id))throw A.fail(403,'Esta cuenta no tiene acceso a ese colaborador');}
   const existing=await device(b.deviceToken);
   if(existing){
    if(existing.company!==c.slug||existing.employee_id!==e.id||existing.vehicle_id!==v.id)throw A.fail(409,'El teléfono ya está asignado. Usá Cambiar colaborador.');
    return C.send(res,200,{profile:await profile(existing)});
   }
   const id=crypto.randomUUID(),row={id,company:c.slug,employee_id:e.id,vehicle_id:v.id,label:`${c.name} · ${e.name} · ${v.plate||'Placa pendiente'}`,token_hash:hash(b.deviceToken),activated_at:new Date().toISOString(),pair_hash:null,traccar_unique_id:`bkm-${id}`};
   const rows=await C.sb(C.tablePath('km_mobile_devices'),{method:'POST',headers:write,body:JSON.stringify(row)});
   return C.send(res,201,{profile:await profile(rows[0])});
  }
  const d=await device(req.headers['x-device-token']);if(!d)return C.send(res,401,{error:'Dispositivo no autorizado'});
  if(action==='mobile-session'&&(req.method==='GET'||req.method==='POST')){
   const auth=await A.session(req,res);
   if(req.method==='GET')return C.send(res,200,{email:auth.user.email||'',admin:auth.admin,passwordChangeRequired:require('./password').required(auth.user),managedCompanies:A.managedCompanies(auth),current:await profile(d),profiles:await loginProfiles(auth)});
   const b=await C.readJson(req),c=C.getCompany(b.company);if(!c)return C.send(res,400,{error:'Empresa inválida'});
   const [e,v]=await Promise.all([one(c.employees,{id:`eq.${b.employeeId}`,active:'eq.true'}),one(c.vehicles,{id:`eq.${b.vehicleId}`,active:'eq.true'})]);
   if(!e||!v||!auth.admin&&v.employee_id&&v.employee_id!==e.id)return C.send(res,400,{error:'Colaborador o vehículo inválido'});
   if(!auth.admin){const allowed=await A.assignments(auth);if(!allowed.some(x=>x.company===c.slug&&x.id===e.id))return C.send(res,403,{error:'Esta cuenta no tiene acceso a ese colaborador'});}
   const rows=await C.sb(C.tablePath('km_mobile_devices',new URLSearchParams({id:`eq.${d.id}`,active:'eq.true'})),{method:'PATCH',headers:write,body:JSON.stringify({company:c.slug,employee_id:e.id,vehicle_id:v.id,label:`${c.name} · ${e.name} · ${v.plate||'Placa pendiente'}`})});
   if(!rows?.length)return C.send(res,409,{error:'El teléfono ya no está disponible'});
   return C.send(res,200,{profile:await profile(rows[0]),email:auth.user.email||'',admin:auth.admin});
  }
  if(action==='mobile-gps-config'&&req.method==='POST')return C.send(res,200,{gps:await require('./gps').provision(d,req.headers['x-device-token'])});
  if(action==='mobile-profile'&&req.method==='GET')return C.send(res,200,{profile:await profile(d)});
  if(action==='mobile-receipt'&&req.method==='GET'){
   const id=u.searchParams.get('id');if(!uuidOK(id))return C.send(res,400,{error:'Recorrido inválido'});
   const c=C.getCompany(d.company),item=await one(c.trips,{id:`eq.${id}`});
   if(item&&(item.employee_id!==d.employee_id||item.vehicle_id!==d.vehicle_id))return C.send(res,403,{error:'El recorrido no corresponde a este teléfono'});
   return C.send(res,200,{id,received:!!item});
  }
  if(action==='mobile-finalize'&&req.method==='POST'){
   const b=await C.readJson(req);if(!uuidOK(b.id))return C.send(res,400,{error:'Recorrido inválido'});
   const c=C.getCompany(d.company),item=await one(c.trips,{id:`eq.${b.id}`}),meta=await one('km_mobile_trips',{id:`eq.${b.id}`});
   if(!item||!meta)return C.send(res,404,{error:'Recorrido todavía no recibido'});
   if(item.employee_id!==d.employee_id||item.vehicle_id!==d.vehicle_id||meta.device_id!==d.id)return C.send(res,403,{error:'El recorrido no corresponde a este teléfono'});
   if(item.km_traccar!=null)return C.send(res,200,{id:b.id,gpsFinalized:true,km:Number(item.km_traccar)});
   // "Sin ubicaciones pendientes" en Android solo significa que todos los puntos ya
   // fueron aceptados por la cola durable. Antes de congelar la distancia, esperamos
   // a que el enlace de la PC confirme que no queda ningún punto por entregar a Traccar.
   const relay=require('./traccar-relay');
   const pendingGpsServer=relay.direct()?0:await relay.pendingPositions(d.traccar_unique_id);
   if(pendingGpsServer>0)return C.send(res,200,{id:b.id,gpsFinalized:false,status:'gps_sincronizando',pendingGpsServer});
   await C.sb(C.tablePath('km_mobile_trips',new URLSearchParams({id:`eq.${meta.id}`,device_id:`eq.${d.id}`})),{method:'PATCH',headers:write,body:JSON.stringify({gps_flushed:true})});
   const gps=await require('./traccar-gps').report(c,item);
   if(gps.distance_km==null)return C.send(res,200,{id:b.id,gpsFinalized:false,status:gps.status});
   const patch={km_traccar:gps.distance_km,difference_km:Number((gps.distance_km-Number(item.km_travel)).toFixed(3))};
   const updated=await C.sb(C.tablePath(c.trips,new URLSearchParams({id:`eq.${item.id}`,km_traccar:'is.null'})),{method:'PATCH',headers:write,body:JSON.stringify(patch)});
   const finalItem=updated?.[0]||await one(c.trips,{id:`eq.${item.id}`});
   return C.send(res,200,{id:b.id,gpsFinalized:finalItem?.km_traccar!=null,km:finalItem?.km_traccar==null?null:Number(finalItem.km_traccar),item:finalItem});
  }
  if(action==='mobile-submit'&&req.method==='POST'){
   const b=await C.readJson(req),start=Date.parse(b.startedAt),end=Date.parse(b.endedAt);
   if(!uuidOK(b.id)||!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>Date.now()+300000)return C.send(res,400,{error:'Recorrido u horarios inválidos; revisá la hora del teléfono'});
   const c=C.getCompany(d.company),existing=await one(c.trips,{id:`eq.${b.id}`});
   if(existing&&(existing.employee_id!==d.employee_id||existing.vehicle_id!==d.vehicle_id))return C.send(res,409,{error:'El identificador del recorrido ya está utilizado'});
   if(existing&&(existing.odometer_start_path!==b.odometerStartPath||existing.odometer_end_path!==b.odometerEndPath||Number(existing.km_initial)!==Number(b.kmInitial)||Number(existing.km_final)!==Number(b.kmFinal)||existing.origin!==b.origin||existing.destination!==b.destination||existing.area_request!==b.areaRequest||Date.parse(existing.created_at)!==start))return C.send(res,409,{error:'El recorrido ya fue recibido con otros datos'});
   if(existing&&[['management_type','managementType'],['order_reference','orderReference'],['result','result'],['employee_observation','observation'],['support_path','supportPath']].some(([column,key])=>(existing[column]||'')!==(b[key]||'')))return C.send(res,409,{error:'La gestión ya fue recibida con otros datos o soporte'});
   const meta=await one('km_mobile_trips',{id:`eq.${b.id}`});if(meta&&(meta.device_id!==d.id||Date.parse(meta.started_at)!==start||Date.parse(meta.ended_at)!==end))return C.send(res,409,{error:'Recorrido de otro dispositivo u horarios distintos'});
   const localTime=ms=>new Date(ms-6*3600000).toISOString();
   const body={...b,employeeId:d.employee_id,vehicleId:d.vehicle_id,date:localTime(start).slice(0,10),timeStart:localTime(start).slice(11,16),timeEnd:localTime(end).slice(11,16)};
   const result=existing?{status:200,data:{item:existing}}:await entryCall(req,body,{id:b.id,company:d.company,startedAt:b.startedAt,endedAt:b.endedAt});
   if(result.status>=400)return C.send(res,result.status,result.data);
   const relay=require('./traccar-relay');
   const pendingGpsServer=b.gpsFlushed===true&&!relay.direct()?await relay.pendingPositions(d.traccar_unique_id):0;
   const serverFlushed=b.gpsFlushed===true&&pendingGpsServer===0;
   const initialGpsFlushed=typeof b.gpsFlushed==='boolean'?(b.gpsFlushed===true?serverFlushed:false):null;
   await C.sb(C.tablePath('km_mobile_trips',new URLSearchParams({on_conflict:'id'})),{method:'POST',headers:{...write,Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({id:b.id,device_id:d.id,company:d.company,entry_id:b.id,started_at:b.startedAt,ended_at:b.endedAt,gps_flushed:initialGpsFlushed})});
   // Un reintento solo promueve a "GPS completo" cuando la cola durable del servidor
   // también quedó vacía; Android vacío por sí solo ya no congela una ruta parcial.
   if(serverFlushed)await C.sb(C.tablePath('km_mobile_trips',new URLSearchParams({id:`eq.${b.id}`,device_id:`eq.${d.id}`})),{method:'PATCH',headers:write,body:JSON.stringify({gps_flushed:true})});
   let item=result.data.item,gpsFinalized=item?.km_traccar!=null;
   if(serverFlushed&&!gpsFinalized){
    try{
     const gps=await require('./traccar-gps').report(c,item);
     if(gps.distance_km!=null){
      const patch={km_traccar:gps.distance_km,difference_km:Number((gps.distance_km-Number(item.km_travel)).toFixed(3))};
      const updated=await C.sb(C.tablePath(c.trips,new URLSearchParams({id:`eq.${item.id}`,km_traccar:'is.null'})),{method:'PATCH',headers:write,body:JSON.stringify(patch)});
      item=updated?.[0]||await one(c.trips,{id:`eq.${item.id}`});gpsFinalized=item?.km_traccar!=null;
     }
    }catch(e){console.error('GPS finalization deferred:',String(e.message||e));}
   }
   return C.send(res,200,{id:b.id,item,gpsFinalized,pendingGpsServer,gpsUrl:'/recorrido.html?'+new URLSearchParams({company:d.company,id:b.id})});
  }
  return C.send(res,405,{error:'Operación no permitida'});
 }catch(e){console.error('Mobile operation failed:',String(e.message).replace(/[a-f0-9]{32,64}/g,'[redacted]'));return C.send(res,e.status||503,{error:e.status?e.message:'No se pudo sincronizar. Los datos deben conservarse en el teléfono.'});}
}
module.exports={handler,one,ensureTraccar,traccarHeaders,device};
