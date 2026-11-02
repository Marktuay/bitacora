const http=require('node:http'),crypto=require('node:crypto');
function createGateway({token,baseUrl='http://127.0.0.1:8082',ingestUrl='http://127.0.0.1:5055',user,password,fetcher=fetch}){
 if(!/^[a-f0-9]{64}$/.test(token||'')||!user||!password)throw Error('Configuración privada del puente incompleta');
 const authorized=value=>{const a=Buffer.from(String(value||'')),b=Buffer.from(token);return a.length===b.length&&crypto.timingSafeEqual(a,b);};
 const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
 return http.createServer(async(req,res)=>{
  if(!authorized(req.headers['x-gateway-token']))return json(res,401,{error:'Acceso no autorizado'});
  try{
   const u=new URL(req.url,'http://localhost');let target;
   if(req.method==='GET'&&u.pathname==='/health')return json(res,200,{ok:true,provider:'traccar'});
   if(u.pathname==='/ingest'&&req.method==='POST')target=ingestUrl;
   else if(u.pathname==='/api/devices'&&['GET','POST'].includes(req.method)){
    if(req.method==='GET'&&!u.searchParams.get('uniqueId'))return json(res,400,{error:'Identificador requerido'});
    target=baseUrl.replace(/\/$/,'')+u.pathname+u.search;
   }else if(['/api/reports/route','/api/reports/summary'].includes(u.pathname)&&req.method==='GET'){
    if(!/^\d+$/.test(u.searchParams.get('deviceId')||''))return json(res,400,{error:'Dispositivo inválido'});
    const from=Date.parse(u.searchParams.get('from')),to=Date.parse(u.searchParams.get('to'));
    if(!Number.isFinite(from)||!Number.isFinite(to)||to<from||to-from>86400000*7)return json(res,400,{error:'Período inválido'});
    target=baseUrl.replace(/\/$/,'')+u.pathname+u.search;
   }else return json(res,404,{error:'Operación no disponible'});
   let body; if(req.method==='POST'){const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)return json(res,413,{error:'Solicitud demasiado grande'});chunks.push(chunk);}body=Buffer.concat(chunks);}
   const response=await fetcher(target,{method:req.method,headers:{Accept:'application/json',Authorization:'Basic '+Buffer.from(user+':'+password).toString('base64'),...(body?{'Content-Type':u.pathname==='/ingest'?'application/x-www-form-urlencoded':'application/json'}:{})},body,redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)return json(res,503,{error:'Traccar no confirmó la operación'});
   res.writeHead(200,{'content-type':response.headers.get('content-type')||'application/json','cache-control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{return json(res,503,{error:'Traccar no disponible. Conservar para reintento.'});}
 });
}
if(require.main===module){
 const server=createGateway({token:process.env.TRACCAR_GATEWAY_TOKEN,user:process.env.TRACCAR_USER,password:process.env.TRACCAR_PASSWORD});
 server.listen(Number(process.env.GATEWAY_PORT||4291),'127.0.0.1',()=>console.log('Puente Traccar listo en esta PC.'));
}
module.exports={createGateway};
