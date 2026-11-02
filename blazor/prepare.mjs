import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),source=path.dirname(here),runtime=path.join(here,'EngineRuntime'),web=path.join(here,'Bitacora.Web');
await fs.rm(runtime,{recursive:true,force:true});await fs.mkdir(runtime,{recursive:true});
for(const dir of ['api','lib','assets','config'])await fs.cp(path.join(source,dir),path.join(runtime,dir),{recursive:true});
await fs.mkdir(path.join(runtime,'deployment'),{recursive:true});
await fs.copyFile(path.join(source,'deployment/traccar-relay-worker.cjs'),path.join(runtime,'deployment/traccar-relay-worker.cjs'));
for(const file of await fs.readdir(path.join(here,'engine')))if(!['node_modules','tests'].includes(file))await fs.cp(path.join(here,'engine',file),path.join(runtime,file),{recursive:true});
await fs.cp(path.join(here,'engine','node_modules'),path.join(runtime,'node_modules'),{recursive:true});
async function patch(file,before,after){const target=path.join(runtime,file),text=await fs.readFile(target,'utf8');if(!text.includes(before))throw Error('La fuente cambió; revisar adaptación: '+file);await fs.writeFile(target,text.replace(before,after));}
await patch('api/_config.js',"function supabaseKey() { return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }","function supabaseKey() { return process.env.LOCAL_AUTH_SECRET || ''; }");
await patch('api/_config.js','function dbReady() { return Boolean(process.env.SUPABASE_URL && supabaseKey()); }','function dbReady() { return Boolean(process.env.DATABASE_URL && supabaseKey()); }');
{
 const file=path.join(runtime,'api/_config.js');let text=await fs.readFile(file,'utf8');const start=text.indexOf('async function sb('),end=text.indexOf('\nasync function requireAudit',start);if(start<0||end<0)throw Error('Adaptador no encontrado');
 text=text.slice(0,start)+"async function sb(path, options = {}) { return require('../adapter.cjs').rest(path,options); }\n"+text.slice(end);await fs.writeFile(file,text);
}
{
 const file=path.join(runtime,'lib/auth.js');let text=await fs.readFile(file,'utf8');const start=text.indexOf('async function authFetch('),end=text.indexOf('\nasync function session(',start);if(start<0||end<0)throw Error('Autenticación no encontrada');
 text=text.slice(0,start)+"async function authFetch(path,options={}) { return require('../local-auth.cjs').api(path,options); }\n"+text.slice(end);
 text=text.replace("function publicKey() { return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || PUBLIC_KEY; }","function publicKey() { return 'local-postgresql'; }");
 await fs.writeFile(file,text);
}
await patch('api/support.js',"const base = process.env.SUPABASE_URL.replace(/\\/$/,'');","if (signed.startsWith('/evidence/')) return send(res,200,{url:signed});\n      const base = process.env.BITACORA_PUBLIC_URL.replace(/\\/$/,'');");
await patch('lib/gps.js',"process.env.BITACORA_PUBLIC_URL||'https://bitacora-km.vercel.app'","process.env.BITACORA_PUBLIC_URL");
await patch('lib/recovery.js',"encodeURIComponent('https://bitacora-km.vercel.app')","encodeURIComponent(process.env.BITACORA_PUBLIC_URL)");
await patch('lib/traccar-relay.js',"function direct(){return Boolean(process.env.TRACCAR_BASE_URL&&process.env.TRACCAR_INGEST_URL);}","function direct(){return false;} // Durable PostgreSQL queue, also when Traccar is local.");
{
 const file=path.join(runtime,'deployment/traccar-relay-worker.cjs');let text=await fs.readFile(file,'utf8');
 text=text.replace('const key=settings.SUPABASE_SECRET_KEY||settings.SUPABASE_SERVICE_ROLE_KEY;',"const key='local-postgresql';");
 text=text.replace("if(!key||!settings.SUPABASE_URL||!settings.TRACCAR_USER||!settings.TRACCAR_PASSWORD)","if(!settings.TRACCAR_USER||!settings.TRACCAR_PASSWORD)");
 const start=text.indexOf(' async function sb('),end=text.indexOf('\n async function traccar(',start);if(start<0||end<0)throw Error('Enlace GPS cambiado');
 text=text.slice(0,start)+" async function sb(p,options={}){ return require('../adapter.cjs').rest(p,options); }\n"+text.slice(end);await fs.writeFile(file,text);
}
// Keep old runtime environment names out of user-facing errors.
for(const folder of ['api','lib','assets'])for(const name of await fs.readdir(path.join(runtime,folder))){
 if(!name.endsWith('.js'))continue;const file=path.join(runtime,folder,name);let text=await fs.readFile(file,'utf8');
 text=text.replaceAll('La base Supabase aún no está conectada','PostgreSQL aún no está conectado').replaceAll('Conexión a Supabase pendiente de configurar','Conexión a PostgreSQL pendiente de configurar').replaceAll('Supabase no configurado','PostgreSQL no configurado').replaceAll('conectar Supabase en Vercel','configurar PostgreSQL en el servidor').replaceAll('Supabase todavía no está enlazado al proyecto de Vercel','PostgreSQL todavía no está conectado');await fs.writeFile(file,text);
}
const routes={index:['/','/index.html'],form:['/blokon','/conaser','/security','/newcentury','/form.html'],auditoria:['/auditoria','/auditoria.html'],reportes:['/reportes','/reportes.html'],android:['/android','/android.html'],login:['/login','/login.html'],cuenta:['/cuenta','/cuenta.html'],recuperar:['/recuperar','/recuperar.html'],accesos:['/accesos','/accesos.html'],recorrido:['/recorrido','/recorrido.html'],colaboradores:['/colaboradores','/colaboradores.html'],jefes:['/jefes','/jefes.html'],'mobile-auth':['/mobile-auth.html']};
await fs.mkdir(path.join(web,'Components/Pages'),{recursive:true});
const manifest=[];
for(const [file,urls]of Object.entries(routes)){
 const html=await fs.readFile(path.join(source,file+'.html'),'utf8'),head=html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1],body=html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];if(head==null||body==null)throw Error('HTML inválido: '+file);
 const headContent=head.replace(/<meta\s+charset[^>]*>/gi,'').replace(/<meta\s+name="viewport"[^>]*>/gi,'');
 const page=urls.map(x=>'@page "'+x+'"').join('\n')+'\n<HeadContent>'+headContent.replaceAll('@','@@')+'</HeadContent>\n'+body.replaceAll('@','@@')+'\n';
 const name=file.replace(/(^|-)(\w)/g,(_,a,b)=>b.toUpperCase())+'.razor';await fs.writeFile(path.join(web,'Components/Pages',name),page.replace(/[ \t]+$/gm,'').trimEnd()+'\n');manifest.push({source:file+'.html',component:name,routes:urls});
}
const www=path.join(web,'wwwroot');await fs.rm(www,{recursive:true,force:true});await fs.mkdir(www,{recursive:true});
await fs.cp(path.join(runtime,'assets'),path.join(www,'assets'),{recursive:true});await fs.cp(path.join(runtime,'node_modules/leaflet/dist'),path.join(www,'assets/leaflet'),{recursive:true});
await fs.copyFile(path.join(source,'manifest.webmanifest'),path.join(www,'manifest.webmanifest'));
await fs.copyFile(path.join(source,'sw.js'),path.join(www,'sw.js'));
await fs.copyFile(path.join(here,'ui-mobile.css'),path.join(www,'migration-mobile.css'));
await fs.writeFile(path.join(here,'parity-manifest.json'),JSON.stringify({sourceCommit:'901bbec2b78080d3a73f4e7cae7f10f853680c55',architecture:'Blazor static SSR + existing local Node.js business engine + direct PostgreSQL',pages:manifest},null,2)+'\n');
console.log('Preparadas 13 pantallas Blazor y motor PostgreSQL local.');
