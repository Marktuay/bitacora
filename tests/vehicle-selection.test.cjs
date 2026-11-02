const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function dom(){const nodes=new Map();return {getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',placeholder:'',hidden:true,options:[],classList:{contains:()=>false},querySelectorAll:()=>[],scrollIntoView(){},addEventListener(type,fn){this[type]=fn}});return nodes.get(id)},querySelectorAll:()=>[],addEventListener(){}};}
const vehicles=[{id:'toyota',plate:'TOYOTA',employee_id:null},{id:'moto',plate:'MOTO',employee_id:'eduardo'},{id:'other',plate:'OTHER',employee_id:'otro'}];
test('Web: employee selection fills assigned vehicle and clears previous odometer hints',async()=>{
 const document=dom(),requests=[],waiting=[];
 const window={BITACORA:{companyFromLocation:()=> 'blokon',companies:{blokon:{name:'BLOKON',short:'BLOKON'}},escape:x=>x||'',toast(){},api:async path=>{requests.push(path);if(path.startsWith('/api/catalog'))return {employees:[{id:'eduardo'},{id:'sin-asignacion'}],vehicles};return new Promise(resolve=>waiting.push(resolve));}}};
 vm.runInNewContext(fs.readFileSync('assets/form.js','utf8'),{window,document,KMAuth:{require:async()=>{}},location:{},URLSearchParams,console});
 await new Promise(setImmediate);
 const $=id=>document.getElementById(id);$('employee').value='eduardo';$('employee').change();
 assert.equal($('vehicle').value,'moto');assert.ok($('vehicleAuto').value.includes('MOTO'));assert.ok(!$('employee').innerHTML.includes('sin-asignacion'));assert.ok(requests.at(-1).includes('vehicleId=moto'));
 $('odoHint').textContent='Kilometraje anterior';$('kmInitial').placeholder='100';$('employee').value='sin-asignacion';$('employee').change();
 assert.equal($('vehicle').value,'');assert.equal($('odoHint').textContent,'');assert.equal($('kmInitial').placeholder,'');assert.match($('vehicleHint').textContent,/necesita.*vehículo/);
 waiting[0]({item:{km_final:999,date:'2026-09-23'}});await new Promise(setImmediate);assert.equal($('odoHint').textContent,'');
 $('employee').value='';$('employee').change();assert.ok(!$('vehicle').innerHTML.includes('TOYOTA'));
});
test('Android: assigned vehicle takes priority over old Toyota; unassigned employee cannot choose another vehicle',()=>{
 const document=dom(),window={addEventListener(){}};
 const source=fs.readFileSync('android/app/src/main/assets/mobile.js','utf8').replace('refresh(true);setInterval', 'window.checkVehicles=(auth,state)=>{authCache=auth;stateCache=state;updateSwitchVehicles();};refresh(true);setInterval');
 vm.runInNewContext(source,{window,document,setInterval(){},clearTimeout(){},setTimeout(){},console});
 const $=id=>document.getElementById(id),profiles=[{id:'eduardo',company:'blokon',vehicles:vehicles.slice(0,2)},{id:'sin-asignacion',company:'blokon',vehicles:vehicles.slice(0,1)},{id:'varios',company:'blokon',vehicles:[{id:'a',employee_id:'varios'},{id:'b',employee_id:'varios'}]}];
 $('switchProfile').value='0';window.checkVehicles({profiles},{configured:true,profile:{company:'blokon',employee:{id:'eduardo'},vehicle:{id:'toyota'}}});assert.equal($('switchVehicle').value,'moto');
 $('switchProfile').value='1';window.checkVehicles({profiles},{configured:false});assert.equal($('switchVehicle').value,'');assert.match($('switchVehicleHint').textContent,/necesita.*vehículo/);
 $('switchProfile').value='2';window.checkVehicles({profiles},{configured:false});assert.equal($('switchVehicle').value,'');assert.match($('switchVehicleHint').textContent,/definir un único vehículo/);
});
test('Android: current vehicle is read-only and collaborator confirmation uses its association',async()=>{
 const document=dom(),$=id=>document.getElementById(id),window={addEventListener(){}},requests=[];
 document.body={querySelectorAll:()=>[]};
 const current={...vehicles[0],type:'Carro',brand:'Toyota'},motorcycle={...vehicles[1],type:'Moto',brand:'AKT Hunter'};
 const state={configured:true,baseUrl:'https://bitacora-km.vercel.app',profile:{company:'blokon',employee:{id:'eduardo',name:'Eduardo'},vehicle:current,areas:[],gpsReady:true},active:null,trips:[],pendingTrips:0,pendingGps:0};
 const auth={admin:true,profiles:[{company:'blokon',id:'eduardo',name:'Eduardo',vehicles:[current,motorcycle]}]};
 const NativeKM={postMessage(raw){const r=JSON.parse(raw);requests.push(r);let data={};if(r.action==='state')data=state;if(r.action==='auth')data=auth;if(r.action==='switch'){assert.equal(r.body.employeeId,'eduardo');assert.equal(r.body.vehicleId,'moto');state.profile.vehicle=motorcycle;}queueMicrotask(()=>NativeKM.onmessage({data:JSON.stringify({id:r.id,ok:true,data})}));}};
 window.NativeKM=NativeKM;vm.runInNewContext(fs.readFileSync('android/app/src/main/assets/mobile.js','utf8').replace('refresh(true);setInterval','window.refreshTest=refresh;refresh(true);setInterval'),{window,NativeKM,document,setInterval(){},setTimeout,clearTimeout,console});
 await new Promise(setImmediate);assert.equal($('vehicle').value,'toyota');assert.equal($('vehicleAuto').value,'Carro · Toyota · TOYOTA');assert.equal($('vehicle').onchange,undefined);
 assert.equal($('auditBtn').hidden,false);auth.admin=false;await window.refreshTest(true);assert.equal($('auditBtn').hidden,true);auth.admin=true;await window.refreshTest(true);
 $('changeUserBtn').onclick();assert.equal($('switchVehicle').value,'moto');assert.equal($('switchVehicleAuto').value,'Moto · AKT Hunter · MOTO');
 // A stale or modified hidden value must not replace the associated vehicle.
 $('switchVehicle').value='toyota';$('switchForm').onsubmit({preventDefault(){},target:{querySelectorAll:()=>[]}});await new Promise(setImmediate);
 assert.equal($('vehicle').value,'moto');assert.equal($('brand').value,'AKT Hunter');assert.equal($('vehicleType').value,'Moto');
 state.active={id:'active',phase:'recording',fields:{origin:'A',destination:'B'},startedAt:new Date().toISOString()};await window.refreshTest();
 $('switchForm').onsubmit({preventDefault(){},target:{querySelectorAll:()=>[]}});await new Promise(setImmediate);assert.equal(requests.filter(r=>r.action==='switch').length,1);assert.match($('message').textContent,/Finalizá el recorrido activo/);
});
test('APK and web contain no manual vehicle selectors',()=>{
 for(const f of ['android/app/src/main/assets/mobile.html','form.html','android.html']){const html=fs.readFileSync(f,'utf8');assert.doesNotMatch(html,/<select[^>]+id="(?:vehicle|switchVehicle)"/);assert.match(html,/<input[^>]+id="vehicleAuto"[^>]+readonly/);}
 assert.doesNotMatch(fs.readFileSync('android/app/src/main/assets/mobile.js','utf8'),/Elegí uno disponible|Seleccioná un vehículo/);
});
