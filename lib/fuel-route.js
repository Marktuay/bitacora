'use strict';
const {getCompany,readJson,send,sb,tablePath,dbReady,validPeriod}=require('../api/_config');
const A=require('./auth');
const M=require('./manager-area');
const {FUEL_PRICES,estimateFuel}=require('./fuel-estimate');
const error=(status,message)=>Object.assign(new Error(message),{status});
async function lookup(company,employeeId,from,to){
  const q=new URLSearchParams({select:'*',company:`eq.${company}`,employee_id:`eq.${employeeId}`,period_from:`eq.${from}`,period_to:`eq.${to}`,status:'neq.Anulado',limit:'1'});
  const rows=await sb(tablePath('km_fuel_renditions',q));return rows?.[0]||null;
}
module.exports=async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Método no permitido'});
  try{
    // Conservar el control de áreas de los jefes que aplica /api/report.
    const url=new URL(req.url,'http://localhost');
    const companyScope=getCompany(url.searchParams.get('company'));
    const employeeScope=url.searchParams.get('employeeId');
    const auth=await A.session(req,res);
    if(companyScope&&A.canReview(auth,companyScope.slug)&&!auth.admin
      &&!await M.employee(auth,companyScope.slug,employeeScope)){
      throw A.fail(403,'No tenés acceso a colaboradores de esta área');
    }
    // El cálculo incluye todos los recorridos laborales del período, sin filtrar por aprobación.
    url.searchParams.delete('reviewStatus');
    req.url=url.pathname+'?'+url.searchParams.toString();
    const report=await A.reportData(req,res);
    if(!dbReady())throw error(503,'La base de datos no está disponible');
    const {company,employee,from,to,items}=report;
    const existing=await lookup(company.slug,employee.id,from,to);
    if(req.method==='GET')return send(res,200,{item:existing,prices:FUEL_PRICES});
    const body=await readJson(req);
    const voucherNumber=String(body.voucherNumber||'').trim();
    const voucherDate=String(body.voucherDate||'').trim();
    if(!voucherNumber||voucherNumber.length>60||/[\r\n]/.test(voucherNumber))throw error(422,'Ingresá un número de vale válido (máximo 60 caracteres)');
    if(!validPeriod(voucherDate,voucherDate))throw error(422,'Ingresá una fecha válida para el vale');
    // La fecha documental no filtra recorridos ni participa en las fórmulas.
    const calculated=estimateFuel(items,body.amount,body.fuelType);
    if(existing?.status==='Verificado')throw error(409,'Este vale ya fue verificado y no se puede reemplazar');
    const row={company:company.slug,employee_id:employee.id,employee_name:employee.name,
      employee_area:employee.area||null,submitted_by:req.kmSession.user.id,
      vehicle_key:calculated.vehicleKey,fuel_date:to,voucher_date:voucherDate,
      voucher_number:voucherNumber,fuel_amount:calculated.fuelAmount,
      fuel_price:calculated.fuelPrice,fuel_type:calculated.fuelType,
      period_from:from,period_to:to,
      km_since:calculated.kmOdometer,km_period:calculated.kmLabor,
      liters:calculated.litersAssigned,km_per_liter:calculated.kmPerLiter,
      next_amount:calculated.nextAmount,
      odometer_initial:calculated.odometerInitial,odometer_final:calculated.odometerFinal,
      km_registered:calculated.kmLabor,km_gap:calculated.kmOdometer-calculated.kmLabor,
      status:'Pendiente',reviewed_at:null,reviewed_by:null};
    const opts={headers:{'Content-Type':'application/json',Prefer:'return=representation'}};
    const result=existing
      ?await sb(tablePath('km_fuel_renditions',new URLSearchParams({id:`eq.${existing.id}`,status:'eq.Pendiente'})),{method:'PATCH',...opts,body:JSON.stringify(row)})
      :await sb(tablePath('km_fuel_renditions'),{method:'POST',...opts,body:JSON.stringify(row)});
    if(!result?.length)throw error(409,'No fue posible actualizar el vale; volvé a generar el reporte');
    return send(res,200,{item:result[0],estimate:calculated});
  }catch(e){
    if(e.status)return send(res,e.status,{error:e.message});
    if(/Seleccioná|Ingresá|No hay recorridos|Los recorridos|Revisá los odómetros|Hay kilómetros/.test(e.message))return send(res,422,{error:e.message});
    console.error('Vale opcional',e);
    return send(res,503,{error:'No fue posible consultar o guardar el vale. Podés continuar con tu bitácora normalmente.'});
  }
};
