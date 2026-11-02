const {send,getCompany}=require('./_config');
const fuelHandler=require('../lib/fuel-route');
const A=require('../lib/auth'),M=require('../lib/manager-area');
module.exports=async(req,res)=>{if(new URL(req.url,'http://localhost').searchParams.get('fuel')==='1')return fuelHandler(req,res);if(req.method!=='GET')return send(res,405,{error:'Método no permitido'});try{
 const u=new URL(req.url,'http://localhost'),company=getCompany(u.searchParams.get('company')),employeeId=u.searchParams.get('employeeId'),auth=await A.session(req,res);
 if(company&&A.canReview(auth,company.slug)&&!auth.admin&&!await M.employee(auth,company.slug,employeeId))throw A.fail(403,'No tenés acceso a colaboradores de esta área');
 const r=await A.reportData(req,res);const signatures=await require('../lib/report-signatures').reportSignatures(r.company,r.employee);return send(res,200,{items:r.items,signatures,demo:false});
}catch(e){return send(res,e.status||503,{error:e.status?e.message:'No fue posible generar el reporte'});}};
