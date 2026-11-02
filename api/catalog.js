const { getCompany, dbReady, send, sb, tablePath, allRows } = require('./_config');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido' });
  const url = new URL(req.url, 'http://localhost');
  const company = getCompany(url.searchParams.get('company'));
  if (!company) return send(res, 400, { error: 'Empresa inválida' });
  if (!dbReady()) return send(res,503,{error:'Conexión a Supabase pendiente de configurar'});

  try {
    const A=require('../lib/auth'),M=require('../lib/manager-area'),auth=await A.session(req,res);
    if(A.canReview(auth,company.slug)){
      const [employees,vehicles]=await Promise.all([
        allRows(company.employees,new URLSearchParams({select:'id,name,area,role,active',active:'eq.true',order:'name.asc,id.asc'})),
        allRows(company.vehicles,new URLSearchParams({select:'id,type,brand,plate,traccar_device_id,rate,employee_id,active',active:'eq.true',order:'plate.asc,id.asc'}))
      ]);
      const visible=auth.admin?employees:employees.filter(e=>M.allowed(auth,company.slug,e.area)),ids=new Set(visible.map(e=>e.id));
      return send(res,200,{company:company.name,employees:visible,vehicles:auth.admin?vehicles:vehicles.filter(v=>ids.has(v.employee_id)),demo:false});
    }
    const assigned=(await A.assignments(auth)).filter(p=>p.company===company.slug);
    if(!assigned.length)return send(res,403,{error:'No tenés acceso al catálogo de esta empresa'});
    const ids=new Set(assigned.map(p=>p.id));
    const allVehicles=await allRows(company.vehicles,new URLSearchParams({select:'id,type,brand,plate,traccar_device_id,rate,employee_id,active',active:'eq.true',order:'id.asc'}));
    return send(res,200,{company:company.name,employees:assigned.map(p=>({...p,active:true})),vehicles:allVehicles.filter(v=>ids.has(v.employee_id)),demo:false});
  } catch (error) {
    console.error(error);
    return send(res, error.status||500, { error: error.status?error.message:'No fue posible cargar el catálogo' });
  }
};
