const C=require('../api/_config');
const A=require('./auth');

function norm(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
}
function areas(auth){
  if(auth.admin)return null;
  const meta=auth.user?.app_metadata||{};
  if(meta.bitacora_role!=='manager')return [];
  const raw=meta.bitacora_managed_areas;
  return Array.isArray(raw)?[...new Set(raw.map(norm).filter(Boolean))]:[];
}
function companyAllowed(auth,company){
  if(auth.admin)return true;
  const meta=auth.user?.app_metadata||{},companies=meta.bitacora_managed_companies;
  return meta.bitacora_role==='manager'&&Array.isArray(companies)&&companies.length===1&&companies[0]===company;
}
function allowed(auth,company,area){
  return auth.admin||(companyAllowed(auth,company)&&areas(auth).includes(norm(area)));
}
async function employee(auth,company,employeeId){
  const c=C.getCompany(company);if(!c)return null;
  const row=(await C.sb(C.tablePath(c.employees,new URLSearchParams({select:'id,name,area,role,active',id:`eq.${employeeId}`,active:'eq.true',limit:'1'}))))?.[0]||null;
  if(!row||!allowed(auth,c.slug,row.area))return null;
  return row;
}
async function requireEmployee(req,res,company,employeeId){
  const auth=await A.session(req,res),row=await employee(auth,company,employeeId);
  if(!row)throw A.fail(403,'No tenés acceso a colaboradores de esta área');
  return {auth,employee:row};
}
async function requireEntry(req,res,company,entry){
  const auth=await A.session(req,res);
  if(!allowed(auth,company,entry?.area_employee))throw A.fail(403,'No tenés acceso a recorridos de esta área');
  return auth;
}
module.exports={norm,areas,companyAllowed,allowed,employee,requireEmployee,requireEntry};
