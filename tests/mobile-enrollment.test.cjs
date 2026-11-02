const {test,after}=require('node:test');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../api/_config'),A=require('../lib/auth');
const saved={sb:C.sb,allRows:C.allRows,assignments:A.assignments};
Object.assign(process.env,{SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEY:'test'});
const devices=[],token='a'.repeat(64),hash=crypto.createHash('sha256').update(token).digest('hex');
let inserts=0;
C.sb=async(path,options={})=>{
 const u=new URL(path,'http://test'),table=u.pathname.split('/').at(-1);
 if(table==='km_mobile_devices'){
  if(options.method==='POST'){const d={...JSON.parse(options.body),active:true};devices.push(d);inserts++;return [d];}
  return devices.filter(d=>(!u.searchParams.has('token_hash')||u.searchParams.get('token_hash')==='eq.'+d.token_hash)&&(!u.searchParams.has('active')||u.searchParams.get('active')==='eq.'+d.active));
 }
 if(table==='employees_blokon')return [{id:'e',name:'Persona de prueba',active:true}];
 if(table==='vehicles_blokon')return [{id:'v',plate:'TEST',employee_id:'e',active:true}];
 throw Error('Unexpected table '+table);
};
C.allRows=async table=>C.sb('/rest/v1/'+table);
A.assignments=async()=>[{company:'blokon',id:'e'}];
async function call(action,body={},auth={admin:false,user:{id:'user'},token:'session'},method='POST'){
 let status,data;await require('../lib/mobile-api').handler({method,url:'/api/traccar?action=mobile-'+action,headers:{},body,
  ...(auth?{kmSession:auth}:{})},{setHeader(){},set statusCode(s){status=s},end(raw){data=JSON.parse(raw)}});return {status,data};
}
const fields={company:'blokon',employeeId:'e',vehicleId:'v',deviceToken:token};
test('First login lists assignments before phone enrollment',async()=>{
 const r=await call('session',{},undefined,'GET');assert.equal(r.status,200);assert.equal(r.data.current,null);assert.equal(r.data.profiles[0].id,'e');
});
test('Enrollment requires session and authorized employee',async()=>{
 assert.equal((await call('enroll',fields,null)).status,401);assert.equal(inserts,0);
 A.assignments=async()=>[{company:'blokon',id:'other'}];assert.equal((await call('enroll',fields)).status,403);assert.equal(inserts,0);
 A.assignments=async()=>[{company:'blokon',id:'e'}];
});
test('Phone enrollment needs no activation code and retries without duplicating',async()=>{
 const r=await call('enroll',fields);assert.equal(r.status,201);assert.equal(r.data.profile.employee.id,'e');assert.equal(devices[0].token_hash,hash);
 assert.equal(JSON.stringify(r.data).includes(token),false);assert.equal((await call('enroll',fields)).status,200);assert.equal(inserts,1);
});
test('Dispositivo revocado no puede ser reinscrito, aun con correo y clave validos',async()=>{
 devices[0].active=false;
 const result=await call('enroll',fields);
 assert.equal(result.status,403);
 assert.match(result.data.error,/revocado/);
 assert.equal(inserts,1);
 devices[0].active=true;
});
after(()=>{C.sb=saved.sb;C.allRows=saved.allRows;A.assignments=saved.assignments;});
