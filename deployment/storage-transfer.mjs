// Copia fiel del bucket privado. Sin dependencias; Node 24.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const [mode,folder]=process.argv.slice(2);
if(!['export','import'].includes(mode)||!folder){console.log('node deployment/storage-transfer.mjs export|import CARPETA\nEntorno: SOURCE_SUPABASE_URL, SOURCE_SUPABASE_KEY; o DEST_SUPABASE_URL, DEST_SUPABASE_KEY.');process.exit(mode==='--help'?0:1);}
const prefix=mode==='export'?'SOURCE':'DEST',base=process.env[prefix+'_SUPABASE_URL']?.replace(/\/$/,''),key=process.env[prefix+'_SUPABASE_KEY'];
if(!base||!key)throw Error('Falta URL o clave en el entorno privado');
if(mode==='import'&&new URL(base).hostname.endsWith('.supabase.co'))throw Error('La importación solo se permite en el servidor propio, para proteger la base existente.');
const root=path.resolve(folder),bucket='bitacora-soportes',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const headers={apikey:key,...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{})};
async function request(p,o={}){const r=await fetch(base+'/storage/v1/'+p,{...o,headers:{...headers,...o.headers},signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`Storage ${r.status}: ${p}`);return r;}
function local(name){const p=path.resolve(root,'objects',name);if(!p.startsWith(path.join(root,'objects')+path.sep))throw Error('Ruta de objeto inválida');return p;}
const remote=name=>'object/'+bucket+'/'+name.split('/').map(encodeURIComponent).join('/');
if(mode==='export'){
 await fs.mkdir(root,{recursive:true,mode:0o700});const objects=[];
 async function walk(prefix=''){
  for(let offset=0;;offset+=100){
   const rows=await (await request('object/list/'+bucket,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}})})).json();
   for(const item of rows){const name=prefix?prefix+'/'+item.name:item.name;if(!item.id){await walk(name);continue;}
    const r=await request(remote(name)),bytes=Buffer.from(await r.arrayBuffer());const p=local(name);await fs.mkdir(path.dirname(p),{recursive:true,mode:0o700});await fs.writeFile(p,bytes,{mode:0o600});objects.push({name,size:bytes.length,sha256:sha(bytes),contentType:r.headers.get('content-type')||item.metadata?.mimetype||'application/octet-stream'});
   }if(rows.length<100)break;
  }
 }
 await walk();await fs.writeFile(path.join(root,'storage-manifest.json'),JSON.stringify({bucket,exportedAt:new Date().toISOString(),objects},null,2),{mode:0o600});console.log(`Exportados ${objects.length} archivos privados.`);
}else{
 const manifest=JSON.parse(await fs.readFile(path.join(root,'storage-manifest.json'),'utf8'));if(manifest.bucket!==bucket)throw Error('Bucket inesperado');
 // El bucket debe estar creado como privado antes de importar. Nunca sobrescribir objetos distintos.
 const meta=await(await request('bucket/'+bucket)).json();if(meta.public)throw Error('El bucket destino debe ser privado');
 for(const item of manifest.objects){const bytes=await fs.readFile(local(item.name));if(bytes.length!==item.size||sha(bytes)!==item.sha256)throw Error('Archivo local alterado: '+item.name);
  const existing=await fetch(base+'/storage/v1/'+remote(item.name),{headers,signal:AbortSignal.timeout(60000)});
  if(existing.ok){if(sha(Buffer.from(await existing.arrayBuffer()))!==item.sha256)throw Error('Conflicto de archivo destino: '+item.name);continue;}
  if(![400,404].includes(existing.status))throw Error('No se pudo verificar el destino');
  await request(remote(item.name),{method:'POST',headers:{'Content-Type':item.contentType,'x-upsert':'false'},body:bytes});
  const copied=Buffer.from(await(await request(remote(item.name))).arrayBuffer());if(sha(copied)!==item.sha256)throw Error('Verificación de copia falló: '+item.name);
 }console.log(`Verificados ${manifest.objects.length} archivos en el destino.`);
}
