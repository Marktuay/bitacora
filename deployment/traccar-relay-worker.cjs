const fs=require('node:fs'),path=require('node:path');
const {localEndpoint,estimateRoads}=require('../lib/road-match');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function createWorker(settings,{fetcher=fetch}={}){
 const key=settings.SUPABASE_SECRET_KEY||settings.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!settings.SUPABASE_URL||!settings.TRACCAR_USER||!settings.TRACCAR_PASSWORD)throw Error('Falta la configuración privada del piloto');
 const roadsEndpoint=localEndpoint(settings.OSRM_URL);
 const sbHeaders={apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})};
 const gpsHeaders={Authorization:'Basic '+Buffer.from(settings.TRACCAR_USER+':'+settings.TRACCAR_PASSWORD).toString('base64'),Accept:'application/json'};
 async function sb(p,options={}){
  const r=await fetcher(settings.SUPABASE_URL.replace(/\/$/,'')+p,{...options,headers:{...sbHeaders,...options.headers},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Cola temporal no disponible');const t=await r.text();return t?JSON.parse(t):null;
 }
 async function traccar(p,options={}){
  const r=await fetcher((settings.TRACCAR_BASE_URL||'http://127.0.0.1:8082').replace(/\/$/,'')+p,{...options,headers:{...gpsHeaders,...options.headers},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Traccar no disponible');return r.json();
 }
 async function execute(job){
  const b=job.payload;
  if(job.operation==='position'){
   const r=await fetcher(settings.TRACCAR_INGEST_URL||'http://127.0.0.1:5055',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(b),signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('Traccar no confirmó la posición');return {accepted:true};
  }
  if(job.operation==='device'){
   const devices=await traccar('/api/devices?'+new URLSearchParams({uniqueId:b.uniqueId}));
   let d=devices.find(d=>d.uniqueId===b.uniqueId);
   if(!d)d=await traccar('/api/devices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:b.name,uniqueId:b.uniqueId,attributes:{bitacoraCompany:b.company}})});
   return {id:d.id};
  }
  if(['route','summary'].includes(job.operation)){
   const positions=await traccar('/api/reports/'+job.operation+'?'+new URLSearchParams(b));
   if(job.operation!=='route'||!roadsEndpoint)return positions;
   const points=positions.filter(p=>Number(p.deviceId)===Number(b.deviceId)&&Date.parse(p.fixTime)>=Date.parse(b.from)&&Date.parse(p.fixTime)<=Date.parse(b.to));
   return {positions,road_match:{...await estimateRoads(points,{endpoint:roadsEndpoint,fetcher}),use_for_distance:settings.OSRM_DISTANCE_MODE==='validated'}};
  }
  throw Error('Operación inválida');
 }
 async function processJob(job){
  try{
   const response=await execute(job);
   await sb('/rest/v1/km_traccar_relay_jobs?id=eq.'+job.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'done',response,payload:{},lease_until:null})});
   return true;
  }catch{
   await sb('/rest/v1/km_traccar_relay_jobs?id=eq.'+job.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'queued',lease_until:null,available_at:new Date(Date.now()+5000).toISOString()})}).catch(()=>{});
   return false;
  }
 }
 async function tick(){
  const jobs=await sb('/rest/v1/rpc/km_claim_traccar_relay_jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_limit:30})});
  for(let i=0;i<(jobs||[]).length;i+=6)await Promise.all(jobs.slice(i,i+6).map(processJob));
  return jobs?.length||0;
 }
 async function heartbeat(){
  let online=false;try{await traccar('/api/server');online=true;}catch{}
  await sb('/rest/v1/km_traccar_relay_status?on_conflict=id',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'pilot',last_seen:new Date().toISOString(),traccar_online:online,version:roadsEndpoint?'1.4.9-relay-osrm':'1.4.9-relay'})});
  await sb('/rest/v1/km_traccar_relay_jobs?expires_at=lt.'+encodeURIComponent(new Date().toISOString()),{method:'DELETE'});
 }
 return {tick,heartbeat,execute,processJob};
}
async function main(){
 const index=process.argv.indexOf('--settings');if(index<0||!process.argv[index+1])throw Error('Indicá el archivo privado del piloto');
 const settings=JSON.parse(fs.readFileSync(path.resolve(process.argv[index+1]),'utf8'));
 const worker=createWorker(settings);let lastHeartbeat=0,lastState='';
 for(;;){
  try{if(Date.now()-lastHeartbeat>15000){await worker.heartbeat();lastHeartbeat=Date.now();}await worker.tick();if(lastState!=='ok'){console.log(new Date().toISOString()+' Conexión saliente con Traccar lista.');lastState='ok';}await sleep(1000);}
  catch{if(lastState!=='retry'){console.log(new Date().toISOString()+' Sin conexión. Se conserva la cola y se reintentará.');lastState='retry';}await sleep(5000);}
 }
}
if(require.main===module)main().catch(()=>{console.error('No se pudo iniciar el enlace Traccar. Revisá la configuración privada.');process.exitCode=1;});
module.exports={createWorker};
