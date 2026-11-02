import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createSetupServer,readSettings,localAddresses} from '../lib/local-setup.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const settingsPath=path.join(root,'private','local-server.json');
let app=null,relay=null;
function openBrowser(url){if(process.platform==='win32'&&!process.env.BKM_NO_BROWSER)spawn('cmd.exe',['/d','/c','start','',url],{stdio:'ignore',windowsHide:true}).unref();}
async function startApp(c){
 if(app&&app.exitCode===null){await new Promise(resolve=>{app.once('exit',resolve);app.kill();});}
 if(relay&&relay.exitCode===null){await new Promise(resolve=>{relay.once('exit',resolve);relay.kill();});}
 const built=spawnSync(process.execPath,[path.join(root,'scripts','build.mjs')],{cwd:root,stdio:'inherit'});if(built.status!==0)throw Error('No se pudo preparar la aplicación.');
 const env={...process.env};for(const [key,value] of Object.entries(c))if(key!=='lanIp')env[key]=String(value);
 app=spawn(process.execPath,[path.join(root,'scripts','dev-server.mjs')],{cwd:root,env,stdio:'inherit'});
 app.once('exit',code=>{if(code)console.log('Bitácora se detuvo. Si el puerto 4173 está ocupado, cerrá la ventana anterior.');});
 relay=spawn(process.execPath,[path.join(root,'deployment','traccar-relay-worker.cjs'),'--settings',settingsPath],{cwd:root,env,stdio:'inherit'});
 relay.once('exit',code=>{if(code)console.log('El enlace con Traccar se detuvo. Reiniciá Bitácora KM para restablecer la validación GPS.');});
 let ready=false;
 for(let i=0;i<30;i++){
  try{const r=await fetch('http://127.0.0.1:4173/api/health',{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}
  if(app.exitCode!==null)break;await new Promise(r=>setTimeout(r,200));
 }
 if(!ready)throw Error('El servidor no inició. Revisá los mensajes de esta ventana.');
 console.log(`\nDirección para el APK: http://${c.lanIp}:4173\nGenerar código: http://${c.lanIp}:4173/android\nTraccar: http://${c.lanIp}:8082\nDejá esta ventana abierta mientras usás Bitácora.\n`);
 openBrowser(`http://${c.lanIp}:4173/android`);
}
const {server,token}=createSetupServer({settingsPath,uiDirectory:path.join(root,'scripts','setup-ui'),onConfigured:startApp});
server.on('error',()=>{console.error('La configuración ya está abierta en esta PC. Cerrá la ventana anterior antes de volver a iniciar.');process.exitCode=1;});
server.listen(4174,'127.0.0.1',async()=>{
 const url=`http://127.0.0.1:4174/#${token}`;
 console.log('Bitácora KM · servidor local. La configuración se abre únicamente en esta PC.');
 const c=await readSettings(settingsPath);const ips=localAddresses();
 if(c.SUPABASE_SECRET_KEY&&c.TRACCAR_USER&&c.TRACCAR_PASSWORD&&ips.includes(c.lanIp)){
  try{await startApp(c);}catch(e){console.log(e.message);openBrowser(url);}
 }else openBrowser(url);
 // Se muestra solo en la consola local para recuperar la ventana de configuración.
 console.log('Configuración local:',url);
});
function stop(){if(app)app.kill();if(relay)relay.kill();server.close(()=>process.exit(0));}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
