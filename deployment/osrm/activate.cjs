const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
 const index=process.argv.indexOf('--settings');
 if(index<0||!process.argv[index+1])throw Error('Usá --settings con el archivo privado del enlace Traccar');
 const file=path.resolve(process.argv[index+1]),settings=JSON.parse(await fs.readFile(file,'utf8'));
 if(!settings.SUPABASE_URL||!settings.TRACCAR_USER||!settings.TRACCAR_PASSWORD)throw Error('El archivo no corresponde al enlace Traccar configurado');
 // A root probe contains no GPS coordinates. Enable only after the local service responds.
 const response=await fetch('http://127.0.0.1:5000/',{redirect:'error',signal:AbortSignal.timeout(5000)});
 const data=await response.json();
 if(data.code!=='InvalidUrl')throw Error('El puerto 5000 no respondió como OSRM; no se modificó la configuración');
 const backup=file+'.before-osrm-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 await fs.copyFile(file,backup,require('node:fs').constants.COPYFILE_EXCL);
 settings.OSRM_URL='http://127.0.0.1:5000';
 settings.OSRM_DISTANCE_MODE='validated';
 const temporary=file+'.tmp-'+crypto.randomUUID();
 await fs.writeFile(temporary,JSON.stringify(settings,null,2)+'\n',{mode:0o600});await fs.rename(temporary,file);
 console.log('Validación automática por calles activada para recorridos completos y confiables. Reiniciá el enlace Traccar. Se conservó una copia privada de la configuración.');
}
if(require.main===module)main().catch(()=>{console.error('No se pudo activar OSRM. Verificá que esté iniciado en esta PC y que el archivo de configuración sea correcto.');process.exitCode=1;});
