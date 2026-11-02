const C=require('./_config'),A=require('../lib/auth'),U=require('../lib/accounts'),M=require('../lib/manager-area');
const uuid=x=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x||'');
function text(v,label,max,required=false){if(typeof v!=='string')v='';v=v.trim().replace(/\s+/g,' ');if(v.length>max||required&&v.length<2)throw A.fail(400,label+' inválido');return v;}
module.exports=async(req,res)=>{if(new URL(req.url,'http://localhost').searchParams.get('action')==='managers')return require('../lib/managers')(req,res);try{
 const auth=await A.session(req,res),scopes=A.managedCompanies(auth);if(!scopes.length)throw A.fail(403,'Permiso de jefe o administrador requerido');
 const b=req.method==='GET'?Object.fromEntries(new URL(req.url,'http://localhost').searchParams):await C.readJson(req),c=C.getCompany(b.company);if(!c)throw A.fail(400,'Empresa inválida');if(!A.canReview(auth,c.slug))throw A.fail(403,'Solo podés registrar empleados de tu empresa');
 if(req.method==='GET'){
  const [employees,vehicles]=await Promise.all([C.allRows(c.employees,new URLSearchParams({select:'id,name,area,role',active:'eq.true',order:'name.asc,id.asc'})),C.allRows(c.vehicles,new URLSearchParams({select:'id,type,brand,plate,employee_id',active:'eq.true',order:'id.asc'}))]);
  if(auth.admin)return C.send(res,200,{company:c.name,employees,vehicles});
  const visible=employees.filter(e=>M.allowed(auth,c.slug,e.area)),ids=new Set(visible.map(e=>e.id));
  return C.send(res,200,{company:c.name,employees:visible,vehicles:vehicles.filter(v=>!v.employee_id||ids.has(v.employee_id))});
 }
 if(req.method!=='POST')return C.send(res,405,{error:'Método no permitido'});
 if(!uuid(b.requestId))throw A.fail(400,'Identificador del alta inválido');
 const data={company:c.slug,name:text(b.name,'Nombre',200,true),area:text(b.area,'Área',120,true),role:text(b.role,'Cargo',120),email:U.email(b.email),vehicleId:text(b.vehicleId,'Vehículo',80),type:text(b.type,'Tipo de vehículo',120,!b.vehicleId),brand:text(b.brand,'Marca',120),plate:text(b.plate,'Placa',40)};
 if(!auth.admin&&!M.allowed(auth,c.slug,data.area))throw A.fail(403,'Solo podés registrar colaboradores de tu área');
 const ledger=(await C.sb(C.tablePath('km_employee_registrations',new URLSearchParams({select:'actor_id,payload',request_id:'eq.'+b.requestId,limit:'1'}))))?.[0];if(ledger&&(ledger.actor_id!==auth.user.id||!require('node:util').isDeepStrictEqual(ledger.payload,data)))throw A.fail(409,'El alta ya se utilizó con otros datos');
 if(data.vehicleId){const v=(await C.sb(C.tablePath(c.vehicles,new URLSearchParams({select:'id,employee_id,active',id:'eq.'+data.vehicleId,limit:'1'}))))?.[0];if(!v||v.active===false||v.employee_id&&!ledger)throw A.fail(409,'Ese vehículo no está disponible para asociarlo');}
 const account=await U.account(data.email,{actorId:auth.user.id,requestId:b.requestId});
 try{const result=await C.sb('/rest/v1/rpc/km_register_employee',{method:'POST',headers:U.write,body:JSON.stringify({p_request_id:b.requestId,p_actor_id:auth.user.id,p_user_id:account.user.id,p_data:data})});return C.send(res,201,{...result,email:data.email,password:account.password});}
 catch(e){if(/23505|duplicate|placa.*registrada|vehículo.*disponible/i.test(e.message))throw A.fail(409,'La placa o el vehículo ya están registrados. Revisá los datos.');throw e;}
 }catch(e){return C.send(res,e.status||503,{error:e.status?e.message:'No fue posible completar el alta. Conservá los datos y volvé a intentarlo.'});}};
