// Ejecutar con --env-file privado. Crea y elimina únicamente cuentas sintéticas.
const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs');
const C=require('../api/_config');
const users=[],checks=[];
const write={'Content-Type':'application/json',Prefer:'return=representation'};
async function create(role){const password=crypto.randomBytes(24).toString('base64url');const email=`km-check-${crypto.randomUUID()}@example.invalid`;const r=await C.sb('/auth/v1/admin/users',{method:'POST',headers:write,body:JSON.stringify({email,password,email_confirm:true,...(role?{app_metadata:{bitacora_role:role}}:{})})});const u=r.user||r;users.push(u.id);return {...u,password};}
(async()=>{
 assert.equal(process.env.SUPABASE_URL,'https://ztkvymdcnpoiiqkuwgoj.supabase.co');
 const app=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.split('/').at(-1);if(!['session','report','report-pdf','report-xlsx','entries','access','traccar'].includes(name)){res.writeHead(404);res.end();return;}await require('../api/'+name)(req,res);}catch{res.writeHead(500);res.end();}});
 const remote=process.env.KM_REMOTE_BASE;
 if(remote)assert.equal(remote,'https://bitacora-km.vercel.app');
 else await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base=remote||'http://127.0.0.1:'+app.address().port;
 const call=(path,cookie='',body,method)=>fetch(base+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
 async function login(u){const r=await call('/api/session?action=login','',{email:u.email,password:u.password});assert.equal(r.status,200);const b=await r.json();assert.equal(b.access_token,undefined);const cookies=r.headers.getSetCookie();assert.ok(cookies.every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Lax')));return cookies.map(c=>c.split(';')[0]).join('; ');}
 try{
  const entry=(await C.sb('/rest/v1/bitacora_blokon?select=*&limit=1'))[0];assert.ok(entry,'Se requiere un registro existente para verificar aislamiento');
  const admin=await create('admin'),own=await create(),other=await create();
  const adminCookie=await login(admin),ownCookie=await login(own),otherCookie=await login(other);
  checks.push('Ingreso real con Supabase; tokens solo en cookies HttpOnly');
  const a=await call('/api/access',adminCookie,{company:'blokon',employeeId:entry.employee_id,email:own.email});assert.equal(a.status,200);assert.equal((await a.json()).password,null);
  const profiles=(await (await call('/api/session',ownCookie)).json()).profiles;assert.ok(profiles.some(p=>p.id===entry.employee_id));
  const q=new URLSearchParams({company:'blokon',employeeId:entry.employee_id,from:entry.date,to:entry.date});
  const report=await call('/api/report?'+q,ownCookie);assert.equal(report.status,200);assert.ok((await report.json()).items.some(x=>x.id===entry.id));
  for(const route of ['report','report-xlsx','report-pdf']){
    assert.equal((await call('/api/'+route+'?'+q)).status,401);
    assert.equal((await call('/api/'+route+'?'+q,otherCookie)).status,403);
  }
  checks.push('Cada cuenta descarga solamente su bitácora; acceso ajeno y anónimo rechazados');
  const excel=await call('/api/report-xlsx?'+q,ownCookie);assert.equal(excel.status,200);assert.ok((await excel.arrayBuffer()).byteLength>1000);
  const pdf=await call('/api/report-pdf?'+q,ownCookie);assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');checks.push('Excel y PDF reales generados correctamente');
  assert.equal((await call('/api/entries?company=blokon',ownCookie,{id:entry.id,reviewStatus:'Aprobado'},'PATCH')).status,401);
  const gps=await call('/api/traccar?'+new URLSearchParams({company:'blokon',id:entry.id,action:'route'}),ownCookie);assert.equal(gps.status,200);
  assert.equal((await call('/api/traccar?'+new URLSearchParams({company:'blokon',id:entry.id,action:'route'}),otherCookie)).status,403);checks.push('Recorridos GPS respetan propietario; colaborador no puede aprobar bitácoras');
  const revoke=await call('/api/access',adminCookie,{company:'blokon',employeeId:entry.employee_id,userId:own.id},'PATCH');assert.equal(revoke.status,200);
  assert.equal((await call('/api/report?'+q,ownCookie)).status,403);checks.push('Revocación aplicada inmediatamente');
  const csrf=await fetch(base+'/api/session?action=password',{method:'POST',headers:{Cookie:adminCookie,Origin:'https://example.invalid','Content-Type':'application/json'},body:JSON.stringify({password:'must-not-change-this'})});assert.equal(csrf.status,403);checks.push('Solicitud desde otro sitio rechazada');
  const out=await call('/api/session?action=logout',ownCookie,{});assert.equal(out.status,200);assert.ok(out.headers.getSetCookie().every(x=>x.includes('Max-Age=0')));
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
  fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/'+(remote?'production-auth':'cloud-auth')+'.json',JSON.stringify({verifiedAt:new Date().toISOString(),base,checks},null,2));
 }finally{
  for(const id of users)await C.sb('/auth/v1/admin/users/'+id,{method:'DELETE'});
  if(app.listening)await new Promise(r=>app.close(r));
 }
})().catch(e=>{console.error('Verificación fallida:',e.message);process.exitCode=1;});
