'use strict';
const {Pool}=require('pg'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const schema=require('./schema.json');
const q=value=>'"'+value.replaceAll('"','""')+'"';
function orderTables(){
 const pending=[...schema.tables],ordered=[],done=new Set(['auth.users']);
 while(pending.length){const pos=pending.findIndex(t=>(t.constraints||[]).filter(c=>c.definition.startsWith('FOREIGN KEY')).every(c=>{const match=c.definition.match(/REFERENCES ([\w.]+)\(/);return !match||done.has(match[1])||done.has('public.'+match[1]);}));if(pos<0)throw Error('Dependencia circular de tablas');const [t]=pending.splice(pos,1);ordered.push(t);done.add(t.name);done.add('public.'+t.name);}
 return ordered;
}
async function initialize(pool){
 const nonempty=await pool.query("select count(*)::int n from information_schema.tables where table_schema in ('public','auth','local_auth') and table_type='BASE TABLE'");
 if(nonempty.rows[0].n)throw Error('La base destino debe ser NUEVA y estar vacía. No se modificó.');
 await pool.query(await fs.readFile(path.join(__dirname,'schema.sql'),'utf8'));
}
async function insertRows(db,table,columns,rows){
 if(!rows.length)return;
 const names=columns.map(c=>c.name),types=new Map(columns.map(c=>[c.name,c.type]));
 const values=[],tuples=rows.map(row=>'('+names.map(k=>{const type=types.get(k);values.push(row[k]==null?null:['jsonb','json'].includes(type)?JSON.stringify(row[k]):row[k]);return '$'+values.length+'::'+type;}).join(',')+')');
 await db.query('INSERT INTO '+table+' ('+names.map(q).join(',')+') VALUES '+tuples.join(','),values);
}
async function migrate(sourcePool,targetPool,dataDir,{apiUrl,key}={}){
 if(!dataDir)throw Error('Falta BITACORA_DATA_DIR');
 const source=await sourcePool.connect(),target=await targetPool.connect(),counts={},files=[];
 try{
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await target.query('BEGIN');
  for(const table of ['auth.users',...schema.tables.map(t=>'public.'+q(t.name))]){
   if(Number((await target.query('SELECT count(*) AS n FROM '+table)).rows[0].n))throw Error('El destino contiene datos. La copia se canceló sin reemplazarlos.');
  }
  // Confirm the source still has every field with the exact PostgreSQL type.
  for(const table of schema.tables){
   const actual=(await source.query("SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",['public.'+table.name])).rows;
   if(JSON.stringify(actual)!==JSON.stringify(table.columns.map(c=>({name:c.name,type:c.type}))))throw Error('La estructura actual cambió en '+table.name+'. Actualizar el esquema antes de copiar.');
  }
  const users=(await source.query("SELECT id,email,encrypted_password,coalesce(raw_app_meta_data,'{}'::jsonb) AS raw_app_meta_data,coalesce(raw_user_meta_data,'{}'::jsonb) AS raw_user_meta_data,CASE WHEN banned_until>now() THEN banned_until ELSE null END AS banned_until,created_at,coalesce(updated_at,created_at) AS updated_at FROM auth.users ORDER BY id")).rows;
  if(users.some(u=>!/^\$2[aby]\$/.test(u.encrypted_password||'')))throw Error('Hay cuentas sin contraseña bcrypt compatible; revisar su acceso antes de migrar. No se copió nada.');
  await insertRows(target,'auth.users',[{name:'id',type:'uuid'},{name:'email',type:'text'},{name:'encrypted_password',type:'text'},{name:'raw_app_meta_data',type:'jsonb'},{name:'raw_user_meta_data',type:'jsonb'},{name:'banned_until',type:'timestamptz'},{name:'created_at',type:'timestamptz'},{name:'updated_at',type:'timestamptz'}],users);counts['auth.users']=users.length;
  for(const table of orderTables()){
   const primary=(table.constraints||[]).find(c=>c.definition.startsWith('PRIMARY KEY'))?.definition.match(/\(([^)]+)\)/)?.[1]||table.columns[0].name;
   let n=0;
   for(let offset=0;;offset+=200){
    const rows=(await source.query('SELECT to_jsonb(t) AS item FROM public.'+q(table.name)+' t ORDER BY '+primary+' LIMIT 200 OFFSET $1',[offset])).rows.map(x=>x.item);
    if(!rows.length)break;await insertRows(target,'public.'+q(table.name),table.columns,rows);n+=rows.length;
   }
   const copied=Number((await target.query('SELECT count(*) AS n FROM public.'+q(table.name))).rows[0].n);if(copied!==n)throw Error('Conteo incorrecto en '+table.name);counts[table.name]=n;
  }
  // Copy private files before committing any data. File paths retain their old identity.
  const objects=(await source.query("SELECT name,metadata FROM storage.objects WHERE bucket_id='bitacora-soportes' ORDER BY name")).rows;
  if(objects.length&&(!apiUrl||!key))throw Error('Faltan SOURCE_API_URL y SOURCE_SERVICE_KEY para copiar los soportes privados');
  const evidence=path.join(dataDir,'evidence','bitacora-soportes');await fs.mkdir(evidence,{recursive:true,mode:0o700});
  for(const object of objects){
   if(!/^(blokon|conaser|security|newcentury)\/(support|odometer-start|odometer-end)\//.test(object.name)||object.name.includes('..')||object.name.includes('\\'))throw Error('Ruta de soporte inválida en origen');
   const destination=path.resolve(evidence,object.name);if(!destination.startsWith(path.resolve(evidence)+path.sep))throw Error('Ruta de soporte inválida');
   const response=await fetch(apiUrl.replace(/\/$/,'')+'/storage/v1/object/authenticated/bitacora-soportes/'+object.name.split('/').map(encodeURIComponent).join('/'),{headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})},signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error('No se pudo copiar un soporte: HTTP '+response.status);
   const bytes=Buffer.from(await response.arrayBuffer()),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
   const size=Number(object.metadata?.size);if(Number.isFinite(size)&&size!==bytes.length)throw Error('Tamaño de soporte distinto al origen');
   await fs.mkdir(path.dirname(destination),{recursive:true,mode:0o700});
   try{await fs.writeFile(destination,bytes,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;const existing=await fs.readFile(destination);if(!crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha256').update(existing).digest('hex')),Buffer.from(sha256)))throw Error('Existe un soporte diferente en destino; no se reemplazó');}
   files.push({name:object.name,size:bytes.length,sha256});
  }
  const report={sourceCommit:'901bbec2b78080d3a73f4e7cae7f10f853680c55',copiedAt:new Date().toISOString(),counts,files,sessionsCopied:false};
  await fs.writeFile(path.join(dataDir,'migration-verification.pending.json'),JSON.stringify(report,null,2),{mode:0o600});
  await target.query('COMMIT');await source.query('COMMIT');
  await fs.rename(path.join(dataDir,'migration-verification.pending.json'),path.join(dataDir,'migration-verification.json'));
  return {tables:Object.keys(counts).length-1,accounts:users.length,files:files.length,rows:Object.values(counts).reduce((a,b)=>a+b,0)};
 }catch(e){await target.query('ROLLBACK').catch(()=>{});await source.query('ROLLBACK').catch(()=>{});throw e;}finally{source.release();target.release();}
}
async function main(){
 if(!process.env.DATABASE_URL)throw Error('Falta DATABASE_URL de la base nueva');
 const target=new Pool({connectionString:process.env.DATABASE_URL,max:2});
 try{
  if(process.argv[2]==='init'){await initialize(target);console.log('Base nueva preparada. No se cargaron datos de demostración.');return;}
  if(process.argv[2]!=='copy'||!process.env.SOURCE_DATABASE_URL)throw Error('Usá migrate.cjs init o migrate.cjs copy con SOURCE_DATABASE_URL');
  if(process.env.SOURCE_DATABASE_URL===process.env.DATABASE_URL)throw Error('Origen y destino deben ser distintos');
  const source=new Pool({connectionString:process.env.SOURCE_DATABASE_URL,max:2});
  try{console.log(await migrate(source,target,process.env.BITACORA_DATA_DIR,{apiUrl:process.env.SOURCE_API_URL,key:process.env.SOURCE_SERVICE_KEY}));}finally{await source.end();}
 }finally{await target.end();}
}
if(require.main===module)main().catch(e=>{console.error('Migración detenida:',e.message);process.exitCode=1;});
module.exports={initialize,migrate,insertRows,orderTables};
