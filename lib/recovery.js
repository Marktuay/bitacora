const crypto=require('node:crypto'),C=require('../api/_config'),A=require('./auth');
function sessionId(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id||'';}catch{return '';}}
function cookie(req,value,maxAge=600){const secure=process.env.NODE_ENV!=='test'&&!/^localhost(?::|$)|^127\.0\.0\.1(?::|$)/.test(req.headers.host||'');return `km_recovery=${value}; Path=/; HttpOnly; SameSite=Lax${secure?'; Secure':''}; Max-Age=${maxAge}`;}
function proof(user,token){
  const data=Buffer.from(JSON.stringify({user:user.id,session:sessionId(token),expires:Date.now()+600000})).toString('base64url');
  return data+'.'+crypto.createHmac('sha256',C.supabaseKey()).update(data).digest('hex');
}
function allowed(req,auth){
  const raw=A.cookies(req).km_recovery||'',parts=raw.split('.');if(parts.length!==2||!C.supabaseKey())return false;
  const signature=crypto.createHmac('sha256',C.supabaseKey()).update(parts[0]).digest('hex');
  if(!/^[a-f0-9]{64}$/.test(parts[1])||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(parts[1])))return false;
  try{const data=JSON.parse(Buffer.from(parts[0],'base64url'));return data.user===auth.user.id&&!!data.session&&data.session===sessionId(auth.token)&&data.expires>Date.now();}catch{return false;}
}
async function request(body){
  const email=require('./accounts').email(body.email);
  try{await A.authFetch('recover?redirect_to='+encodeURIComponent('https://bitacora-km.vercel.app'),{method:'POST',body:JSON.stringify({email})});}
  catch(e){if(e.status===429)throw e;throw A.fail(503,'No se pudo enviar el correo de recuperación. Intentá nuevamente en unos minutos.');}
  return {ok:true,message:'Si el correo tiene una cuenta, recibirás un enlace para elegir una nueva contraseña. Revisá también correo no deseado.'};
}
async function verify(req,res,body){
  let data;
  if(typeof body.tokenHash==='string'&&/^[a-f0-9]{32,128}$/i.test(body.tokenHash)){
    data=await A.authFetch('verify',{method:'POST',body:JSON.stringify({type:'recovery',token_hash:body.tokenHash})});
  }else if(body.email&&typeof body.code==='string'&&/^\d{6}$/.test(body.code)){
    data=await A.authFetch('verify',{method:'POST',body:JSON.stringify({type:'recovery',email:require('./accounts').email(body.email),token:body.code})});
  }else if(typeof body.accessToken==='string'&&body.accessToken.length<8192&&typeof body.refreshToken==='string'&&body.refreshToken.length<8192){
    const user=await A.authFetch('user',{headers:{Authorization:'Bearer '+body.accessToken}});
    let claims;try{claims=JSON.parse(Buffer.from(body.accessToken.split('.')[1],'base64url'));}catch{throw A.fail(400,'Enlace de recuperación inválido');}
    if(!(claims.amr||[]).some(a=>['otp','recovery'].includes(a.method)))throw A.fail(403,'Usá el enlace o código enviado a tu correo para recuperar la contraseña');
    // Refresh proves this pair belongs to the same provider session; never retain a foreign refresh token.
    data=await A.authFetch('token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:body.refreshToken})});
    if(data.user?.id!==user.id||sessionId(data.access_token)!==sessionId(body.accessToken))throw A.fail(403,'El enlace no corresponde a esta cuenta');
  }else throw A.fail(400,'Ingresá el enlace o código de recuperación enviado al correo');
  if(!data.user?.id||!data.access_token||!data.refresh_token)throw A.fail(400,'El enlace venció. Solicitá uno nuevo.');
  A.setSession(req,res,data,[cookie(req,proof(data.user,data.access_token))]);
  return {ok:true,email:data.user.email};
}
module.exports={allowed,request,verify,cookie};
