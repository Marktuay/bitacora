const M=require('./manager-area');
const U=require('./accounts');

function personName(user){
 const candidates=[
  user.app_metadata?.bitacora_manager_name,
  user.user_metadata?.full_name,
  user.user_metadata?.name,
  user.user_metadata?.display_name
 ];
 return candidates.map(x=>String(x||'').trim().replace(/\s+/g,' ')).find(x=>x.length>=2)||null;
}

// Misma identificación para pantalla, Excel y PDF. Nunca inferir nombres del correo.
async function reportSignatures(company,employee){
 const elaboratedBy=employee?.id?employee.name:'Administración';
 if(!employee?.id)return {elaboratedBy,reviewedBy:'No aplica (reporte consolidado)'};
 if(!employee?.area)return {elaboratedBy,reviewedBy:'Jefe pendiente de identificar'};
 try{
  const users=await U.users();
  // El Auditor Corporativo utiliza su cuenta de administrador, no una
  // segunda cuenta de jefe. Esto afecta exclusivamente a la firma.
  if(company.slug==='newcentury'&&M.norm(employee.area)==='AUDITORIA'){
   const auditor=users.find(u=>
    u.app_metadata?.bitacora_role==='admin'
    &&String(u.email||'').toLowerCase()==='auditor-general@newcenturyni.com'
   );
   return {elaboratedBy,reviewedBy:auditor
    ?personName(auditor)||'Nombre del jefe de Auditoría pendiente de registrar'
    :'Jefe de Auditoría pendiente de identificar'};
  }
  const managers=users.filter(u=>{
   const meta=u.app_metadata||{};
   return meta.bitacora_role==='manager'
    &&Array.isArray(meta.bitacora_managed_companies)
    &&meta.bitacora_managed_companies.length===1
    &&meta.bitacora_managed_companies[0]===company.slug
    &&Array.isArray(meta.bitacora_managed_areas)
    &&meta.bitacora_managed_areas.some(area=>M.norm(area)===M.norm(employee.area));
  });
  if(managers.length===0)return {elaboratedBy,reviewedBy:'Jefe pendiente de asignar'};
  if(managers.length>1)return {elaboratedBy,reviewedBy:'Responsable pendiente de definir (varios jefes)'};
  return {elaboratedBy,reviewedBy:personName(managers[0])||'Nombre del jefe pendiente de registrar'};
 }catch(error){
  console.error('No se pudo obtener la identificación del jefe:',error);
  return {elaboratedBy,reviewedBy:'Jefe pendiente de identificar'};
 }
}
module.exports={reportSignatures,personName};
