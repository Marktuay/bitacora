const assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {create}=require('../test-database.cjs'),{seed,password}=require('./fixtures.cjs'),ExcelJS=require('exceljs');
const source=path.resolve(__dirname,'../../..'),web=path.join(source,'blazor/Bitacora.Web'),results=path.join(source,'test-results/migration');
let app,gps,smtp,base,work,log='';const checks=[],devices=[],points=[],mails=[];
const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',r));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const json=(res,data)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
async function read(req){let b='';for await(const chunk of req)b+=chunk;return b;}
async function call(route,{cookie,method='GET',body,headers={}}={}){
 const r=await fetch(base+route,{method,signal:AbortSignal.timeout(25000),headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
 const bytes=Buffer.from(await r.arrayBuffer());return {status:r.status,headers:r.headers,cookies:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),bytes,data:r.headers.get('content-type')?.includes('json')?JSON.parse(bytes):null};
}
async function check(name,work){await work();checks.push(name);console.log('PASS '+name);}
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=';
async function main(){
 await fs.mkdir(results,{recursive:true});work=await fs.mkdtemp(path.join(os.tmpdir(),'km-e2e-'));const database=path.join(work,'database'),db=create(database);await seed(db);await db.end();
 gps=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://local');
  if(u.pathname==='/ingest'){
   const b=Object.fromEntries(new URLSearchParams(await read(req))),d=devices.find(x=>x.uniqueId===b.id);if(!d){res.statusCode=404;return res.end();}
   points.push({deviceId:d.id,fixTime:new Date(Number(b.timestamp)*1000).toISOString(),latitude:Number(b.lat),longitude:Number(b.lon),accuracy:Number(b.accuracy||5),valid:true});return json(res,{});
  }
  if(u.pathname==='/api/server')return json(res,{});
  if(u.pathname==='/api/devices'){
   if(req.method==='POST'){const data=JSON.parse(await read(req));data.id=devices.length+1;devices.push(data);return json(res,data);}return json(res,devices);
  }
  if(u.pathname==='/api/reports/route')return json(res,points.filter(p=>p.deviceId===Number(u.searchParams.get('deviceId'))));
  if(u.pathname==='/api/reports/summary')return json(res,[]);
  res.statusCode=404;res.end();
 });await listen(gps);
 smtp=net.createServer(socket=>{
  socket.setEncoding('utf8');socket.write('220 localhost ESMTP\r\n');let buffer='',dataMode=false,message='';
  socket.on('data',chunk=>{buffer+=chunk;let p;while((p=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,p);buffer=buffer.slice(p+2);if(dataMode){if(line==='.') {mails.push(message);message='';dataMode=false;socket.write('250 OK\r\n');}else message+=line+'\r\n';continue;}if(/^EHLO|HELO/.test(line))socket.write('250 localhost\r\n');else if(/^DATA/.test(line)){dataMode=true;socket.write('354 End with dot\r\n');}else if(/^QUIT/.test(line)){socket.end('221 Bye\r\n');}else socket.write('250 OK\r\n');}});
 });await listen(smtp);
 const tempListener=net.createServer();await listen(tempListener);const port=tempListener.address().port;await new Promise(r=>tempListener.close(r));base='http://127.0.0.1:'+port;
 const dotnet=process.env.BITACORA_DOTNET||'dotnet';
 app=spawn(dotnet,[path.join(web,'bin/Debug/net10.0/Bitacora.Web.dll'),'--urls',base],{cwd:web,env:{...process.env,NODE_ENV:'test',ASPNETCORE_ENVIRONMENT:'Development',DATABASE_URL:'postgresql://fixture.invalid/test',BITACORA_TEST_DATABASE:database,BITACORA_DATA_DIR:path.join(work,'private'),BITACORA_PUBLIC_URL:base,TRACCAR_BASE_URL:'http://127.0.0.1:'+gps.address().port,TRACCAR_INGEST_URL:'http://127.0.0.1:'+gps.address().port+'/ingest',TRACCAR_USER:'test',TRACCAR_PASSWORD:'test',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.address().port),SMTP_FROM:'bitacora@example.invalid'},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',d=>log+=d);app.stderr.on('data',d=>log+=d);
 let ready=false;for(let i=0;i<80;i++){if(app.exitCode!=null)throw Error('Blazor se detuvo: '+log);try{if((await call('/api/health')).status===200){ready=true;break;}}catch{}await sleep(250);}if(!ready)throw Error('Blazor no quedó listo: '+log.slice(0,8000));
 let admin,manager,employee,other;
 await check('Ingreso local con las mismas cuentas, cierre y CSRF',async()=>{
  assert.equal((await call('/api/session')).status,401);
  assert.equal((await call('/api/session?action=login',{method:'POST',body:{email:'colaborador@example.invalid',password:'incorrecta'}})).status,401);
  for(const [email,save]of [['auditor-general@newcenturyni.com',x=>admin=x],['jefe@example.invalid',x=>manager=x],['colaborador@example.invalid',x=>employee=x],['otro@example.invalid',x=>other=x]]){
   const r=await call('/api/session?action=login',{method:'POST',body:{email,password}});assert.equal(r.status,200,JSON.stringify(r.data));save(r.cookies);
  }
  const s=await call('/api/session',{cookie:admin});assert.equal(s.data.admin,true);assert.equal(s.data.profiles.length,0);
  assert.equal((await call('/api/session?action=logout',{method:'POST',cookie:employee,headers:{origin:'https://other.invalid'}})).status,403);
 });
 await check('Las 13 pantallas se sirven mediante componentes Razor',async()=>{
  for(const url of ['/','/newcentury','/blokon','/conaser','/security','/auditoria','/reportes','/android','/login.html','/cuenta.html','/recuperar.html','/accesos.html','/recorrido.html','/colaboradores.html','/jefes.html','/mobile-auth.html']){
   const r=await call(url);assert.equal(r.status,200,url);assert.match(r.bytes.toString(),/<html lang="es">/);assert.ok(!r.bytes.toString().includes('@page'));
  }
 });
 const saved={};
 await check('Registro, fotos, odómetros y revisión en las cuatro empresas',async()=>{
  for(const company of ['blokon','conaser','security','newcentury']){
   assert.equal((await call('/api/catalog?company='+company,{cookie:admin})).status,200);
   const photos=[];for(const kind of ['odometer-start','odometer-end']){const r=await call('/api/support',{method:'POST',cookie:admin,body:{company,kind,contentType:'image/png',base64:png}});assert.equal(r.status,201,JSON.stringify(r.data));photos.push(r.data.path);}
   const body={date:'2026-10-15',employeeId:'e-'+company,vehicleId:'v-'+company,areaRequest:'OPERACIONES',origin:'ORIGEN PRUEBA',destination:'DESTINO PRUEBA',timeStart:'08:00',timeEnd:'09:00',kmInitial:100,kmFinal:125,odometerStartPath:photos[0],odometerEndPath:photos[1],observation:'Observación completa de prueba'};
   assert.equal((await call('/api/entries?company='+company,{method:'POST',body})).status,401);
   assert.equal((await call('/api/entries?company='+company,{method:'POST',cookie:admin,body:{...body,kmFinal:99}})).status,400);
   const r=await call('/api/entries?company='+company,{method:'POST',cookie:admin,body});assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.item.km_travel,25);saved[company]=r.data.item;
   const review=await call('/api/entries?company='+company,{method:'PATCH',cookie:admin,body:{id:r.data.item.id,reviewStatus:'Aprobado',kmTraccar:24}});assert.equal(review.status,200);assert.equal(review.data.item.difference_km,-1);
   const support=await call('/api/support?path='+encodeURIComponent(photos[0]),{cookie:admin});assert.equal(support.status,200);const bytes=await call(support.data.url);assert.equal(bytes.status,200);assert.equal(bytes.bytes.toString('base64'),png);
   assert.equal((await call(support.data.url.replace(/signature=[a-f0-9]+/,'signature='+'0'.repeat(64)))).status,403);
  }
 });
 const q='company=blokon&employeeId=e-blokon&from=2026-10-01&to=2026-10-15';
 await check('Jefes y colaboradores solo ven su empresa y área autorizada',async()=>{
  const catalog=await call('/api/catalog?company=blokon',{cookie:manager});assert.deepEqual(catalog.data.employees.map(x=>x.id),['e-blokon']);
  assert.equal((await call('/api/catalog?company=conaser',{cookie:manager})).status,403);
  assert.equal((await call('/api/report?company=blokon&employeeId=e-hidden&from=2026-10-01&to=2026-10-15',{cookie:manager})).status,403);
  assert.equal((await call('/api/report?'+q,{cookie:other})).status,403);
  assert.equal((await call('/api/entries?company=blokon',{method:'PATCH',cookie:employee,body:{id:saved.blokon.id,reviewStatus:'Aprobado'}})).status,401);
  const report=await call('/api/report?'+q,{cookie:employee});assert.equal(report.status,200,JSON.stringify(report.data));assert.equal(report.data.items.length,1);assert.equal(report.data.items[0].employee_observation,'Observación completa de prueba');
 });
 await check('Excel y PDF conservan encabezados, vehículo, firmas y totales',async()=>{
  const T=require(path.join(source,'assets/trip-comparison'));
  let reference;
  for(const [role,cookie]of [['admin',admin],['jefe',manager],['colaborador',employee]]){
   const x=await call('/api/report-xlsx?'+q,{cookie});assert.equal(x.status,200,JSON.stringify(x.data));const wb=new ExcelJS.Workbook();await wb.xlsx.load(x.bytes);const sheet=wb.worksheets[0];
   assert.deepEqual(Array.from({length:12},(_,i)=>sheet.getCell(7,i+1).value),T.columns);assert.equal(sheet.getCell('H8').value,25);assert.equal(sheet.getCell('I8').value,24);assert.equal(sheet.getCell('L8').value,'Observación completa de prueba');
   const cells=[];sheet.eachRow(row=>cells.push(row.values));if(reference)assert.deepEqual(cells,reference);else reference=cells;
   const text=JSON.stringify(cells);assert.match(text,/Motocicleta/);assert.match(text,/Marca de Prueba/);assert.match(text,/TEST-blokon/);assert.match(text,/COLABORADOR PRUEBA BLOKON/);assert.match(text,/Jefe de Prueba/);
   await fs.writeFile(path.join(results,role+'.xlsx'),x.bytes);
   const pdf=await call('/api/report-pdf?'+q,{cookie});assert.equal(pdf.status,200);assert.equal(pdf.bytes.subarray(0,5).toString(),'%PDF-');await fs.writeFile(path.join(results,role+'.pdf'),pdf.bytes);
  }
 });
 await check('Vale opcional, fecha documental y fórmula original',async()=>{
  const r=await call('/api/report?fuel=1&'+q,{method:'POST',cookie:employee,body:{voucherNumber:'VALE-PRUEBA-1',voucherDate:'2026-09-01',amount:650,fuelType:'regular'}});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.estimate.kmLabor,25);assert.equal(r.data.estimate.nextAmount,650);assert.equal(r.data.item.voucher_date,'2026-09-01');
  assert.equal((await call('/api/report?'+q,{cookie:employee})).data.items.length,1);
 });
 let deviceToken='c'.repeat(64),mobileId;
 await check('Ingreso y asignación móvil conservan su token, sin duplicarlo',async()=>{
  const r=await call('/api/traccar?action=mobile-enroll',{method:'POST',cookie:employee,body:{company:'blokon',employeeId:'e-blokon',vehicleId:'v-blokon',deviceToken}});assert.equal(r.status,201,JSON.stringify(r.data));mobileId=r.data.profile.id;
  const repeat=await call('/api/traccar?action=mobile-enroll',{method:'POST',cookie:employee,body:{company:'blokon',employeeId:'e-blokon',vehicleId:'v-blokon',deviceToken}});assert.equal(repeat.status,200);assert.equal(repeat.data.profile.id,mobileId);
  const config=await call('/api/traccar?action=mobile-gps-config',{method:'POST',headers:{'x-device-token':deviceToken},body:{}});assert.equal(config.status,200);assert.equal(config.data.gps.url,base+'/api/traccar?action=mobile-position');
 });
 await check('Cola GPS, envío móvil repetido, finalización y mapa',async()=>{
  const start=Date.parse('2026-10-15T16:00:00Z'),end=start+180000;
  for(let i=0;i<7;i++){
   const body=new URLSearchParams({id:deviceToken,lat:String(12+i*.001),lon:'-86',timestamp:String((start+i*30000)/1000),accuracy:'5'}).toString();
   const r=await call('/api/traccar?action=mobile-position',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.accepted,true);
  }
  const paths=[];for(const kind of ['odometer-start','odometer-end']){const r=await call('/api/support',{method:'POST',headers:{'x-device-token':deviceToken},body:{company:'blokon',kind,contentType:'image/png',base64:png,uploadId:crypto.randomUUID()}});assert.equal(r.status,201,JSON.stringify(r.data));paths.push(r.data.path);}
  const id=crypto.randomUUID(),body={id,startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString(),kmInitial:125,kmFinal:126,areaRequest:'OPERACIONES',origin:'MOVIL PRUEBA',destination:'MOVIL FINAL',odometerStartPath:paths[0],odometerEndPath:paths[1],gpsFlushed:true};
  const r=await call('/api/traccar?action=mobile-submit',{method:'POST',headers:{'x-device-token':deviceToken},body});assert.equal(r.status,200,JSON.stringify(r.data));
  const repeat=await call('/api/traccar?action=mobile-submit',{method:'POST',headers:{'x-device-token':deviceToken},body});assert.equal(repeat.status,200);assert.equal(repeat.data.item.id,id);
  let final;for(let i=0;i<12;i++){final=await call('/api/traccar?action=mobile-finalize',{method:'POST',headers:{'x-device-token':deviceToken},body:{id}});if(final.data.gpsFinalized)break;await sleep(500);}
  assert.equal(final.status,200,JSON.stringify(final.data));assert.equal(final.data.gpsFinalized,true);assert.ok(final.data.km>0);
  const route=await call('/api/traccar?company=blokon&id='+id,{cookie:employee});assert.equal(route.status,200,JSON.stringify(route.data));assert.ok(route.data.gps.segments.length>0);assert.equal(route.data.gps.provider,'traccar');
  assert.equal((await call('/api/traccar?company=blokon&id='+id,{cookie:other})).status,403);
 });
 await check('Altas de colaboradores y permisos de jefe conservan su flujo',async()=>{
  const requestId=crypto.randomUUID(),body={company:'blokon',requestId,name:'NUEVO COLABORADOR',area:'OPERACIONES',role:'Auxiliar',email:'nuevo@example.invalid',vehicleId:'',type:'Motocicleta',brand:'Prueba',plate:'NEW-E2E'};
  const r=await call('/api/team',{method:'POST',cookie:manager,body});assert.equal(r.status,201,JSON.stringify(r.data));assert.ok(r.data.password);assert.ok(r.data.employeeId);
  const again=await call('/api/team',{method:'POST',cookie:manager,body});assert.equal(again.status,201);assert.equal(again.data.employeeId,r.data.employeeId);
  assert.equal((await call('/api/team?action=managers',{cookie:manager})).status,403);
  const managers=await call('/api/team?action=managers',{cookie:admin});assert.equal(managers.status,200);assert.equal(managers.data.items[0].name,'Jefe de Prueba');
 });
 await check('Recuperación por correo local y cambio de contraseña',async()=>{
  assert.equal((await call('/api/session?action=recover',{method:'POST',body:{email:'colaborador@example.invalid'}})).status,200);
  assert.equal(mails.length,1);const message=mails[0].replace(/=\r\n/g,'').replaceAll('=3D','=');const token=message.match(/token_hash=([a-f0-9]{64})/)[1];
  const recovery=await call('/api/session?action=recovery',{method:'POST',body:{tokenHash:token}});assert.equal(recovery.status,200,JSON.stringify(recovery.data));
  const passwordNew='Nueva-Prueba-2026!';const changed=await call('/api/session?action=password',{method:'POST',cookie:recovery.cookies,body:{password:passwordNew,confirmation:passwordNew,recovery:true}});assert.equal(changed.status,200,JSON.stringify(changed.data));
  assert.equal((await call('/api/session?action=recovery',{method:'POST',body:{tokenHash:token}})).status,401);
  assert.equal((await call('/api/session?action=login',{method:'POST',body:{email:'colaborador@example.invalid',password:passwordNew}})).status,200);
  assert.equal((await call('/api/session',{cookie:employee})).status,401);
 });
 // Browser checks run on the same live Blazor process, without touching production.
 if(process.env.BITACORA_PLAYWRIGHT){
  const {chromium}=require(process.env.BITACORA_PLAYWRIGHT),browser=await chromium.launch({headless:true,...(process.env.BITACORA_CHROMIUM?{executablePath:process.env.BITACORA_CHROMIUM}:{}),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
  try{await check('Navegador PC y celular: ingreso, menú y pantalla de revisión',async()=>{
   const desktop=await browser.newContext({viewport:{width:1440,height:1000}}),page=await desktop.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/login.html');await page.locator('#email').fill('auditor-general@newcenturyni.com');await page.locator('#password').fill(password);await page.locator('button[type=submit]').click();await page.waitForURL(url=>!url.pathname.includes('login'));await page.locator('.km-sidebar').waitFor();
   await page.screenshot({path:path.join(results,'desktop.png'),fullPage:true});assert.deepEqual(errors,[]);
   const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1}),p=await mobile.newPage();
   await mobile.addCookies((await desktop.cookies()).map(c=>({...c})));await p.goto(base+'/reportes');await p.locator('.km-sidebar').waitFor({state:'attached'});
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Los filtros deben caber en el teléfono');
   await p.screenshot({path:path.join(results,'mobile.png'),fullPage:true});
   await page.goto(base+'/auditoria');await page.locator('.km-sidebar').waitFor();assert.match(await page.locator('h1').first().innerText(),/aprobación/i);assert.deepEqual(errors,[]);
   await desktop.close();await mobile.close();
  });}finally{await browser.close();}
 }
 await fs.writeFile(path.join(results,'verification.json'),JSON.stringify({testedAt:new Date().toISOString(),sourceCommit:'901bbec2b78080d3a73f4e7cae7f10f853680c55',database:'PostgreSQL engine via PGlite (WASM), not the Windows server',checks,physicalGpsTested:false,productionChanged:false},null,2));
 console.log('VERIFICACIÓN COMPLETA: '+checks.length+' flujos');
}
main().catch(e=>{console.error(e);console.error(log.slice(-12000));process.exitCode=1;}).finally(async()=>{
 await fs.mkdir(results,{recursive:true});await fs.writeFile(path.join(results,'server.log'),log);
 if(app&&app.exitCode==null){app.kill('SIGTERM');await new Promise(r=>{app.once('exit',r);setTimeout(()=>{app.kill('SIGKILL');r();},3000).unref();});}
 if(gps)await new Promise(r=>gps.close(r));if(smtp)await new Promise(r=>smtp.close(r));
 if(work)await fs.rm(work,{recursive:true,force:true});
});
