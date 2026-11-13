'use strict';
const {pool,transaction}=require('./database.cjs');
const schema=require('./schema.json');
const tables=new Map(schema.tables.map(x=>[x.name,new Map(x.columns.map(c=>[c.name,c]))]));
for(const v of schema.views||[])tables.set(v.name,tables.get('bitacora_blokon'));
const fail=(status,message)=>Object.assign(Error(message),{status});
function ident(value){if(!/^[a-z_][a-z0-9_]*$/.test(value))throw fail(400,'Identificador inválido');return '"'+value+'"';}
function column(name,columns){
 const parts=name.split('->>');if(parts.length>2||!columns.has(parts[0]))throw fail(400,'Campo inválido');
 return ident(parts[0])+(parts.length===2?"->>'"+parts[1].replace(/'/g,"''")+"'":'');
}
function cast(name,columns){return name.includes('->>')?'text':columns.get(name)?.type||'text';}
function predicates(params,columns,values){
 const conditions=[];
 for(const [field,input]of params){
  if(['select','order','limit','offset','on_conflict'].includes(field))continue;
  const col=column(field,columns),dot=input.indexOf('.');if(dot<0)throw fail(400,'Filtro inválido');
  let op=input.slice(0,dot),value=input.slice(dot+1),negative=false;
  if(op==='not'){negative=true;const pos=value.indexOf('.');op=value.slice(0,pos);value=value.slice(pos+1);}
  let sql;
  if(op==='is'){
   if(!['null','true','false'].includes(value))throw fail(400,'Filtro inválido');sql=col+' IS '+value.toUpperCase();
  }else if(op==='in'){
   if(!/^\([^()]*\)$/.test(value))throw fail(400,'Filtro inválido');
   const list=value.slice(1,-1).split(',').map(x=>x.replace(/^"|"$/g,''));
   const slots=list.map(x=>{values.push(x);return '$'+values.length+'::'+cast(field,columns);});sql=col+' IN ('+slots.join(',')+')';
  }else{
   const operator={eq:'=',neq:'<>',gt:'>',gte:'>=',lt:'<',lte:'<=',like:'LIKE',ilike:'ILIKE'}[op];if(!operator)throw fail(400,'Operador inválido');
   values.push(value);sql=col+' '+operator+' $'+values.length+'::'+cast(field,columns);
  }
  conditions.push(negative?'NOT ('+sql+')':sql);
 }
 return conditions;
}
function integer(value,fallback,max){if(value==null)return fallback;if(!/^\d+$/.test(value)||Number(value)>max)throw fail(400,'Paginación inválida');return Number(value);}
function parameter(value,type,values){values.push(value===null?null:type==='jsonb'||type==='json'?JSON.stringify(value):value);return '$'+values.length+'::'+type;}
async function rest(path,options={}){
 const u=new URL(path,'http://local'),parts=u.pathname.split('/').filter(Boolean);
 if(parts[0]==='auth')return require('./local-auth.cjs').admin(path,options);
 if(parts[0]==='storage')return require('./storage.cjs').operation(path,options);
 if(parts[0]!=='rest'||parts[1]!=='v1')throw fail(404,'Ruta local no disponible');
 const method=options.method||'GET',authorization=options.headers?.Authorization||options.headers?.authorization;
 const session=authorization?await require('./local-auth.cjs').getSession(authorization.replace(/^Bearer /,'')):null;
 if(authorization&&!session)throw fail(401,'Sesión vencida');
 if(parts[2]==='rpc')return rpc(parts[3],options,session);
 const table=parts[2],columns=tables.get(table);if(!columns)throw fail(400,'Tabla no autorizada');
 const values=[],where=predicates(u.searchParams,columns,values);
 if(session){
  if(method!=='GET')throw fail(403,'Operación no autorizada');
  values.push(session.user.id);const uid='$'+values.length+'::uuid';
  if(table==='km_report_access')where.push('user_id='+uid);
  else if(table.startsWith('employees_')){const company=table.slice(10);values.push(company);where.push(`EXISTS (SELECT 1 FROM public.km_report_access a WHERE a.user_id=${uid} AND a.active AND a.company=$${values.length} AND a.employee_id=${ident(table)}.id)`);}
  else throw fail(403,'Consulta no autorizada');
 }
 let sql;const condition=where.length?' WHERE '+where.join(' AND '):'';
 if(method==='GET'){
  const selection=u.searchParams.get('select')||'*';const cols=selection==='*'?'*':selection.split(',').map(x=>column(x,columns)).join(',');
  const order=u.searchParams.get('order');let sort='';
  if(order)sort=' ORDER BY '+order.split(',').map(x=>{const [key,direction='asc',nulls]=x.split('.');if(!['asc','desc'].includes(direction)||nulls&&!['nullsfirst','nullslast'].includes(nulls))throw fail(400,'Orden inválido');return column(key,columns)+' '+direction+(nulls?' NULLS '+(nulls==='nullsfirst'?'FIRST':'LAST'):'');}).join(',');
  const limit=integer(u.searchParams.get('limit'),1000,10000),offset=integer(u.searchParams.get('offset'),0,10000000);
  sql=`SELECT ${cols} FROM public.${ident(table)}${condition}${sort} LIMIT ${limit} OFFSET ${offset}`;
 }else if(method==='POST'){
  if(session)throw fail(403,'Operación no autorizada');
  const parsed=typeof options.body==='string'?JSON.parse(options.body):options.body,rows=Array.isArray(parsed)?parsed:[parsed];
  if(!rows.length)return [];
  const keys=[...new Set(rows.flatMap(x=>Object.keys(x)))];keys.forEach(k=>column(k,columns));
  const tuples=rows.map(row=>'('+keys.map(k=>Object.hasOwn(row,k)?parameter(row[k],cast(k,columns),values):'DEFAULT').join(',')+')');
  let conflict='';const prefer=options.headers?.Prefer||options.headers?.prefer||'';
  if(prefer.includes('resolution=')){
   const keysConflict=(u.searchParams.get('on_conflict')||'id').split(',');keysConflict.forEach(k=>column(k,columns));
   conflict=' ON CONFLICT ('+keysConflict.map(ident).join(',')+') '+(prefer.includes('ignore-duplicates')?'DO NOTHING':'DO UPDATE SET '+keys.filter(k=>!keysConflict.includes(k)).map(k=>ident(k)+'=EXCLUDED.'+ident(k)).join(','));
  }
  sql=`INSERT INTO public.${ident(table)} (${keys.map(ident).join(',')}) VALUES ${tuples.join(',')}${conflict} RETURNING *`;
 }else if(method==='PATCH'){
  if(!where.length)throw fail(400,'Actualización sin filtro');
  const data=typeof options.body==='string'?JSON.parse(options.body):options.body;
  const patch=Object.entries(data).map(([k,v])=>column(k,columns)+'='+parameter(v,cast(k,columns),values));
  if(!patch.length)return [];
  sql=`UPDATE public.${ident(table)} SET ${patch.join(',')}${condition} RETURNING *`;
 }else if(method==='DELETE'){
  if(!where.length)throw fail(400,'Eliminación sin filtro');sql=`DELETE FROM public.${ident(table)}${condition} RETURNING *`;
 }else throw fail(405,'Método no permitido');
 const r=await pool().query('WITH data AS ('+sql+') SELECT coalesce(jsonb_agg(to_jsonb(data)),\'[]\'::jsonb) AS items FROM data',values);
 return r.rows[0].items;
}
const functions={
 km_my_report:[['p_from','date'],['p_to','date']],
 km_register_employee:[['p_request_id','uuid'],['p_actor_id','uuid'],['p_user_id','uuid'],['p_data','jsonb']],
 km_rotate_gps_token:[['p_device_id','uuid']],
 km_ingest_position:[['p_unique_id','text'],['p_token_hash','text'],['p_position','jsonb']],
 km_gps_trip_report:[['p_trip_id','uuid']],
 km_claim_traccar_relay_jobs:[['p_limit','integer']]
};
async function rpc(name,options,session){
 if(options.method!=='POST'||!functions[name]||session&&name!=='km_my_report')throw fail(403,'Función no autorizada');
 const data=typeof options.body==='string'?JSON.parse(options.body):options.body||{},values=[];
 const args=functions[name].map(([k,type])=>parameter(data[k]??null,type,values));
 return transaction(async db=>{
  if(session)await db.query("select set_config('request.jwt.claim.sub',$1,true)",[session.user.id]);
  const call='public.'+ident(name)+'('+args.join(',')+')';
  const r=await db.query(name==='km_claim_traccar_relay_jobs'?"SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) AS result FROM "+call+' x':'SELECT '+call+' AS result',values);return r.rows[0].result;
 });
}
module.exports={rest,ident,predicates,tables};
