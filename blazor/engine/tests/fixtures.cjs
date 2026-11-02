const crypto=require('node:crypto'),bcrypt=require('bcryptjs'),fs=require('node:fs');
const ids={admin:'10000000-0000-4000-8000-000000000001',manager:'10000000-0000-4000-8000-000000000002',employee:'10000000-0000-4000-8000-000000000003',other:'10000000-0000-4000-8000-000000000004'};
const password='Prueba-Migracion-2026!';
async function seed(db){
 await db.raw.exec(fs.readFileSync(require('node:path').join(__dirname,'../schema.sql'),'utf8'));
 const encrypted=await bcrypt.hash(password,10);
 for(const [key,email,meta,name]of [
  ['admin','auditor-general@newcenturyni.com',{bitacora_role:'admin'},'Auditor de Prueba'],
  ['manager','jefe@example.invalid',{bitacora_role:'manager',bitacora_managed_companies:['blokon'],bitacora_managed_areas:['OPERACIONES'],bitacora_manager_name:'Jefe de Prueba'},'Jefe de Prueba'],
  ['employee','colaborador@example.invalid',{},'Colaborador de Prueba'],
  ['other','otro@example.invalid',{},'Otra Persona']
 ])await db.query('INSERT INTO auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) VALUES($1,$2,$3,$4,$5)',[ids[key],email,encrypted,JSON.stringify(meta),JSON.stringify({full_name:name})]);
 for(const c of ['blokon','conaser','security','newcentury']){
  await db.query(`INSERT INTO public.employees_${c}(id,name,area,role) VALUES($1,$2,$3,$4)`,['e-'+c,'COLABORADOR PRUEBA '+c.toUpperCase(),'OPERACIONES','Supervisor']);
  await db.query(`INSERT INTO public.vehicles_${c}(id,type,brand,plate,employee_id) VALUES($1,$2,$3,$4,$5)`,['v-'+c,'Motocicleta','Marca de Prueba','TEST-'+c,'e-'+c]);
 }
 await db.query("INSERT INTO public.employees_blokon(id,name,area,role) VALUES('e-hidden','OTRA AREA','CONTABILIDAD','Contador')");
 await db.query("INSERT INTO public.vehicles_blokon(id,type,plate,employee_id) VALUES('v-hidden','Vehículo','HIDDEN-TEST','e-hidden')");
 await db.query("INSERT INTO public.km_report_access(user_id,company,employee_id) VALUES($1,'blokon','e-blokon'),($2,'blokon','e-hidden')",[ids.employee,ids.other]);
}
module.exports={seed,ids,password};
