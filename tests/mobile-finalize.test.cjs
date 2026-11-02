const {test,after}=require('node:test');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../api/_config'),gps=require('../lib/traccar-gps');
const saved={sb:C.sb,report:gps.report};
Object.assign(process.env,{SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEY:'test'});
const token='f'.repeat(64),hash=crypto.createHash('sha256').update(token).digest('hex');
const device={id:'11111111-1111-4111-8111-111111111111',company:'blokon',employee_id:'e',vehicle_id:'v',active:true,token_hash:hash,traccar_unique_id:'bkm-test-device'};
const entry={id:'22222222-2222-4222-8222-222222222222',employee_id:'e',vehicle_id:'v',km_travel:10,km_traccar:null};
const meta={id:entry.id,device_id:device.id};
let patch=null,metaPatch=null,concurrent=null,patchWhere=null,serverPending=0;
C.sb=async(path,options={})=>{
 const u=new URL(path,'http://test'),table=u.pathname.split('/').at(-1);
 if(table==='km_mobile_devices')return [device];
 if(table==='km_mobile_trips'){if(options.method==='PATCH')metaPatch=JSON.parse(options.body);return [meta];}
 if(table==='km_traccar_relay_jobs')return Array.from({length:serverPending},(_,i)=>({id:String(i).padStart(64,'0')}));
 if(table==='bitacora_blokon'){
  if(options.method==='PATCH'){patch=JSON.parse(options.body);patchWhere=u.searchParams;return concurrent?[]:[{...entry,...patch}];}
  if(concurrent)return [{...entry,km_traccar:concurrent,difference_km:concurrent-entry.km_travel}];
  return [entry];
 }
 throw Error('Unexpected table '+table);
};
gps.report=async()=>({distance_km:12.5,status:'gps_registrado'});
async function call(){
 let status,data;
 await require('../lib/mobile-api').handler({
  method:'POST',url:'/api/traccar?action=mobile-finalize',headers:{'x-device-token':token},body:{id:entry.id}
 },{setHeader(){},set statusCode(s){status=s},end(raw){data=JSON.parse(raw)}});
 return {status,data};
}
test('Mobile finalize freezes GPS only after the management record exists',async()=>{
 const r=await call();assert.equal(r.status,200);assert.equal(r.data.gpsFinalized,true);assert.equal(r.data.km,12.5);
 assert.deepEqual(patch,{km_traccar:12.5,difference_km:2.5});
 assert.deepEqual(metaPatch,{gps_flushed:true});assert.equal(patchWhere.get('km_traccar'),'is.null');
});
test('Mobile finalize waits until the durable server GPS queue is empty',async()=>{
 serverPending=3;patch=null;metaPatch=null;
 const r=await call();assert.equal(r.status,200);assert.equal(r.data.gpsFinalized,false);assert.equal(r.data.status,'gps_sincronizando');assert.equal(r.data.pendingGpsServer,3);
 assert.equal(metaPatch,null);assert.equal(patch,null);serverPending=0;
});
test('A mobile finalization preserves a simultaneous audit or web finalization',async()=>{
 gps.report=async()=>{concurrent=11.2;return {distance_km:12.5,status:'gps_registrado'}};
 const r=await call();assert.equal(r.status,200);assert.equal(r.data.km,11.2);assert.equal(r.data.item.km_traccar,11.2);assert.equal(patchWhere.get('km_traccar'),'is.null');concurrent=null;
});
after(()=>{C.sb=saved.sb;gps.report=saved.report;});
