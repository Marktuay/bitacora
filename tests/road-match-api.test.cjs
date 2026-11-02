const {test,after}=require('node:test'),assert=require('node:assert/strict');
const C=require('../api/_config'),relay=require('../lib/traccar-relay');
const original={sb:C.sb,direct:relay.direct,call:relay.call};
const id='11111111-1111-4111-8111-111111111111',start=Date.parse('2026-10-03T12:00:00Z');
const entry={id,vehicle_id:'vehicle',employee_id:'employee',km_travel:1};let patch=null;
let advice={source:'openstreetmap-osrm',estimated:true,status:'matched',distance_km:40,segments:[],partial:false};
const raw=Array.from({length:8},(_,i)=>({deviceId:2,valid:true,latitude:12,longitude:-86+i*.0003,
 accuracy:5,fixTime:new Date(start+i*10000).toISOString()}));
C.sb=async(path,options={})=>{
 if(path.includes('/bitacora_blokon')){if(options.method==='PATCH'){patch=JSON.parse(options.body);return [{...entry,...patch}];}return [entry];}
 if(path.includes('/km_mobile_trips'))return [{device_id:'device',started_at:new Date(start).toISOString(),ended_at:new Date(start+70000).toISOString()}];
 if(path.includes('/km_mobile_devices'))return [{id:'device',traccar_device_id:2}];throw Error('Unexpected database call');
};
relay.direct=()=>false;
relay.call=async operation=>operation==='route'?{positions:raw,road_match:advice}:[];
async function request(method='GET',force=false){
 let status,body;await require('../api/traccar')({method,url:'/api/traccar?action=route&company=blokon&id='+id,
  kmSession:{admin:true,user:{id:'admin'},token:'test'},headers:{},body:{company:'blokon',id,force}},
  {setHeader(){},set statusCode(value){status=value;},end(value){body=JSON.parse(value);}});return {status,body};
}
test('Road estimate appears separately on the route and does not save on map opening',async()=>{
 patch=null;const result=await request();assert.equal(result.status,200);assert.equal(result.body.gps.road_match.distance_km,40);
 assert.ok(result.body.gps.distance_km<.3);assert.equal(patch,null);
});
test('Even explicit GPS recalculation saves measured GPS, never the road estimate',async()=>{
 patch=null;const result=await request('POST',true);assert.equal(result.status,200);
 assert.equal(patch.km_traccar,result.body.gps.distance_km);assert.ok(patch.km_traccar<.3);
 assert.equal(Object.hasOwn(patch,'road_match'),false);
});
test('Even a complete confident street match stays advisory for all employees',async()=>{
 advice={...advice,distance_km:.24,confidence_min:.95,use_for_distance:true};patch=null;
 const result=await request('POST',true),g=result.body.gps;
 assert.equal(g.road_adjustment_used,false);
 assert.equal(g.distance_km,g.measured_distance_km);
 assert.ok(g.measured_distance_km<.24);
 assert.equal(g.calculation,'route_haversine_filtered_v5');
 assert.equal(patch.km_traccar,g.measured_distance_km);
 assert.equal(patch.difference_km,Number((g.measured_distance_km-1).toFixed(3)));
 assert.equal(g.segments[0].length,raw.length);
});
test('Partial, uncertain, disabled or implausible street matches always preserve the GPS measurement',async()=>{
 for(const change of [{partial:true},{confidence_min:.85},{use_for_distance:false},{status:'partial'},{distance_km:40}]){
  advice={source:'openstreetmap-osrm',estimated:true,status:'matched',distance_km:.24,segments:[],partial:false,confidence_min:.95,use_for_distance:true,...change};
  const g=(await request()).body.gps;assert.equal(g.road_adjustment_used,false);assert.equal(g.distance_km,g.measured_distance_km);
 }
});
after(()=>{C.sb=original.sb;relay.direct=original.direct;relay.call=original.call;});
