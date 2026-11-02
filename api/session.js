const C=require('./_config');
const A=require('../lib/auth');
const RL=require('../lib/rate-limit');
module.exports=async function(req,res){
  try {
    A.csrf(req);
    const action=new URL(req.url,'http://localhost').searchParams.get('action');
    if(req.method==='POST'&&action==='recover')return C.send(res,200,await require('../lib/recovery').request(await C.readJson(req)));
    if(req.method==='POST'&&action==='recovery')return C.send(res,200,await require('../lib/recovery').verify(req,res,await C.readJson(req)));
    if(req.method==='POST'&&action==='login') {
      const rl=RL.checkRateLimit(req,{limit:5,windowMs:60000});
      if(!rl.allowed){
        res.setHeader('Retry-After',String(rl.retryAfter));
        return C.send(res,429,{error:'Demasiados intentos fallidos. Intente nuevamente en 1 minuto.'});
      }
      const b=await C.readJson(req);
      if(typeof b.email!=='string'||typeof b.password!=='string'||b.email.length>254||b.password.length>256)return C.send(res,400,{error:'Correo y contraseña requeridos'});
      const data=await A.authFetch('token?grant_type=password',{method:'POST',body:JSON.stringify({email:b.email.trim(),password:b.password})});
      RL.resetRateLimit(req);
      A.setSession(req,res,data);return C.send(res,200,{ok:true,passwordChangeRequired:require('../lib/password').required(data.user)});
    }
    if(req.method==='POST'&&action==='logout') {
      const token=A.cookies(req).km_access;
      if(token)await A.authFetch('logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+token}}).catch(()=>{});
      A.setSession(req,res,null);return C.send(res,200,{ok:true});
    }
    const s=await A.session(req,res);
    if(req.method==='POST'&&action==='password') {
      return C.send(res,200,await require('../lib/password').change(req,res,s,await C.readJson(req)));
    }
    if(req.method==='GET')return C.send(res,200,{email:s.user.email,admin:s.admin,passwordChangeRequired:require('../lib/password').required(s.user),managedCompanies:A.managedCompanies(s),profiles:s.admin?[]:await A.assignments(s)});
    return C.send(res,405,{error:'Método no permitido'});
  }catch(e){return C.send(res,e.status||503,{error:e.status?e.message:'No fue posible consultar la sesión'});}
};
