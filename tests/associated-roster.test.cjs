const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../api/_config'),seed=require('../api/_seed'),roster=require('../supabase/associated-vehicles.json');
test('Reviewed 19-person roster has one vehicle each, existing plates preserved, four pending',()=>{
 assert.equal(roster.length,19);assert.equal(new Set(roster.map(x=>x.employee_id)).size,19);
 assert.deepEqual(Object.fromEntries(['blokon','conaser','security','newcentury'].map(c=>[c,roster.filter(x=>x.company===c).length])),{blokon:4,conaser:6,security:8,newcentury:1});
 assert.equal(seed.vehicles.filter(v=>v.plate===null).length,4);
 for(const a of roster){const e=seed.employees.find(e=>e.id===a.employee_id),v=seed.vehicles.find(v=>v.id===a.vehicle_id);assert.ok(e);assert.equal(v.employee_id,e.id);assert.equal(v.company,C.COMPANY[a.company].name);}
 assert.equal(seed.vehicles.find(v=>v.employee_id==='BLO-036').plate,'M 010311');
 assert.equal(seed.vehicles.find(v=>v.employee_id==='BLO-065').plate,'02-28947-E');
});
test('Android: all 19 collaborator selections automatically show associated vehicle and its plate',()=>{
 const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',options:[],innerHTML:'',classList:{},addEventListener(){},querySelectorAll:()=>[]});return nodes.get(id)},querySelectorAll:()=>[],addEventListener(){}},window={addEventListener(){}};
 const profiles=roster.map(a=>({id:a.employee_id,company:a.company,vehicles:seed.vehicles.filter(v=>v.company===C.COMPANY[a.company].name)}));
 const source=fs.readFileSync('android/app/src/main/assets/mobile.js','utf8').replace('refresh(true);setInterval','window.checkVehicles=auth=>{authCache=auth;stateCache={configured:false};updateSwitchVehicles();};refresh(true);setInterval');
 vm.runInNewContext(source,{document,window,setInterval(){},console});
 for(const [i,a] of roster.entries()){const $=id=>document.getElementById(id);$('switchProfile').value=String(i);window.checkVehicles({profiles});assert.equal($('switchVehicle').value,a.vehicle_id);const v=seed.vehicles.find(v=>v.id===a.vehicle_id);assert.ok($('switchVehicleAuto').value.includes(v.plate||'Placa pendiente'));assert.ok($('switchVehicleAuto').value.includes(v.brand||v.type));}
});
