const C=require('../api/_config'),A=require('./auth'),U=require('./accounts'),M=require('./manager-area'),STANDARD=require('../config/manager-areas.json');
async function companyAreas(c){
 const rows=await C.allRows(c.employees,new URLSearchParams({select:'area',active:'eq.true',order:'area.asc'}));
 const seen=new Map();
 for(const raw of STANDARD[c.slug]||[]){const key=M.norm(raw);if(raw&&key&&!seen.has(key))seen.set(key,raw);}
 for(const r of rows){const raw=String(r.area||'').trim().replace(/\s+/g,' '),key=M.norm(raw);if(raw&&key&&!seen.has(key))seen.set(key,raw);}
 return [...seen.values()].sort((a,b)=>a.localeCompare(b,'es'));
}
module.exports=async(req,res)=>{try{
 const auth=await A.session(req,res);if(!auth.admin)throw A.fail(403,'Solo Administración habilita permisos de jefe');
 if(req.method==='GET'){
  const all=await U.users(),areasByCompany={};
  for(const c of Object.values(C.COMPANY))areasByCompany[c.slug]=await companyAreas(c);
  return C.send(res,200,{items:all.filter(u=>u.app_metadata?.bitacora_role==='manager').map(u=>({email:u.email,name:require('./report-signatures').personName(u),companies:A.managedCompanies({admin:false,user:u}),areas:Array.isArray(u.app_metadata?.bitacora_managed_areas)?u.app_metadata.bitacora_managed_areas:[]})),areasByCompany});
 }
 if(req.method!=='POST')return C.send(res,405,{error:'Método no permitido'});
 const b=await C.readJson(req),e=U.email(b.email),company=b.revoke?null:C.getCompany(b.company);
 if(!b.revoke&&!company)throw A.fail(400,'Elegí la empresa del jefe');
 let area=null;
 if(!b.revoke){
  const requested=String(b.area||'').trim().replace(/\s+/g,' '),available=await companyAreas(company);
  area=available.find(x=>M.norm(x)===M.norm(requested))||null;
  if(!area)throw A.fail(400,'Elegí un área válida para este jefe');
 }
 const name=String(b.name||'').trim().replace(/\s+/g,' ');
 if(name&&(!/\S+\s+\S+/.test(name)||name.length>150))throw A.fail(400,'Ingrese nombre y apellidos del jefe');
 let target=(await U.users()).find(u=>u.email?.toLowerCase()===e),password=null;
 if(target?.app_metadata?.bitacora_role==='admin'||target?.id===auth.user.id||e==='auditor-general@newcenturyni.com')throw A.fail(409,'La cuenta de administrador conserva su acceso');
 if(b.revoke&&!target)throw A.fail(404,'Cuenta no encontrada');
 if(b.revoke&&target.app_metadata?.bitacora_role!=='manager')throw A.fail(409,'Esta cuenta no tiene permiso de jefe');
 if(!target){const created=await U.account(e);target=created.user;password=created.password;}
 await C.sb('/auth/v1/admin/users/'+target.id,{method:'PUT',headers:U.write,body:JSON.stringify({app_metadata:{...target.app_metadata,bitacora_role:b.revoke?'collaborator':'manager',bitacora_managed_companies:b.revoke?[]:[company.slug],bitacora_managed_areas:b.revoke?[]:[area],...(!b.revoke&&name?{bitacora_manager_name:name}:{})}})});
 return C.send(res,200,{email:e,company:company?.slug||null,area,password,revoked:!!b.revoke});
 }catch(e){return C.send(res,e.status||503,{error:e.status?e.message:'No fue posible actualizar el permiso de jefe'});}};
