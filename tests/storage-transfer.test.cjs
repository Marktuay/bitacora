const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

test('Traslado de fotos: copia, integridad, reintento y conflicto sin sobrescribir',async()=>{
 const source=new Map([['blokon/odometer-start/prueba.jpg',Buffer.from([255,216,255,1,2,3])],['security/odometer-end/prueba.jpg',Buffer.from([255,216,255,4,5,6])]]),dest=new Map();let writes=0;
 const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost'),parts=u.pathname.split('/').filter(Boolean),mode=parts.shift(),map=mode==='source'?source:dest;
  const json=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  assert.equal(req.headers.apikey,'test-only-key');
  if(parts[2]==='bucket')return json(200,{id:'bitacora-soportes',public:false});
  let raw='';if(req.method==='POST'&&parts[3]==='list'){
   for await(const x of req)raw+=x;
   const b=JSON.parse(raw),prefix=b.prefix?b.prefix+'/':'';const entries=new Map();
   for(const name of map.keys()){if(!name.startsWith(prefix))continue;const relative=name.slice(prefix.length),first=relative.split('/')[0];entries.set(first,{name:first,id:relative.includes('/')?null:'test-id',metadata:{mimetype:'image/jpeg'}});}
   return json(200,[...entries.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(b.offset,b.offset+b.limit));
  }
  const name=decodeURIComponent(parts.slice(4).join('/'));
  if(req.method==='POST'){const chunks=[];for await(const x of req)chunks.push(x);if(map.has(name))return json(409,{});map.set(name,Buffer.concat(chunks));writes++;return json(201,{});}
  if(!map.has(name))return json(404,{});res.writeHead(200,{'content-type':'image/jpeg'});res.end(map.get(name));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'bkm-transfer-test-'));
 async function run(mode){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['deployment/storage-transfer.mjs',mode,folder],{env:{...process.env,SOURCE_SUPABASE_URL:base+'/source',SOURCE_SUPABASE_KEY:'test-only-key',DEST_SUPABASE_URL:base+'/dest',DEST_SUPABASE_KEY:'test-only-key'}});let out='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>out+=x);child.on('error',reject);child.on('close',code=>resolve({code,out}));});}
 try{
  const exported=await run('export');assert.equal(exported.code,0,exported.out);
  const imported=await run('import');assert.equal(imported.code,0,imported.out);assert.equal(dest.size,2);assert.equal(writes,2);
  for(const [name,bytes]of source)assert.deepEqual(dest.get(name),bytes);
  assert.equal((await run('import')).code,0);assert.equal(writes,2);
  dest.set('blokon/odometer-start/prueba.jpg',Buffer.from('existing different photo'));
  const conflict=await run('import');assert.notEqual(conflict.code,0);assert.match(conflict.out,/Conflicto de archivo/);assert.equal(writes,2);
  assert.equal(source.size,2);
 }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(folder,{recursive:true,force:true});}
});
