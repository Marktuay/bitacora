const C=require('../api/_config'),A=require('./auth');
const required=user=>user?.app_metadata?.bitacora_password_pending===true;
async function change(req,res,auth,body){
  const password=body.password;
  if(typeof password!=='string'||password.length<8||password.length>128)throw A.fail(400,'Usá una contraseña de 8 a 128 caracteres');
  if(body.confirmation!==password)throw A.fail(400,'Las contraseñas no coinciden');
  const recovery=body.recovery===true&&require('./recovery').allowed(req,auth);
  if(body.recovery===true&&!recovery)throw A.fail(401,'El enlace de recuperación venció. Solicitá uno nuevo.');
  if(!recovery&&(typeof body.currentPassword!=='string'||!body.currentPassword||body.currentPassword.length>256))throw A.fail(400,'Escribí tu contraseña actual');
  // Authenticate the owner again without replacing the device assignment or trip queue.
  const verified=recovery?{user:auth.user,access_token:auth.token}:await A.authFetch('token?grant_type=password',{method:'POST',body:JSON.stringify({email:auth.user.email,password:body.currentPassword})}).catch(e=>{if(e.status===401)throw A.fail(400,'La contraseña actual es incorrecta');throw e;});
  if(verified.user?.id!==auth.user.id)throw A.fail(403,'La cuenta no coincide con la sesión');
  if(!recovery)A.setSession(req,res,verified);
  await A.authFetch('user',{method:'PUT',headers:{Authorization:'Bearer '+verified.access_token},body:JSON.stringify({password,...(!recovery?{current_password:body.currentPassword}:{})})});
  if(required(auth.user)){
    try{
      await C.sb('/auth/v1/admin/users/'+auth.user.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_metadata:{...verified.user.app_metadata,bitacora_password_pending:false,bitacora_password_personalized_at:new Date().toISOString()}})});
    }catch{
      throw A.fail(503,'La contraseña se guardó. Volvé a ingresar con la nueva contraseña y completá Mi cuenta. Tus gestiones se conservan.');
    }
  }
  const fresh=await A.authFetch('token?grant_type=password',{method:'POST',body:JSON.stringify({email:auth.user.email,password})}).catch(()=>null);
  if(fresh)A.setSession(req,res,fresh,[require('./recovery').cookie(req,'',0)]);
  else if(recovery)res.setHeader('Set-Cookie',require('./recovery').cookie(req,'',0));
  return {ok:true,passwordChangeRequired:false};
}
module.exports={required,change};
