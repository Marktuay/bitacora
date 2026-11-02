const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');

test('Configuración LAN: solo PC, origen y token correctos; claves no expuestas',async t=>{
 const {createSetupServer}=await import('../lib/local-setup.mjs');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'km-lan-'));const file=path.join(dir,'private.json');
 const before={lanIp:'192.168.11.40',SUPABASE_SECRET_KEY:'private-test-key',AUDIT_PIN:'private-audit',REPORT_PIN:'private-report'};await fs.writeFile(file,JSON.stringify(before));let started;
 const {server,token}=createSetupServer({settingsPath:file,uiDirectory:path.resolve('scripts/setup-ui'),verify:async c=>{assert.equal(c.SUPABASE_SECRET_KEY,before.SUPABASE_SECRET_KEY);if(c.TRACCAR_PASSWORD==='incorrect')throw Error('Acceso rechazado');},onConfigured:async c=>{started=c;}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`;
 const save=(body,headers={})=>fetch(base+'/save',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/state')).status,403);
 const foreignHostStatus=await new Promise((resolve,reject)=>{http.get(base+'/',{headers:{host:'malicious.invalid:4174'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
 assert.equal(foreignHostStatus,403);
 assert.equal((await save({traccarUser:'auditor',traccarPassword:'correct'},{'x-setup-token':token,origin:'https://other.example'})).status,403);
 const state=await (await fetch(base+'/state',{headers:{'x-setup-token':token}})).text();assert.ok(!state.includes('private-'));assert.equal(JSON.parse(state).hasSupabaseKey,true);
 assert.equal((await save({traccarUser:'auditor',traccarPassword:'incorrect'},{'x-setup-token':token})).status,400);assert.deepEqual(JSON.parse(await fs.readFile(file)),before);
 const r=await save({lanIp:'192.168.11.40',traccarUser:'auditor',traccarPassword:'correct',SUPABASE_URL:'https://attacker.example'},{'x-setup-token':token});assert.equal(r.status,200);const result=await r.json();assert.equal(result.appUrl,'http://192.168.11.40:4173');assert.equal(result.panelUrl,'http://192.168.11.40:4173/android');
 assert.equal(started.TRACCAR_BASE_URL,'http://127.0.0.1:8082');assert.equal(started.TRACCAR_INGEST_URL,'http://127.0.0.1:5055');assert.equal(started.TRACCAR_PUBLIC_URL,'http://192.168.11.40:8082');assert.equal(started.AUDIT_PIN,before.AUDIT_PIN);assert.equal(started.SUPABASE_URL,'https://ztkvymdcnpoiiqkuwgoj.supabase.co');
 assert.equal((await fetch(base+'/private/local-server.json',{headers:{'x-setup-token':token}})).status,404);
});

test('Configuración LAN: IP privada válida y secretos guardados se conservan',async()=>{
 const {combineSettings,privateIp}=await import('../lib/local-setup.mjs');
 for(const ip of ['192.168.11.40','10.0.0.5','172.16.4.2'])assert.equal(privateIp(ip),true);
 for(const ip of ['192.168.11.999','192.168..1','8.8.8.8','127.0.0.1','192.168.11.40:8082'])assert.equal(privateIp(ip),false);
 const old={SUPABASE_SECRET_KEY:'test-key',AUDIT_PIN:'a',REPORT_PIN:'b',TRACCAR_USER:'u',TRACCAR_PASSWORD:'p'};
 const c=combineSettings(old,{lanIp:'192.168.11.41',traccarPassword:''});assert.equal(c.TRACCAR_PASSWORD,'p');assert.equal(c.TRACCAR_PUBLIC_URL,'http://192.168.11.41:8082');
});
