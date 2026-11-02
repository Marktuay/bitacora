const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {create}=require('../test-database.cjs'),{seed}=require('./fixtures.cjs'),{initialize,migrate}=require('../migrate.cjs');
test('La copia conserva usuarios, contraseñas, permisos, filas y soportes sin modificar el origen',async()=>{
 const source=create('memory://'),target=create('memory://'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'km-copy-')),oldFetch=global.fetch;
 try{
  await seed(source);await initialize(target);
  const bytes=Buffer.from('%PDF- soporte de migración'),name='blokon/support/2026-10-17/copia.pdf';
  await source.query('CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb)');
  await source.query('INSERT INTO storage.objects VALUES($1,$2,$3)',['bitacora-soportes',name,JSON.stringify({size:bytes.length})]);
  global.fetch=async()=>new Response(bytes,{status:200});
  const result=await migrate(source,target,directory,{apiUrl:'https://source.invalid',key:'private-test-only'});assert.equal(result.accounts,4);assert.equal(result.tables,22);assert.equal(result.files,1);
  for(const table of ['auth.users',...require('../schema.json').tables.map(t=>'public.'+t.name)]){
   const sql='SELECT to_jsonb(t) AS item FROM '+table+' t ORDER BY to_jsonb(t)::text';assert.deepEqual((await target.query(sql)).rows,(await source.query(sql)).rows,table);
  }
  const copied=await fs.readFile(path.join(directory,'evidence/bitacora-soportes',name));assert.deepEqual(copied,bytes);
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'migration-verification.json'),'utf8'));assert.equal(manifest.files[0].sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(manifest.sessionsCopied,false);
  assert.equal((await target.query('select count(*)::int n from local_auth.sessions')).rows[0].n,0);
  await assert.rejects(()=>migrate(source,target,directory,{apiUrl:'https://source.invalid',key:'private-test-only'}),/destino contiene datos/);
 }finally{global.fetch=oldFetch;await source.end();await target.end();await fs.rm(directory,{recursive:true,force:true});}
});
test('Un cambio de estructura detiene y revierte la migración',async()=>{
 const source=create('memory://'),target=create('memory://'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'km-rollback-'));
 try{
  await seed(source);await initialize(target);await source.query('ALTER TABLE public.employees_blokon ADD COLUMN unexpected text');
  await assert.rejects(()=>migrate(source,target,directory),/estructura actual cambió/);
  assert.equal((await target.query('select count(*)::int n from auth.users')).rows[0].n,0);assert.equal((await source.query('select count(*)::int n from auth.users')).rows[0].n,4);
 }finally{await source.end();await target.end();await fs.rm(directory,{recursive:true,force:true});}
});
