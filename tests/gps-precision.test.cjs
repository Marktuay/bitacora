const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../lib/traccar-gps'),M=require('../lib/mobile-api'),R=require('../lib/traccar-relay');
const saved={one:M.one,call:R.call,direct:R.direct};
const start=Date.parse('2026-10-03T14:00:00Z');
function points(count=61,accuracy=5){return Array.from({length:count},(_,i)=>({deviceId:6,valid:true,
  latitude:12,longitude:-86+i*.0005,accuracy,fixTime:new Date(start+i*5000).toISOString()}));}
async function report(route,summaryDistance=0,end=start+300000){
 M.one=async table=>table==='km_mobile_trips'?{device_id:'d',started_at:new Date(start).toISOString(),ended_at:new Date(end).toISOString()}:{traccar_device_id:6};
 R.direct=()=>false;
 R.call=async op=>op==='route'?route:[{deviceId:6,distance:summaryDistance}];
 return G.report({slug:'newcentury'},{id:'trip'});
}
test('Good GPS uses filtered points even when a larger raw summary is within the old envelope',async()=>{
 const route=points(),filtered=G.calculateRouteDistance(route).meters;
 const gps=await report(route,filtered*1.08);
 assert.equal(gps.distance_km,Number((filtered/1000).toFixed(3)));
 assert.ok(gps.summary_distance_km>gps.distance_km);
 assert.equal(gps.calculation,'route_haversine_filtered_v5');
 assert.equal(gps.requires_review,false);
});
test('Duplicate and delayed positions do not change distance or form zigzags',()=>{
 const route=points(),expected=G.calculateRouteDistance(route);
 const retried=[...route,...route,...route.map(p=>({...p,accuracy:90,latitude:p.latitude+.01}))].reverse();
 const actual=G.calculateRouteDistance(retried);
 assert.equal(actual.meters,expected.meters);
 assert.deepEqual(actual.segments,expected.segments);
 assert.equal(actual.duplicates,122);
});
test('Sparse disconnected fixes never manufacture a measured distance from the raw summary',async()=>{
 const route=points(2);route[1].fixTime=new Date(start+600000).toISOString();
 const gps=await report(route,14000,start+600000);
 assert.equal(gps.distance_km,null);assert.equal(gps.gaps,1);
 assert.equal(gps.status,'sin_gps_suficiente');
});
test('A vehicle at rest remains zero after GPS jitter and a distant spike',()=>{
 const route=points().map((p,i)=>({...p,longitude:-86+(i%2)*.00001}));
 route[30]={...route[30],latitude:13};
 const gps=G.calculateRouteDistance(route);
 assert.equal(gps.meters,0);assert.equal(gps.rejected,1);
});
test('Missing beginning and end of a route are reported even without an internal gap',async()=>{
 const gps=await report(points().slice(10,-10),4000);
 assert.ok(gps.start_gap_seconds>=50);assert.ok(gps.end_gap_seconds>=50);
 assert.equal(gps.requires_review,true);
});
test('Degraded accuracy recovery is retained and explicitly flagged for review',async()=>{
 const route=points(61,80),recovered=G.calculateRouteDistance(route,{maxAccuracyM:200,noiseScale:.5,noiseCapM:100});
 const gps=await report(route,recovered.meters*1.05);
 assert.equal(gps.recovery_used,true);assert.equal(gps.requires_review,true);
 assert.equal(gps.calculation,'summary_degraded_recovery_v5');
 assert.equal(gps.status,'gps_incompleto_o_por_revisar');
});
test('Another device and points outside the trip interval are excluded',async()=>{
 const clean=points(),bad=[{...clean[0],deviceId:9,latitude:13},
  {...clean[0],fixTime:new Date(start-1000).toISOString(),latitude:13}];
 const gps=await report([...clean,...bad],9000);
 assert.equal(gps.points_received,clean.length);
 assert.equal(gps.distance_km,Number((G.calculateRouteDistance(clean).meters/1000).toFixed(3)));
});
test('A long coverage gap exposes its endpoints without inventing distance',async()=>{
 const route=[...points(3),...points(3).map(p=>({...p,longitude:p.longitude+.023,fixTime:new Date(Date.parse(p.fixTime)+191000).toISOString()}))];
 const gps=await report(route,15000,start+205000);
 assert.equal(gps.incomplete,true);assert.equal(gps.gap_details.length,1);
 const gap=gps.gap_details[0];assert.equal(gap.seconds,181);
 assert.ok(gap.straight_distance_m>2000);assert.ok(gps.distance_km<.3);
 assert.equal(gps.segments.length,2);assert.deepEqual(gap.start,gps.segments[0].at(-1));assert.deepEqual(gap.end,gps.segments[1][0]);
});
test('Good coverage has no missing segment and missing beginning remains incomplete',async()=>{
 const good=await report(points(),10000);assert.equal(good.incomplete,false);assert.deepEqual(good.gap_details,[]);
 const partial=await report(points().slice(10),10000);assert.equal(partial.incomplete,true);
});
test('Recovery is local when a long precise stop hides degraded moving points',async()=>{
 const route=[...points(80).map(p=>({...p,longitude:-86})),...Array.from({length:8},(_,i)=>({deviceId:6,valid:true,latitude:12,longitude:-86+i*.003,accuracy:i===0||i===7?5:100,fixTime:new Date(start+400000+i*30000).toISOString()}))];
 const gps=await report(route,99999,start+610000);
 assert.ok(gps.strict_point_count/route.length>.6);
 assert.equal(gps.recovered_gap_count,1);assert.equal(gps.calculation,'route_local_gap_recovery_v6');
 assert.ok(gps.distance_km>2&&gps.distance_km<2.5);assert.equal(gps.incomplete,false);assert.equal(gps.requires_review,true);
 assert.notEqual(gps.distance_km,gps.summary_distance_km);
});
test('A missing interval with no intermediate fixes or erratic movement remains a gap',()=>{
 const good=points(1)[0];const end={...good,longitude:-85.976,fixTime:new Date(start+180000).toISOString()};
 const sparse=[good,end];assert.equal(G.recoverCoverageGaps(sparse,G.calculateRouteDistance(sparse)).recoveredGaps.length,0);
 const route=[good,...[-85.994,-86,-85.982,-85.988,-85.976].map((longitude,i)=>({...good,accuracy:150,longitude,fixTime:new Date(start+(i+1)*30000).toISOString()})),end];
 const actual=G.recoverCoverageGaps(route,G.calculateRouteDistance(route));assert.equal(actual.recoveredGaps.length,0);assert.equal(actual.gaps,1);assert.equal(actual.meters,0);
});
after(()=>Object.assign(M,{one:saved.one})&&Object.assign(R,{call:saved.call,direct:saved.direct}));
