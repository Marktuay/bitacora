const {test,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../api/_config'),A=require('../lib/auth'),saved={sb:C.sb,allRows:C.allRows,assignments:A.assignments};
Object.assign(process.env,{SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEY:'test'});
const token='b'.repeat(64),devices=[];
const employees=[{id:'e',name:'Sin vehículo asociado',active:true},{id:'other',name:'Con moto',active:true}];
const vehicles=[{id:'toyota',plate:'TOYOTA',employee_id:null,active:true},{id:'moto',plate:'MOTO',employee_id:'other',active:true}];
C.allRows=async table=>table==='employees_blokon'?employees:table==='vehicles_blokon'?vehicles:[];
C.sb=async(path,o={})=>{const u=new URL(path,'http://test'),table=u.pathname.split('/').at(-1);
 if(table==='km_mobile_devices'){
  if(o.method==='POST'){const row={...JSON.parse(o.body),active:true};devices.push(row);return [row];}
  const rows=devices.filter(d=>(!u.searchParams.has('token_hash')||u.searchParams.get('token_hash')==='eq.'+d.token_hash)&&(!u.searchParams.has('id')||u.searchParams.get('id')==='eq.'+d.id));
  if(o.method==='PATCH')rows.forEach(d=>Object.assign(d,JSON.parse(o.body)));return rows;
 }
 const rows=table==='employees_blokon'?employees:table==='vehicles_blokon'?vehicles:[];return rows.filter(r=>!u.searchParams.has('id')||u.searchParams.get('id')==='eq.'+r.id);
};
A.assignments=async()=>[{company:'blokon',id:'e'}];
const admin={admin:true,user:{id:'admin'},token:'session'},individual={admin:false,user:{id:'user'},token:'session'};
async function call(action,auth,body={},method='GET',deviceToken){let status,data;await require('../lib/mobile-api').handler({method,url:'/api/traccar?action=mobile-'+action,kmSession:auth,body,headers:deviceToken?{'x-device-token':deviceToken}:{}},{setHeader(){},set statusCode(s){status=s},end(raw){data=JSON.parse(raw)}});return {status,data};}
test('Mobile selector lists only employees with one associated vehicle, without company-wide choices',async()=>{
 const audit=await call('session',admin);assert.equal(audit.status,200);assert.equal(audit.data.profiles.length,1);const p=audit.data.profiles[0];assert.equal(p.id,'other');assert.deepEqual(p.vehicles.map(v=>v.id),['moto']);assert.equal(p.company,'blokon');
 const own=await call('session',individual);assert.equal(own.status,200);assert.equal(own.data.profiles[0].vehicles.length,0);assert.equal(own.data.profiles[0].id,'e');
});
test('Administrator can authorize another company vehicle without changing its regular association',async()=>{
 const body={company:'blokon',employeeId:'e',vehicleId:'moto',deviceToken:token};
 assert.equal((await call('enroll',individual,body,'POST')).status,400);assert.equal(devices.length,0);
 const enrolled=await call('enroll',admin,body,'POST');assert.equal(enrolled.status,201);assert.equal(enrolled.data.profile.vehicle.id,'moto');assert.equal(vehicles[1].employee_id,'other');
 const switched=await call('session',admin,{company:'blokon',employeeId:'e',vehicleId:'toyota'},'POST',token);assert.equal(switched.status,200);assert.equal(switched.data.profile.vehicle.id,'toyota');
 assert.equal((await call('session',individual,{company:'blokon',employeeId:'e',vehicleId:'moto'},'POST',token)).status,400);
 const back=await call('session',admin,{company:'blokon',employeeId:'e',vehicleId:'moto'},'POST',token);assert.equal(back.status,200);assert.equal(back.data.profile.vehicle.id,'moto');
 assert.equal((await call('session',admin,{company:'conaser',employeeId:'e',vehicleId:'moto'},'POST',token)).status,400);
 assert.equal(vehicles[1].employee_id,'other');assert.equal(devices.length,1);
});
after(()=>{C.sb=saved.sb;C.allRows=saved.allRows;A.assignments=saved.assignments;});
