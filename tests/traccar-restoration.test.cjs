const {test, after}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../api/_config'),A=require('../lib/auth');
const saved={sb:C.sb,assignments:A.assignments,fetch:global.fetch};
const id='11111111-1111-4111-8111-111111111111';
const entry={id,date:'2026-09-20',time_start:'23:50:00',time_end:'00:10:00',vehicle_id:'v',employee_id:'e',km_travel:4};
let mobile=true,available=true,pointCount=121,seen=[],patch=null,patchQuery=null,tripSynced=null,gpsFlushed=null;
Object.assign(process.env,{BITACORA_GPS_PROVIDER:'traccar',SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEY:'test',TRACCAR_BASE_URL:'https://traccar.invalid',TRACCAR_INGEST_URL:'https://traccar.invalid/ingest',TRACCAR_USER:'test',TRACCAR_PASSWORD:'test'});
C.sb=async(path,options={})=>{
 if(path.includes('/bitacora_blokon')){if(options.method==='PATCH'){patch=JSON.parse(options.body);patchQuery=new URL(path,'https://db.invalid').searchParams;return [{...entry,...patch}];}return [entry];}
 if(path.includes('/km_mobile_trips'))return mobile?[{device_id:'d',gps_flushed:gpsFlushed,synced_at:tripSynced,started_at:'2026-09-21T05:50:00Z',ended_at:'2026-09-21T06:10:00Z'}]:[];
 if(path.includes('/km_mobile_devices'))return [{id:'d',traccar_device_id:2}];
 if(path.includes('/vehicles_blokon'))return [{id:'v',traccar_device_id:2}];
 throw Error('Supabase must not calculate GPS: '+path);
};
A.assignments=async()=>[{company:'blokon',id:'e'}];
global.fetch=async(url,opts)=>{
 seen.push(String(url));assert.equal(opts.headers.Accept,'application/json');
 assert.equal(opts.headers.Authorization,'Basic '+Buffer.from('test:test').toString('base64'));
 if(!available)return new Response('{}',{status:503});
 const points=Array.from({length:121},(_,i)=>({deviceId:2,valid:true,latitude:12.13,
  longitude:-86.25+i/120*(3600/(6371008.8*Math.cos(12.13*Math.PI/180)*Math.PI/180)),accuracy:5,
  fixTime:new Date(Date.parse('2026-09-21T05:50:00Z')+i*10000).toISOString()}));
 return new Response(JSON.stringify(String(url).includes('/summary')?[{deviceId:2,distance:3600}]:points.slice(0,pointCount)));
};
async function route({admin=true,authorized=true,method='GET',force=false,automatic=false}={}){
 let status,data;const req={method,url:'/api/traccar?action='+(automatic?'compare':'route')+'&company=blokon&id='+id,headers:{},
  ...(authorized?{kmSession:{admin,user:{id:'user'},token:'session'}}:{}),body:{company:'blokon',id,...(force?{force:true}:{})}};
 await require('../api/traccar')(req,{setHeader(){},set statusCode(s){status=s},end(raw){data=JSON.parse(raw)}});
 return {status,data};
}
test('Traccar supplies route and distance; Supabase receives no GPS query',async()=>{
 const r=await route();assert.equal(r.status,200);assert.equal(r.data.gps.provider,'traccar');assert.equal(r.data.gps.distance_km,3.6);
 assert.equal(r.data.gps.duration_seconds,1200);assert.equal(r.data.gps.point_count,121);assert.equal(r.data.gps.segments.length,1);
 const p=new URL(seen[0]).searchParams;assert.equal(p.get('deviceId'),'2');assert.equal(p.get('from'),'2026-09-21T05:50:00.000Z');
});
test('Historical vehicle route preserves overnight time interval',async()=>{
 mobile=false;seen=[];const r=await route();assert.equal(r.status,200);assert.equal(r.data.gps.distance_km,3.6);
 assert.equal(new URL(seen[0]).searchParams.get('to'),'2026-09-21T06:10:00.000Z');mobile=true;
});
test('Finalized GPS distance is stable and reopening the route does not recalculate it',async()=>{
 entry.km_traccar=3.6;entry.difference_km=-0.4;seen=[];patch=null;
 const r=await route({method:'POST'});assert.equal(r.status,200);assert.equal(r.data.traccar.km,3.6);assert.equal(r.data.traccar.finalized,true);
 assert.equal(seen.length,0);assert.equal(patch,null);
 delete entry.km_traccar;delete entry.difference_km;
});
test('Auditor can explicitly force recalculation of a frozen GPS value',async()=>{
 entry.km_traccar=1.13;entry.difference_km=1.13;patch=null;seen=[];
 const r=await route({method:'POST',force:true});assert.equal(r.status,200);assert.equal(r.data.traccar.km,3.6);assert.deepEqual(patch,{km_traccar:3.6,difference_km:-0.4});
 delete entry.km_traccar;delete entry.difference_km;
});
test('Missing GPS points never overwrite saved distance with zero',async()=>{
 pointCount=0;patch=null;const r=await route({method:'POST'});assert.equal(r.status,200);assert.equal(r.data.gps.distance_km,null);assert.equal(patch,null);pointCount=121;
});
test('Auditor updates GPS versus odometer from filtered Traccar positions',async()=>{
 patch=null;const r=await route({method:'POST'});assert.equal(r.status,200);assert.deepEqual(patch,{km_traccar:3.6,difference_km:-0.4});
});
test('Anonymous and unauthorized users cannot request Traccar locations',async()=>{
 seen=[];assert.equal((await route({authorized:false})).status,401);assert.equal(seen.length,0);
 A.assignments=async()=>[{company:'blokon',id:'other'}];assert.equal((await route({admin:false})).status,403);assert.equal(seen.length,0);
 A.assignments=async()=>[{company:'blokon',id:'e'}];assert.equal((await route({admin:false})).status,403); // Solo jefes o Auditoría pueden abrir el mapa.
 assert.equal((await route({admin:false,method:'POST'})).status,403);
});
test('Traccar outage is reported without modifying existing distances',async()=>{
 available=false;patch=null;assert.equal((await route({method:'POST'})).status,503);assert.equal(patch,null);available=true;
});

test('Adaptive GPS recovery keeps coherent movement with degraded accuracy',()=>{
 const {calculateRouteDistance}=require('../lib/traccar-gps');
 const base=Date.parse('2026-10-03T12:00:00Z');
 const points=Array.from({length:12},(_,i)=>({deviceId:2,valid:true,latitude:12.13,longitude:-86.25+i*0.001,accuracy:80,fixTime:new Date(base+i*10000).toISOString()}));
 const strict=calculateRouteDistance(points);
 const recovered=calculateRouteDistance(points,{maxAccuracyM:200,noiseScale:0.5,noiseCapM:100});
 assert.equal(strict.accepted,0);
 assert.equal(recovered.accepted,12);
 assert.ok(recovered.meters>1000&&recovered.meters<1400);
});
test('Automatic comparison accepts only the owner and never changes a finalized GPS value',async()=>{
 entry.km_traccar=3.6;entry.difference_km=-.4;seen=[];patch=null;
 const stable=await route({admin:false,method:'POST',automatic:true,force:true});assert.equal(stable.status,200);assert.equal(seen.length,0);assert.equal(patch,null);
 delete entry.km_traccar;delete entry.difference_km;
 const own=await route({admin:false,method:'POST',automatic:true});assert.equal(own.status,200);assert.deepEqual(patch,{km_traccar:3.6,difference_km:-.4});assert.equal(own.data.entry.km_traccar,3.6);assert.equal(patchQuery.get('km_traccar'),'is.null');
 A.assignments=async()=>[{company:'blokon',id:'other'}];seen=[];patch=null;
 assert.equal((await route({admin:false,method:'POST',automatic:true})).status,403);assert.equal(seen.length,0);assert.equal(patch,null);
 A.assignments=async()=>[{company:'blokon',id:'e'}];
});
test('Automatic comparison waits for a newly synced trip instead of freezing a partial upload',async()=>{
 tripSynced=new Date().toISOString();patch=null;seen=[];
 const result=await route({admin:false,method:'POST',automatic:true});assert.equal(result.status,200);assert.equal(result.data.pending,true);assert.equal(patch,null);assert.equal(seen.length,0);tripSynced=null;
});
after(()=>{C.sb=saved.sb;A.assignments=saved.assignments;global.fetch=saved.fetch;});
test('A GPS queue explicitly pending is never frozen after the settling timer expires',async()=>{
 gpsFlushed=false;tripSynced='2026-09-21T06:10:00Z';patch=null;seen=[];
 const r=await route({admin:false,method:'POST',automatic:true});assert.equal(r.data.pending,true);assert.equal(patch,null);assert.equal(seen.length,0);
 gpsFlushed=true;tripSynced=new Date().toISOString();
 const complete=await route({admin:false,method:'POST',automatic:true});assert.equal(complete.data.entry.km_traccar,3.6);assert.deepEqual(patch,{km_traccar:3.6,difference_km:-.4});
 gpsFlushed=null;tripSynced=null;
});
