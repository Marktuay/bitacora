'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const privateDir=process.env.BITACORA_DATA_DIR;
if(!privateDir||!process.env.LOCAL_API_SECRET)throw Error('El motor debe iniciarse desde Bitácora.Web');
fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
const settings=path.join(privateDir,'settings.json');
if(fs.existsSync(settings)){
 const config=JSON.parse(fs.readFileSync(settings,'utf8'));
 const keys=['DATABASE_URL','BITACORA_PUBLIC_URL','TRACCAR_BASE_URL','TRACCAR_INGEST_URL','TRACCAR_USER','TRACCAR_PASSWORD','TRACCAR_TOKEN','TRACCAR_GATEWAY_TOKEN','OSRM_URL','OSRM_DISTANCE_MODE','SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'];
 for(const k of keys)if(!process.env[k]&&typeof config[k]==='string')process.env[k]=config[k];
}
const secretFile=path.join(privateDir,'auth-secret');
if(!fs.existsSync(secretFile))try{fs.writeFileSync(secretFile,crypto.randomBytes(48).toString('hex'),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
process.env.LOCAL_AUTH_SECRET=fs.readFileSync(secretFile,'utf8').trim();
process.env.BITACORA_GPS_PROVIDER='traccar';
const routes=new Set(['catalog','entries','health','latest','report','report-xlsx','report-pdf','support','traccar','session','access','team']);
const C=require('./api/_config'),A=require('./lib/auth');
const {pool}=require('./database.cjs');
async function authorizeWrite(req,res){
 const u=new URL(req.url,'http://local');
 if(req.method!=='POST'||!['/api/entries','/api/support'].includes(u.pathname))return;
 if(req.headers['x-device-token']){
  const d=await require('./lib/mobile-api').device(req.headers['x-device-token']);
  if(!d)throw A.fail(401,'Dispositivo no autorizado');
  const body=await C.readJson(req);req.body=body;
  if(d.company!==String(body.company||u.searchParams.get('company')))throw A.fail(403,'Empresa no autorizada');
  // Desktop entries use user sessions; phone entries must use mobile-submit.
  if(u.pathname==='/api/entries')throw A.fail(403,'Usá el registro móvil para este recorrido');
  return;
 }
 const auth=await A.session(req,res),body=await C.readJson(req);req.body=body;
 const company=String(body.company||u.searchParams.get('company'));
 if(auth.admin)return;
 if(u.pathname==='/api/entries'){
  const assignments=await A.assignments(auth);
  if(!assignments.some(p=>p.company===company&&p.id===body.employeeId))throw A.fail(403,'No tenés acceso a este colaborador');
 }else if(!A.canReview(auth,company)&&!(await A.assignments(auth)).some(p=>p.company===company))throw A.fail(403,'Empresa no autorizada');
}
const server=http.createServer(async(req,res)=>{
 try{
  const supplied=String(req.headers['x-engine-secret']||'');
  if(supplied.length!==process.env.LOCAL_API_SECRET.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(process.env.LOCAL_API_SECRET))){res.statusCode=403;return res.end('Forbidden');}
  const u=new URL(req.url,'http://local');
  if(u.pathname.startsWith('/evidence/'))return await require('./storage.cjs').serve(req,res);
  if(!u.pathname.startsWith('/api/')||!routes.has(u.pathname.slice(5)))return C.send(res,404,{error:'Ruta no encontrada'});
  A.csrf(req);
  if(req.method!=='GET'&&req.method!=='HEAD'){
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>5*1024*1024)return C.send(res,413,{error:'Solicitud demasiado grande'});chunks.push(chunk);}
   const buffer=Buffer.concat(chunks);
   if(req.headers['content-type']?.startsWith('application/json')){
    try{req.body=buffer.length?JSON.parse(buffer.toString()):{};}catch{throw A.fail(400,'JSON inválido');}
   }else req.body=buffer.toString('utf8');
  }
  await authorizeWrite(req,res);
  return await require('./api/'+u.pathname.slice(5)+'.js')(req,res);
 }catch(e){
  console.error('Operación local fallida',e.code||e.status||e.name);
  if(!res.headersSent)C.send(res,e.status||500,{error:e.status?e.message:'No fue posible completar la operación'});else res.end();
 }
});
async function main(){
 const r=await pool().query("select exists(select 1 from information_schema.tables where table_schema='local_auth' and table_name='sessions') as ready");
 if(!r.rows[0].ready)throw Error('Ejecutá la preparación de la base antes de iniciar');
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.LOCAL_API_PORT),'127.0.0.1',resolve);});
 console.log('BITACORA_ENGINE_READY');
 if(process.env.TRACCAR_USER&&process.env.TRACCAR_PASSWORD&&!require('./lib/traccar-relay').direct()){
  const worker=require('./deployment/traccar-relay-worker.cjs').createWorker(process.env);
  let lastHeartbeat=0;
  async function tick(){try{await worker.tick();if(Date.now()-lastHeartbeat>15000){await worker.heartbeat();lastHeartbeat=Date.now();}}catch(e){console.error('Traccar local: entrega pendiente; la cola se conserva.');}setTimeout(tick,1000).unref();}
  tick();
 }else console.log('Traccar pendiente de configurar; los recorridos no se darán por validados.');
}
main().catch(e=>{console.error('No se pudo iniciar el motor local:',e.code||e.message);process.exit(1);});
process.on('SIGTERM',()=>server.close(()=>pool().end().finally(()=>process.exit(0))));
