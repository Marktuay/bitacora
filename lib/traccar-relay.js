const crypto=require('node:crypto'),C=require('../api/_config'),A=require('./auth');
const write={'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'};
function jobId(operation,payload){
 const seed=operation==='position'||operation==='device'?JSON.stringify(payload):crypto.randomUUID();
 return crypto.createHash('sha256').update(operation+':'+seed).digest('hex');
}
async function enqueue(operation,payload){
 const id=jobId(operation,payload);
 const expires=new Date(Date.now()+(operation==='position'||operation==='device'?14*86400000:300000)).toISOString();
 await C.sb(C.tablePath('km_traccar_relay_jobs',new URLSearchParams({on_conflict:'id'})),{method:'POST',headers:write,body:JSON.stringify({id,operation,payload,expires_at:expires})});
 return {id,accepted:true,queued:true};
}
async function call(operation,payload,{waitMs=10000}={}){
 const {id}=await enqueue(operation,payload);
 const until=Date.now()+waitMs;
 do{
  const rows=await C.sb(C.tablePath('km_traccar_relay_jobs',new URLSearchParams({select:'status,response',id:`eq.${id}`,limit:'1'})));
  if(rows?.[0]?.status==='done')return rows[0].response;
  if(Date.now()>=until)break;
  await new Promise(r=>setTimeout(r,700));
 }while(Date.now()<until);
 throw A.fail(503,'Traccar todavía no confirmó la entrega. La información se conserva para reintento.');
}
async function pendingPositions(uniqueId){
 if(direct()||!uniqueId)return 0;
 const rows=await C.sb(C.tablePath('km_traccar_relay_jobs',new URLSearchParams({
  select:'id',operation:'eq.position',status:'in.(queued,processing)','payload->>id':`eq.${uniqueId}`,limit:'10000'
 })));
 return rows?.length||0;
}
function direct(){return Boolean(process.env.TRACCAR_BASE_URL&&process.env.TRACCAR_INGEST_URL);}
module.exports={call,enqueue,pendingPositions,direct};
