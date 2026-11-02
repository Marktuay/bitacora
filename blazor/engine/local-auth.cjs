'use strict';
const crypto=require('node:crypto'),bcrypt=require('bcryptjs'),{pool,transaction}=require('./database.cjs');
const fail=(status,message)=>Object.assign(Error(message),{status});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const opaque=()=>crypto.randomBytes(32).toString('base64url');
const publicUser=u=>({id:u.id,email:u.email,app_metadata:u.raw_app_meta_data||{},user_metadata:u.raw_user_meta_data||{}});
const bearer=options=>(options.headers?.Authorization||options.headers?.authorization||'').replace(/^Bearer /,'');
function accessToken(id,recovery){
 const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const data=Buffer.from(JSON.stringify({session_id:id,nonce:opaque(),amr:[{method:recovery?'recovery':'password'}]})).toString('base64url');
 return head+'.'+data+'.'+crypto.createHmac('sha256',process.env.LOCAL_AUTH_SECRET).update(head+'.'+data).digest('base64url');
}
async function createSession(db,user,recovery=false,id=crypto.randomUUID()){
 const access=accessToken(id,recovery),refresh=opaque();
 await db.query(`INSERT INTO local_auth.sessions(id,user_id,access_hash,refresh_hash,expires_at,refresh_expires_at,recovery)
 VALUES($1,$2,$3,$4,now()+interval '1 hour',now()+interval '30 days',$5)`,[id,user.id,hash(access),hash(refresh),recovery]);
 return {access_token:access,refresh_token:refresh,expires_in:3600,token_type:'bearer',user:publicUser(user)};
}
async function getSession(token){
 if(typeof token!=='string'||token.length>4096)return null;
 const r=await pool().query(`SELECT s.id AS session_id,s.recovery,u.* FROM local_auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.access_hash=$1 AND s.expires_at>now() AND u.banned_until IS NULL`,[hash(token)]);
 return r.rows[0]?{user:publicUser(r.rows[0]),sessionId:r.rows[0].session_id,recovery:r.rows[0].recovery}:null;
}
async function api(raw,options={}){
 const u=new URL(raw,'http://local/'),route=u.pathname.replace(/^\/?auth\/v1\//,'').replace(/^\//,''),body=typeof options.body==='string'?JSON.parse(options.body):options.body||{};
 if(route==='token'&&u.searchParams.get('grant_type')==='password'){
  const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
  const r=await pool().query('SELECT * FROM auth.users WHERE lower(email)=$1',[email]);const user=r.rows[0];
  const key=hash(email),attempt=await pool().query("SELECT count(*)::int AS n FROM local_auth.login_attempts WHERE key=$1 AND attempted_at>now()-interval '15 minutes'",[key]);
  if(attempt.rows[0].n>=10)throw fail(429,'Demasiados intentos. Esperá unos minutos.');
  // A dummy bcrypt check gives unknown accounts the same expensive path.
  const dummy='$2b$12$tBKq2lpC7n2cDxdEUGYmfORbSJHqKWaUuJsWnL7IrmTpYPN.PjaPi';
  const valid=await bcrypt.compare(password,user?.encrypted_password||dummy);
  if(!valid||!user||user.banned_until){await pool().query('INSERT INTO local_auth.login_attempts(key) VALUES($1)',[key]);throw fail(401,'Correo o contraseña incorrectos, o sesión vencida');}
  await pool().query('DELETE FROM local_auth.login_attempts WHERE key=$1',[key]);
  return createSession(pool(),user);
 }
 if(route==='token'&&u.searchParams.get('grant_type')==='refresh_token')return transaction(async db=>{
  const r=await db.query('SELECT s.id,s.user_id,s.recovery FROM local_auth.sessions s JOIN auth.users u ON u.id=s.user_id WHERE s.refresh_hash=$1 AND s.refresh_expires_at>now() AND u.banned_until IS NULL FOR UPDATE OF s',[hash(String(body.refresh_token||''))]);
  const old=r.rows[0];if(!old)throw fail(401,'Sesión vencida');
  const user=(await db.query('SELECT * FROM auth.users WHERE id=$1',[old.user_id])).rows[0];
  await db.query('DELETE FROM local_auth.sessions WHERE id=$1',[old.id]);return createSession(db,user,old.recovery,old.id);
 });
 if(route==='recover')return recover(body.email);
 if(route==='verify')return verify(body);
 const token=bearer(options),session=await getSession(token);if(!session)throw fail(401,'Iniciá sesión para continuar');
 if(route==='logout'){await pool().query('DELETE FROM local_auth.sessions WHERE id=$1',[session.sessionId]);return {};}
 if(route==='user'&&(!options.method||options.method==='GET'))return session.user;
 if(route==='user'&&options.method==='PUT'){
  if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)throw fail(400,'Usá una contraseña de 8 a 128 caracteres');
  const current=(await pool().query('SELECT * FROM auth.users WHERE id=$1',[session.user.id])).rows[0];
  if(!session.recovery&&!(await bcrypt.compare(String(body.current_password||''),current.encrypted_password)))throw fail(400,'La contraseña actual es incorrecta');
  if(await bcrypt.compare(body.password,current.encrypted_password))throw fail(400,'La nueva contraseña debe ser distinta a la actual');
  const password=await bcrypt.hash(body.password,12);
  await transaction(async db=>{
   await db.query('UPDATE auth.users SET encrypted_password=$1,updated_at=now() WHERE id=$2',[password,current.id]);
   await db.query('DELETE FROM local_auth.sessions WHERE user_id=$1 AND id<>$2',[current.id,session.sessionId]);
   await db.query('UPDATE local_auth.sessions SET recovery=false WHERE id=$1',[session.sessionId]);
  });return publicUser(current);
 }
 throw fail(405,'Operación no permitida');
}
async function admin(raw,options={}){
 const u=new URL(raw,'http://local'),parts=u.pathname.split('/').filter(Boolean),method=options.method||'GET';
 if(parts.slice(0,4).join('/')!=='auth/v1/admin/users')throw fail(404,'Operación no permitida');
 if(method==='GET'&&parts.length===4){
  const page=Math.max(1,Math.min(50,Number(u.searchParams.get('page')||1))),per=Math.max(1,Math.min(200,Number(u.searchParams.get('per_page')||200)));
  if(!Number.isInteger(page)||!Number.isInteger(per))throw fail(400,'Paginación inválida');
  const r=await pool().query('SELECT * FROM auth.users ORDER BY created_at,id LIMIT $1 OFFSET $2',[per,(page-1)*per]);return {users:r.rows.map(publicUser)};
 }
 const body=typeof options.body==='string'?JSON.parse(options.body):options.body||{};
 if(method==='POST'&&parts.length===4){
  const email=String(body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof body.password!=='string'||body.password.length<8)throw fail(400,'Cuenta inválida');
  const r=await pool().query('INSERT INTO auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) VALUES($1,$2,$3,$4,$5) RETURNING *',[crypto.randomUUID(),email,await bcrypt.hash(body.password,12),JSON.stringify(body.app_metadata||{}),JSON.stringify(body.user_metadata||{})]);return publicUser(r.rows[0]);
 }
 if(method==='PUT'&&parts.length===5){
  if(Object.keys(body).some(k=>!['app_metadata','user_metadata'].includes(k)))throw fail(400,'Campos de cuenta inválidos');
  const r=await pool().query('UPDATE auth.users SET raw_app_meta_data=coalesce($1::jsonb,raw_app_meta_data),raw_user_meta_data=coalesce($2::jsonb,raw_user_meta_data),updated_at=now() WHERE id=$3 RETURNING *',[body.app_metadata?JSON.stringify(body.app_metadata):null,body.user_metadata?JSON.stringify(body.user_metadata):null,parts[4]]);
  if(!r.rows.length)throw fail(404,'Cuenta no encontrada');return publicUser(r.rows[0]);
 }
 throw fail(405,'Operación no permitida');
}
async function recover(raw){
 if(!process.env.SMTP_HOST||!process.env.SMTP_FROM)throw fail(503,'Falta configurar el correo de recuperación en el servidor');
 const email=String(raw||'').trim().toLowerCase(),r=await pool().query('SELECT * FROM auth.users WHERE lower(email)=$1 AND banned_until IS NULL',[email]);
 if(!r.rows.length)return {};
 const user=r.rows[0],since=await pool().query("SELECT count(*)::int AS n FROM local_auth.recovery_tokens WHERE user_id=$1 AND created_at>now()-interval '15 minutes'",[user.id]);
 if(since.rows[0].n>=3)throw fail(429,'Demasiados intentos. Esperá unos minutos.');
 const token=crypto.randomBytes(32).toString('hex'),code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
 await pool().query("INSERT INTO local_auth.recovery_tokens(user_id,token_hash,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",[user.id,hash(token),hash(user.id+':'+code)]);
 const url=new URL('/recuperar.html',process.env.BITACORA_PUBLIC_URL);url.searchParams.set('token_hash',token);url.searchParams.set('type','recovery');
 const transport=require('nodemailer').createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}:{})});
 await transport.sendMail({from:process.env.SMTP_FROM,to:email,subject:'Recuperación de acceso · Bitácora KM',text:`Abrí este enlace para cambiar tu contraseña:\n${url.href}\n\nTambién podés usar el código ${code}. Vence en 10 minutos.`});return {};
}
async function verify(body){
 return transaction(async db=>{
  let r;
  if(body.token_hash)r=await db.query('SELECT r.*,u.email FROM local_auth.recovery_tokens r JOIN auth.users u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.expires_at>now() AND r.used_at IS NULL AND u.banned_until IS NULL FOR UPDATE OF r',[hash(String(body.token_hash))]);
  else{
   const email=String(body.email||'').toLowerCase(),user=(await db.query('SELECT id FROM auth.users WHERE lower(email)=$1',[email])).rows[0];
   if(!user)throw fail(401,'Código o enlace vencido');
   const key=hash('recovery:'+email),attempts=await db.query("SELECT count(*)::int AS n FROM local_auth.login_attempts WHERE key=$1 AND attempted_at>now()-interval '15 minutes'",[key]);
   if(attempts.rows[0].n>=10)throw fail(429,'Demasiados intentos. Esperá unos minutos.');
   // Persist attempts outside the transaction so a failed verification cannot roll back its counter.
   await pool().query('INSERT INTO local_auth.login_attempts(key) VALUES($1)',[key]);
   r=await db.query('SELECT * FROM local_auth.recovery_tokens WHERE user_id=$1 AND code_hash=$2 AND expires_at>now() AND used_at IS NULL FOR UPDATE',[user.id,hash(user.id+':'+String(body.token||''))]);
  }
  if(!r.rows.length)throw fail(401,'Código o enlace vencido');
  const current=r.rows[0];await db.query('UPDATE local_auth.recovery_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[current.user_id]);
  const user=(await db.query('SELECT * FROM auth.users WHERE id=$1',[current.user_id])).rows[0];return createSession(db,user,true);
 });
}
module.exports={api,admin,getSession,publicUser,createSession,hash};
