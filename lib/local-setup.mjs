import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';

export const privateIp=value=>{if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(String(value)))return false;const n=String(value).split('.').map(Number);return n.every(x=>x>=0&&x<=255)&&(n[0]===10||n[0]===192&&n[1]===168||n[0]===172&&n[1]>=16&&n[1]<=31);};
export function localAddresses(){try{return [...new Set(Object.values(os.networkInterfaces()).flat().filter(x=>x&&x.family==='IPv4'&&!x.internal&&privateIp(x.address)).map(x=>x.address))];}catch{return [];}}
export async function readSettings(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
export function combineSettings(old,body){
 const c={...old};
 const ip=String(body.lanIp||old.lanIp||'192.168.11.40').trim();if(!privateIp(ip))throw Error('Revisá la dirección IPv4 de esta PC.');
 for(const [field,key] of [['supabaseKey','SUPABASE_SECRET_KEY'],['auditPin','AUDIT_PIN'],['reportPin','REPORT_PIN'],['traccarUser','TRACCAR_USER'],['traccarPassword','TRACCAR_PASSWORD']])if(typeof body[field]==='string'&&body[field])c[key]=body[field];
 Object.assign(c,{lanIp:ip,PORT:'4173',SUPABASE_URL:'https://ztkvymdcnpoiiqkuwgoj.supabase.co',SUPPORT_BUCKET:'bitacora-soportes',KM_TOLERANCE:old.KM_TOLERANCE||'3',TRACCAR_BASE_URL:'http://127.0.0.1:8082',TRACCAR_INGEST_URL:'http://127.0.0.1:5055',TRACCAR_PUBLIC_URL:`http://${ip}:8082`});
 for(const k of ['SUPABASE_SECRET_KEY','AUDIT_PIN','REPORT_PIN','TRACCAR_USER','TRACCAR_PASSWORD'])if(!c[k])throw Error('Completá los accesos que faltan.');
 return c;
}
export async function verifyConnections(c){
 const headers={apikey:c.SUPABASE_SECRET_KEY,...(c.SUPABASE_SECRET_KEY.startsWith('eyJ')?{Authorization:`Bearer ${c.SUPABASE_SECRET_KEY}`}:{})};
 let r;try{r=await fetch(c.SUPABASE_URL+'/rest/v1/km_mobile_devices?select=id&limit=1',{headers,signal:AbortSignal.timeout(12000)});}catch{throw Error('La PC necesita internet para conectar con Supabase.');}
 if(!r.ok)throw Error('Supabase no autorizó el acceso. Revisá la clave del servidor y las tablas móviles.');
 try{r=await fetch('http://127.0.0.1:8082/api/devices',{headers:{Authorization:'Basic '+Buffer.from(`${c.TRACCAR_USER}:${c.TRACCAR_PASSWORD}`).toString('base64')},signal:AbortSignal.timeout(6000)});}catch{throw Error('No se pudo abrir Traccar en esta PC. Verificá que funcione http://localhost:8082.');}
 if(!r.ok)throw Error('Traccar rechazó el usuario o la contraseña. Usá los mismos del panel Traccar.');
 if(!Array.isArray(await r.json()))throw Error('La respuesta de Traccar no es válida.');
 await new Promise((resolve,reject)=>{const socket=net.createConnection({host:'127.0.0.1',port:5055});const fail=()=>{socket.destroy();reject(Error('Traccar no está recibiendo GPS en el puerto 5055.'));};socket.setTimeout(4000,fail);socket.once('error',fail);socket.once('connect',()=>{socket.destroy();resolve();});});
}
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
export function createSetupServer({settingsPath,uiDirectory,token=crypto.randomBytes(32).toString('hex'),verify=verifyConnections,onConfigured=async()=>{}}){
 let saving=false;
 const server=http.createServer(async(req,res)=>{
  try{
   const host=req.headers.host||'';
   if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host))return json(res,403,{error:'Configuración disponible solamente desde esta PC.'});
   if(req.headers.origin&&req.headers.origin!==`http://${host}`)return json(res,403,{error:'Origen no permitido.'});
   if(req.method==='GET'&&['/','/setup.js'].includes(req.url)){
    const file=path.join(uiDirectory,req.url==='/'?'local-setup.html':'local-setup.js');
    res.writeHead(200,{'content-type':req.url==='/'?'text/html; charset=utf-8':'application/javascript; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});return res.end(await fs.readFile(file));
   }
   const actual=Buffer.from(req.headers['x-setup-token']||''),expected=Buffer.from(token);
   if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return json(res,403,{error:'Abrí la configuración desde INICIAR_BITACORA.cmd.'});
   const old=await readSettings(settingsPath);
   if(req.method==='GET'&&req.url==='/state')return json(res,200,{lanIp:old.lanIp||'192.168.11.40',addresses:localAddresses(),hasSupabaseKey:!!old.SUPABASE_SECRET_KEY,hasPins:!!old.AUDIT_PIN&&!!old.REPORT_PIN,hasTraccarCredentials:!!old.TRACCAR_USER&&!!old.TRACCAR_PASSWORD});
   if(req.method!=='POST'||req.url!=='/save')return json(res,404,{error:'Página no encontrada.'});
   if(saving)return json(res,409,{error:'Ya se está guardando la configuración.'});
   saving=true;
   try{
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)throw Error('Formulario demasiado grande.');}
    const next=combineSettings(old,JSON.parse(raw));await verify(next);
    await fs.mkdir(path.dirname(settingsPath),{recursive:true});const tmp=settingsPath+'.tmp-'+crypto.randomUUID();await fs.writeFile(tmp,JSON.stringify(next,null,2),{mode:0o600});await fs.rename(tmp,settingsPath);
    await onConfigured(next);return json(res,200,{ok:true,appUrl:`http://${next.lanIp}:4173`,panelUrl:`http://${next.lanIp}:4173/android`,gpsUrl:next.TRACCAR_PUBLIC_URL});
   }finally{saving=false;}
  }catch(e){json(res,400,{error:e instanceof SyntaxError?'Revisá el formulario.':e.message||'No se pudo guardar.'});}
 });return {server,token};
}
