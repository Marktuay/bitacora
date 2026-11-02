'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const fail=(status,message)=>Object.assign(Error('Supabase '+status+': '+message),{status});
const root=()=>path.join(process.env.BITACORA_DATA_DIR,'evidence');
function detectedType(bytes){
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(bytes.toString('ascii',0,5)==='%PDF-')return 'application/pdf';return null;
}
function resolve(parts){
 const relative=parts.map(x=>decodeURIComponent(x)).join('/');
 if(relative.includes('..')||relative.includes('\\')||relative.includes('\0')||path.isAbsolute(relative)||!/^bitacora-soportes\/(blokon|conaser|security|newcentury)\/(support|odometer-start|odometer-end)\/.+/.test(relative))throw fail(400,'Ruta inválida');
 const target=path.resolve(root(),relative);if(!target.startsWith(path.resolve(root())+path.sep))throw fail(400,'Ruta inválida');return {relative,target};
}
function signature(relative,expires){return crypto.createHmac('sha256',process.env.LOCAL_AUTH_SECRET).update(relative+'\n'+expires).digest('hex');}
async function operation(raw,options){
 const u=new URL(raw,'http://local'),parts=u.pathname.split('/').filter(Boolean),action=['info','sign'].includes(parts[3])?parts.splice(3,1)[0]:'object';
 const {relative,target}=resolve(parts.slice(3)),method=options.method||'GET';
 if(action==='info'){
  let bytes;try{bytes=await fs.readFile(target);}catch(e){if(e.code==='ENOENT')throw fail(404,'Archivo no encontrado');throw e;}
  return {content_type:detectedType(bytes),size:bytes.length};
 }
 if(action==='sign'&&method==='POST'){
  await fs.access(target).catch(()=>{throw fail(404,'Archivo no encontrado');});
  const expires=Date.now()+900000;
  return {signedURL:'/evidence/'+relative.split('/').map(encodeURIComponent).join('/')+'?expires='+expires+'&signature='+signature(relative,expires)};
 }
 if(method==='POST'){
  const bytes=Buffer.from(options.body);if(bytes.length>3*1024*1024)throw fail(413,'Archivo demasiado grande');
  await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
  try{await fs.writeFile(target,bytes,{flag:'wx',mode:0o600});}catch(e){if(e.code==='EEXIST')throw fail(409,'Archivo ya recibido');throw e;}
  return {Key:relative};
 }
 if(method==='DELETE'){await fs.unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});return {};}
 throw fail(405,'Operación no permitida');
}
async function serve(req,res){
 const u=new URL(req.url,'http://local'),{relative,target}=resolve(u.pathname.split('/').filter(Boolean).slice(1)),expires=u.searchParams.get('expires'),provided=u.searchParams.get('signature')||'';
 if(!/^\d+$/.test(expires||'')||Number(expires)<Date.now()||Number(expires)>Date.now()+901000||!/^[a-f0-9]{64}$/.test(provided)||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(signature(relative,expires)))){res.statusCode=403;return res.end('Enlace vencido o inválido');}
 let bytes;try{bytes=await fs.readFile(target);}catch{res.statusCode=404;return res.end('Archivo no encontrado');}
 res.setHeader('Content-Type',detectedType(bytes)||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Length',String(bytes.length));res.end(req.method==='HEAD'?undefined:bytes);
}
module.exports={operation,serve,resolve};
