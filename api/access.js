const crypto=require('node:crypto');
const C=require('./_config'),A=require('../lib/auth'),M=require('../lib/manager-area');
const write={'Content-Type':'application/json',Prefer:'return=representation'};
async function users(){
  const all=[];
  for(let page=1;page<=50;page++){
    const r=await C.sb(`/auth/v1/admin/users?page=${page}&per_page=200`);const batch=r.users||[];
    all.push(...batch);if(batch.length<200)return all;
  }
  throw A.fail(503,'La lista de cuentas requiere un filtro adicional');
}
module.exports=async(req,res)=>{
 try{
  const s=await A.session(req,res),scopes=A.managedCompanies(s);if(!scopes.length)throw A.fail(403,'Permiso de jefe o administrador requerido');
  if(req.method==='GET'){
    const [list,links]=await Promise.all([users(),C.allRows('km_report_access',new URLSearchParams({select:'user_id,company,employee_id,active',order:'company,employee_id,user_id'}))]);
    const emails=new Map(list.map(u=>[u.id,u.email])),allowed=new Map();
    for(const slug of scopes){
      const c=C.getCompany(slug);if(!c)continue;
      const employees=await C.allRows(c.employees,new URLSearchParams({select:'id,area',active:'eq.true'}));
      allowed.set(slug,new Set((s.admin?employees:employees.filter(e=>M.allowed(s,slug,e.area))).map(e=>e.id)));
    }
    return C.send(res,200,{items:links.filter(l=>scopes.includes(l.company)&&allowed.get(l.company)?.has(l.employee_id)).map(l=>({...l,email:emails.get(l.user_id)||'Cuenta no disponible'}))});
  }
  if(!['POST','PATCH'].includes(req.method))return C.send(res,405,{error:'Método no permitido'});
  const b=await C.readJson(req),c=C.getCompany(b.company);
  if(!c||typeof b.employeeId!=='string')throw A.fail(400,'Empresa y colaborador requeridos');
  if(!A.canReview(s,c.slug))throw A.fail(403,'Solo podés habilitar cuentas de tu empresa');
  const employee=(await C.sb(C.tablePath(c.employees,new URLSearchParams({select:'id,name,area',id:`eq.${b.employeeId}`,active:'eq.true'}))))?.[0];
  if(!employee)throw A.fail(400,'Colaborador no disponible');
  if(!s.admin&&!M.allowed(s,c.slug,employee.area))throw A.fail(403,'Solo podés administrar accesos de colaboradores de tu área');
  if(req.method==='PATCH'){
    if(!/^[a-f0-9-]{36}$/i.test(b.userId||''))throw A.fail(400,'Cuenta inválida');
    await C.sb(C.tablePath('km_report_access',new URLSearchParams({user_id:`eq.${b.userId}`,company:`eq.${c.slug}`,employee_id:`eq.${b.employeeId}`})),{method:'PATCH',headers:write,body:JSON.stringify({active:false})});
    return C.send(res,200,{ok:true});
  }
  const email=String(b.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw A.fail(400,'Correo inválido');
  let user=(await users()).find(u=>u.email?.toLowerCase()===email),password=null;
  if(!user){
    password=crypto.randomBytes(18).toString('base64url');
    user=await C.sb('/auth/v1/admin/users',{method:'POST',headers:write,body:JSON.stringify({email,password,email_confirm:true,app_metadata:{bitacora_password_pending:true}})});
    user=user.user||user;
  }
  if(!user.id)throw A.fail(503,'No se pudo crear la cuenta');
  await C.sb(C.tablePath('km_report_access',new URLSearchParams({on_conflict:'user_id,company,employee_id'})),{method:'POST',headers:{...write,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({user_id:user.id,company:c.slug,employee_id:employee.id,active:true})});
  return C.send(res,200,{ok:true,email,password,employee:employee.name,created:!!password});
 }catch(e){return C.send(res,e.status||503,{error:e.status?e.message:'No fue posible guardar el acceso. Revisá la lista antes de repetir.'});}
};
