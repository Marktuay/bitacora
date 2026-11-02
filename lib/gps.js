const C=require('../api/_config');
const A=require('./auth');
const M=require('./manager-area');
const {normalizePosition}=require('./gps-normalize');
const write={'Content-Type':'application/json',Prefer:'return=representation'};
async function one(table,filters){return (await C.sb(C.tablePath(table,new URLSearchParams({select:'*',...filters,limit:'1'}))))?.[0]||null;}
async function provision(d,token){
 if((process.env.BITACORA_GPS_PROVIDER||'traccar')==='traccar'){
  if(!token||require('node:crypto').createHash('sha256').update(token).digest('hex')!==d.token_hash)throw A.fail(401,'Dispositivo no autorizado');
  return {provider:'traccar',url:(process.env.BITACORA_PUBLIC_URL||'https://bitacora-km.vercel.app').replace(/\/$/,'')+'/api/traccar?action=mobile-position',uniqueId:token};
 }
 const r=await C.sb('/rest/v1/rpc/km_rotate_gps_token',{method:'POST',headers:write,body:JSON.stringify({p_device_id:d.id})});
 return {url:process.env.SUPABASE_URL.replace(/\/$/,'')+'/functions/v1/traccar-ingest',uniqueId:r.unique_id,token:r.token};
}
async function ingestLegacy(d,input){
 let normalized;try{normalized=normalizePosition({...input,id:d.traccar_unique_id});}catch{throw A.fail(400,'Ubicación inválida');}
 let credential=await one('km_gps_credentials',{device_id:`eq.${d.id}`});
 if(!credential){await provision(d);credential=await one('km_gps_credentials',{device_id:`eq.${d.id}`});}
 if(!credential?.enabled)throw A.fail(401,'Recepción GPS revocada');
 const r=await C.sb('/rest/v1/rpc/km_ingest_position',{method:'POST',headers:write,body:JSON.stringify({p_unique_id:d.traccar_unique_id,p_token_hash:credential.token_hash,p_position:normalized.position})});
 if(!r.ok)throw A.fail(r.code==='RATE_LIMITED'?429:r.code==='UNAUTHORIZED'?401:400,'No se pudo registrar la ubicación');
 return r;
}
async function report(company,id){
 const entry=await one(company.trips,{id:`eq.${id}`});if(!entry)throw A.fail(404,'Recorrido no encontrado');
 if((process.env.BITACORA_GPS_PROVIDER||'traccar')==='traccar')return {entry,gps:await require('./traccar-gps').report(company,entry)};
 const trip=await one('km_mobile_trips',{entry_id:`eq.${id}`,company:`eq.${company.slug}`});
 if(!trip)return {entry,gps:{distance_km:null,duration_seconds:null,segments:[],status:'sin_gps_suficiente',message:'Este registro no tiene recorrido móvil asociado.'}};
 const gps=await C.sb('/rest/v1/rpc/km_gps_trip_report',{method:'POST',headers:write,body:JSON.stringify({p_trip_id:trip.id})});
 return {entry,gps};
}
async function handler(req,res){
 try{
  if(!['GET','POST'].includes(req.method))return C.send(res,405,{error:'Método no permitido'});
  const auth=await A.session(req,res),u=new URL(req.url,'http://localhost');
  const automatic=u.searchParams.get('action')==='compare';
  const b=req.method==='POST'?await C.readJson(req):Object.fromEntries(u.searchParams);
  const c=C.getCompany(b.company);if(!c||!/^[a-f0-9-]{36}$/i.test(b.id||''))throw A.fail(400,'Recorrido inválido');
  const entry=await one(c.trips,{id:`eq.${b.id}`});if(!entry)throw A.fail(404,'Recorrido no encontrado');
  const reviewer=A.canReview(auth,c.slug);
  // El mapa detallado es exclusivo de jefaturas autorizadas y Auditoría.
  // El colaborador conserva los valores de comparación en su reporte.
  if(req.method==='GET'&&!reviewer)throw A.fail(403,'La consulta del recorrido GPS requiere permisos de revisión');
  if(reviewer){
   if(!auth.admin&&!M.allowed(auth,c.slug,entry.area_employee))throw A.fail(403,'No tenés acceso a recorridos de esta área');
  }else{
   const profiles=await A.assignments(auth);if(!profiles.some(p=>p.company===c.slug&&p.id===entry.employee_id))throw A.fail(403,'No tenés acceso a este recorrido');
  }
  if(req.method==='POST'&&!automatic&&(!reviewer||(!auth.admin&&!M.allowed(auth,c.slug,entry.area_employee))))throw A.fail(403,'Permiso de revisión requerido');
  // Excepción de auditoría: estos recorridos se completan exclusivamente mediante la revisión manual.
  if(req.method==='POST'&&entry.result==='GPS pendiente de digitación manual'){
   return C.send(res,200,{entry,gps:{distance_km:null,final_distance_km:null,finalized:false,status:'gps_manual_pendiente',segments:[]},traccar:{km:null,differenceKm:null,status:'gps_manual_pendiente',finalized:false}});
  }
  if(req.method==='POST'&&entry.km_traccar!=null&&(automatic||b.force!==true)){
   const km=Number(entry.km_traccar),diff=entry.difference_km==null?Number((km-Number(entry.km_travel)).toFixed(3)):Number(entry.difference_km);
   return C.send(res,200,{entry,gps:{provider:'traccar',distance_km:km,final_distance_km:km,finalized:true,status:'gps_finalizado',segments:[]},traccar:{km,differenceKm:diff,status:'gps_finalizado',finalized:true}});
  }
  if(automatic){
   const trip=await one('km_mobile_trips',{entry_id:`eq.${entry.id}`,company:`eq.${c.slug}`});
   if(trip?.gps_flushed===false)
    return C.send(res,200,{entry,pending:true,retry_after_seconds:15,gps:{status:'gps_en_sincronizacion'}});
   const remaining=trip?90000-(Date.now()-Date.parse(trip.synced_at||trip.ended_at)):0;
   if(trip?.gps_flushed!==true&&remaining>0)
    return C.send(res,200,{entry,pending:true,retry_after_seconds:Math.ceil(remaining/1000),gps:{status:'gps_en_sincronizacion'}});
  }
  const result=await report(c,b.id),gps=result.gps;
  const savedKm=entry.km_traccar==null?null:Number(entry.km_traccar);
  gps.final_distance_km=savedKm;gps.finalized=savedKm!==null;
  if(req.method==='POST'&&gps.distance_km!==null&&gps.distance_km!==undefined){
   const diff=Number((gps.distance_km-Number(entry.km_travel)).toFixed(3));
   const where=new URLSearchParams({id:`eq.${entry.id}`});if(automatic)where.set('km_traccar','is.null');
   const updated=await C.sb(C.tablePath(c.trips,where),{method:'PATCH',headers:write,body:JSON.stringify({km_traccar:gps.distance_km,difference_km:diff})});
   result.entry=automatic?(updated?.[0]||await one(c.trips,{id:`eq.${entry.id}`})):{...entry,km_traccar:gps.distance_km,difference_km:diff};
   const finalKm=result.entry?.km_traccar==null?null:Number(result.entry.km_traccar);
   gps.final_distance_km=finalKm;gps.finalized=finalKm!==null;
   result.traccar={km:finalKm,differenceKm:result.entry?.difference_km,status:gps.status,finalized:finalKm!==null};
  }
  return C.send(res,200,result);
 }catch(e){return C.send(res,e.status||503,{error:e.status?e.message:'No fue posible consultar el recorrido GPS'});}
}
module.exports={provision,ingestLegacy,report,handler};
