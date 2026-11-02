const fs=require('node:fs/promises'),path=require('node:path');
async function main(){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
 if(!arg('--project')||!arg('--settings'))throw Error('Indicá --project con la carpeta existente y --settings con su configuración privada.');
 const target=path.resolve(arg('--project')),settingsFile=path.resolve(arg('--settings'));
 const settings=JSON.parse(await fs.readFile(settingsFile,'utf8'));
 if(!settings.SUPABASE_URL||!settings.TRACCAR_USER||!settings.TRACCAR_PASSWORD)throw Error('La configuración privada no corresponde al enlace Traccar.');
 const source=path.resolve(__dirname,'../..');
 const files=['deployment/traccar-relay-worker.cjs','lib/road-match.js',
  'deployment/osrm/prepare.sh','deployment/osrm/compose.yaml','deployment/osrm/activate.cjs','deployment/osrm/README.md'];
 const backup=path.join(target,'private','backup-gps-'+new Date().toISOString().replace(/[:.]/g,'-'));
 // Validate every source before changing any destination; do not copy private settings or data.
 for(const file of files)await fs.access(path.join(source,file));
 for(const file of files){
  const from=path.join(source,file),to=path.join(target,file);if(from===to)continue;
  try{await fs.access(to);await fs.mkdir(path.dirname(path.join(backup,file)),{recursive:true});await fs.copyFile(to,path.join(backup,file));}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(from,to);
 }
 console.log('Enlace actualizado a 1.4.9-relay. Se conservaron configuración privada, base Traccar y mapas existentes. Prepará OSRM y ejecutá activate.cjs antes de reiniciar el enlace.');
}
if(require.main===module)main().catch(e=>{console.error('No se completó la actualización. '+(e.code?'Revisá las rutas y permisos.':e.message));process.exitCode=1;});
