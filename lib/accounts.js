const crypto=require('node:crypto'),C=require('../api/_config'),A=require('./auth');
const write={'Content-Type':'application/json',Prefer:'return=representation'};
async function users(){const list=[];for(let page=1;page<=50;page++){const r=await C.sb('/auth/v1/admin/users?'+new URLSearchParams({page:String(page),per_page:'200'}));const batch=r.users||[];list.push(...batch);if(batch.length<200)return list;}throw A.fail(503,'La lista de cuentas requiere un filtro adicional');}
function email(value){const e=String(value||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||e.length>254)throw A.fail(400,'Correo inválido');return e;}
async function account(value,registration){const e=email(value);let user=(await users()).find(u=>u.email?.toLowerCase()===e),password=null;
 const derived=()=>crypto.createHmac('sha256',C.supabaseKey()).update(registration.actorId+':'+registration.requestId+':'+e).digest('base64url').slice(0,32);
 if(!user){password=registration?derived():crypto.randomBytes(18).toString('base64url');const r=await C.sb('/auth/v1/admin/users',{method:'POST',headers:write,body:JSON.stringify({email:e,password,email_confirm:true,app_metadata:{bitacora_password_pending:true,...(registration?{bitacora_registration_request:registration.requestId,bitacora_registration_actor:registration.actorId}:{})}})});user=r.user||r;}
 else if(registration&&user.app_metadata?.bitacora_registration_request===registration.requestId&&user.app_metadata?.bitacora_registration_actor===registration.actorId&&!user.app_metadata?.bitacora_password_personalized_at)password=derived();
 if(!user.id)throw A.fail(503,'No se pudo crear la cuenta');return {user,email:e,password};
}
module.exports={users,email,account,write};
