const {test,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const C=require('../api/_config'),A=require('../lib/auth'),P=require('../lib/password'),R=require('../lib/recovery');
const original={authFetch:A.authFetch,sb:C.sb};
Object.assign(process.env,{SUPABASE_SECRET_KEY:'test-server-only',SUPABASE_URL:'https://test.invalid',NODE_ENV:'test'});
const token=(id,method='password')=>['header',Buffer.from(JSON.stringify({session_id:id,amr:[{method}]})).toString('base64url'),'signature'].join('.');
let user,changes=[],failUpdate=false,proofCookie='',sendBody;
const session=()=>({user,token:token('session-1'),admin:false});
function reset(){user={id:'owner-id',email:'owner@example.invalid',app_metadata:{provider:'email',bitacora_password_pending:true,bitacora_managed_companies:['newcentury']}};changes=[];failUpdate=false;}
A.authFetch=async(path,options={})=>{
 const b=options.body?JSON.parse(options.body):{};
 if(path.startsWith('token?grant_type=password')){
  if(!['initial-password-123','personal-password-456','Clave8!?'].includes(b.password))throw A.fail(401,'Invalid credentials');
  return {user,access_token:token('session-1'),refresh_token:'refresh-1'};
 }
 if(path==='user'&&options.method==='PUT'){if(failUpdate)throw Object.assign(A.fail(400,'Contraseña débil'),{code:'weak_password'});changes.push(b);return user;}
 if(path.startsWith('recover?')){sendBody={path,b};return {};}
 if(path==='verify'){
  if(b.token_hash==='b'.repeat(64)||b.token==='123456')return {user,access_token:token('recovery-session','otp'),refresh_token:'recovery-refresh'};
  throw A.fail(401,'Expired');
 }
 if(path==='user')return user;
 if(path==='token?grant_type=refresh_token')return {user,access_token:token('recovery-session','otp'),refresh_token:'rotated-refresh'};
 throw Error('Unexpected path '+path);
};
C.sb=async(path,options)=>{assert.equal(path,'/auth/v1/admin/users/owner-id');Object.assign(user,JSON.parse(options.body));return user;};
async function call(action,body,auth=session(),cookie=''){
 let status,data;const headers={};
 await require('../api/session')({method:'POST',url:'/api/session?action='+action,headers:{host:'localhost',cookie},body,kmSession:auth},{setHeader(k,v){headers[k]=v},set statusCode(v){status=v},end(raw){data=JSON.parse(raw)}});
 return {status,data,headers};
}
test('First login reports personalization and direct API access is gated',async()=>{
 reset();const r=await call('login',{email:user.email,password:'initial-password-123'});assert.equal(r.status,200);assert.equal(r.data.passwordChangeRequired,true);
 await assert.rejects(A.session({method:'POST',url:'/api/team',headers:{},kmSession:session()},{}),e=>e.status===428);
 const auth=session();auth.user={...user,app_metadata:{},user_metadata:{bitacora_password_pending:false}};
 assert.equal(await A.session({method:'GET',url:'/api/team',headers:{},kmSession:auth},{}),auth);
});
test('Only matching passwords and the current owner credential can update',async()=>{
 reset();const valid={currentPassword:'initial-password-123',password:'personal-password-456',confirmation:'personal-password-456'};
 assert.equal((await call('password',{...valid,confirmation:'different'})).status,400);
 assert.equal((await call('password',{...valid,currentPassword:'wrong'})).status,400);
 assert.equal(changes.length,0);
 const r=await call('password',valid);assert.equal(r.status,200);assert.equal(changes.length,1);assert.equal(user.app_metadata.bitacora_password_pending,false);
 assert.deepEqual(user.app_metadata.bitacora_managed_companies,['newcentury']);assert.equal(user.app_metadata.provider,'email');
 assert.ok(r.headers['Set-Cookie'].some(c=>c.startsWith('km_refresh=')));
});
test('A rejected password never clears the first-login requirement',async()=>{
 reset();failUpdate=true;const r=await call('password',{currentPassword:'initial-password-123',password:'personal-password-456',confirmation:'personal-password-456'});
 assert.equal(r.status,400);assert.equal(user.app_metadata.bitacora_password_pending,true);assert.equal(changes.length,0);
});
test('Eight-character passwords work and shorter passwords cannot change the account',async()=>{
 reset();
 const short=await call('password',{currentPassword:'initial-password-123',password:'Clave8!',confirmation:'Clave8!'});
 assert.equal(short.status,400);assert.match(short.data.error,/8 a 128/);assert.equal(changes.length,0);assert.equal(user.app_metadata.bitacora_password_pending,true);
 const accepted=await call('password',{currentPassword:'initial-password-123',password:'Clave8!?',confirmation:'Clave8!?'});
 assert.equal(accepted.status,200);assert.equal(changes[0].password,'Clave8!?');assert.equal(user.app_metadata.bitacora_password_pending,false);
});
test('Recovery sends a production redirect and never reveals whether an account exists',async()=>{
 reset();const r=await call('recover',{email:'unknown@example.invalid'});assert.equal(r.status,200);assert.match(r.data.message,/Si el correo tiene una cuenta/);
 assert.equal(new URL('https://auth.invalid/'+sendBody.path).searchParams.get('redirect_to'),'https://bitacora-km.vercel.app');
 assert.deepEqual(sendBody.b,{email:'unknown@example.invalid'});assert.equal(r.headers['Set-Cookie'],undefined);
});
test('Email recovery proof is scoped, expires, and cannot be fabricated by a normal session',async()=>{
 reset();const r=await call('recovery',{tokenHash:'b'.repeat(64)},null);assert.equal(r.status,200);
 proofCookie=r.headers['Set-Cookie'].find(c=>c.startsWith('km_recovery=')).split(';')[0];
 const auth={user,token:token('recovery-session','otp'),admin:false};
 assert.equal(R.allowed({headers:{cookie:proofCookie}},auth),true);
 assert.equal(R.allowed({headers:{cookie:proofCookie}},{...auth,token:token('other-session','otp')}),false);
 assert.equal(R.allowed({headers:{cookie:proofCookie}},{...auth,user:{id:'other-owner'}}),false);
 assert.equal(R.allowed({headers:{cookie:proofCookie+'bad'}},auth),false);
 const time=Date.now;Date.now=()=>time()+601000;assert.equal(R.allowed({headers:{cookie:proofCookie}},auth),false);Date.now=time;
 assert.equal((await call('password',{password:'personal-password-456',confirmation:'personal-password-456',recovery:true},session())).status,401);
 const changed=await call('password',{password:'Clave8!?',confirmation:'Clave8!?',recovery:true},auth,proofCookie);assert.equal(changed.status,200);assert.deepEqual(changes[0],{password:'Clave8!?'});
 assert.ok(changed.headers['Set-Cookie'].some(c=>c.startsWith('km_recovery=;')));
});
test('Expired links and password-login tokens cannot start recovery',async()=>{
 reset();assert.equal((await call('recovery',{tokenHash:'a'.repeat(64)},null)).status,401);
 assert.equal((await call('recovery',{accessToken:token('session-1','password'),refreshToken:'refresh'},null)).status,403);
});
after(()=>{A.authFetch=original.authFetch;C.sb=original.sb;});
