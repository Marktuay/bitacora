const {test}=require('node:test'),assert=require('node:assert/strict');
const {localEndpoint,continuousChunks,estimateRoads}=require('../lib/road-match');
const start=Date.parse('2026-10-03T12:00:00Z');
const points=(count=8)=>Array.from({length:count},(_,i)=>({deviceId:2,valid:true,latitude:12,
 longitude:-86+i*.0003,accuracy:5,fixTime:new Date(start+i*10000).toISOString()}));
function responseFor(url,change={}){
 const u=new URL(url),coords=u.pathname.split('/').at(-1).split(';').map(p=>p.split(',').map(Number));
 const distance=(coords.length-1)*33;
 return new Response(JSON.stringify({code:'Ok',tracepoints:coords.map(location=>({location,matchings_index:0})),
  matchings:[{distance,confidence:.95,geometry:{type:'LineString',coordinates:coords},...change}]}));
}
test('Coordinates can only be sent to a literal loopback OSRM address',async()=>{
 assert.equal(localEndpoint('http://127.0.0.1:5000'),'http://127.0.0.1:5000');
 assert.equal(localEndpoint('http://[::1]:5000'),'http://[::1]:5000');
 for(const url of ['https://router.project-osrm.org','http://192.168.1.20:5000','http://localhost:5000',
  'http://127.0.0.1:5000?target=external','http://user:secret@127.0.0.1:5000','file:///tmp/map'])
  assert.throws(()=>localEndpoint(url));
 let calls=0;const disabled=await estimateRoads(points(),{fetcher:async()=>calls++});
 assert.equal(disabled.status,'disabled');assert.equal(disabled.distance_km,null);assert.equal(calls,0);
});
test('Continuous matching returns a separate estimate and sends no private authentication',async()=>{
 const raw=points(),before=JSON.stringify(raw);
 const estimate=await estimateRoads(raw,{endpoint:'http://127.0.0.1:5000',fetcher:async(url,options)=>{
  const u=new URL(url);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.searchParams.get('timestamps').split(';').length,8);
  assert.equal(u.searchParams.get('gaps'),'split');assert.equal(options.redirect,'error');
  assert.deepEqual(options.headers,{Accept:'application/json'});return responseFor(url);
 }});
 assert.equal(estimate.distance_km,.231);assert.equal(estimate.estimated,true);assert.equal(estimate.partial,false);
 assert.equal(estimate.matched_points,8);assert.equal(estimate.status,'matched');assert.equal(JSON.stringify(raw),before);
});
test('Missing signal and imprecise readings split the route before any road request',async()=>{
 const raw=points(8);for(let i=4;i<8;i++)raw[i].fixTime=new Date(start+200000+(i-4)*10000).toISOString();
 const calls=[];const result=await estimateRoads(raw,{endpoint:'http://127.0.0.1:5000',fetcher:async(url)=>{calls.push(url);return responseFor(url);}});
 assert.equal(calls.length,2);assert.equal(result.distance_km,.198);assert.equal(result.partial,true);
 assert.equal(result.gaps_excluded,1);
 const poor=points(9);poor[4].accuracy=150;
 const groups=continuousChunks(poor).chunks;assert.deepEqual(groups.map(g=>g.length),[4,4]);
 assert.equal(groups[0].at(-1).time<groups[1][0].time,true);
});
test('Overlapping chunks never count a boundary link twice, including a two-point tail',async()=>{
 for(const n of [20,21,22,39,40,41,100,101,102,199,200,201]){
  const chunks=continuousChunks(points(n)).chunks;assert.ok(chunks.every(c=>c.length>=3&&c.length<=20));
  const links=chunks.flatMap(c=>c.slice(1).map((p,i)=>`${c[i].time}:${p.time}`));
  assert.equal(links.length,n-1);assert.equal(new Set(links).size,n-1);
  const result=await estimateRoads(points(n),{endpoint:'http://127.0.0.1:5000',fetcher:async url=>responseFor(url)});
  assert.equal(result.distance_km,Number(((n-1)*33/1000).toFixed(3)));assert.equal(result.partial,false);
 }
});
test('A weak starting segment does not erase later strong street matches or inflate a complete route',async()=>{
 const fixes=points(61);let calls=0;
 const result=await estimateRoads(fixes,{endpoint:'http://127.0.0.1:5000',fetcher:async url=>{
  const data=await responseFor(url).json();
  if(calls++===0)data.matchings[0].confidence=0;
  return new Response(JSON.stringify(data));
 }});
 assert.equal(calls,4);
 assert.equal(result.rejected_chunks,1);
 assert.equal(result.matched_chunks,3);
 assert.equal(result.partial,true);
 assert.equal(result.status,'partial');
 assert.equal(result.matched_points,42);
 assert.equal(result.distance_km,Number(((61-20)*33/1000).toFixed(3)));
 // A partial road estimate must remain advisory, never a full validated measurement.
 assert.ok(result.distance_km<Number(((61-1)*33/1000).toFixed(3)));
});
test('Uncertain, excessively displaced and implausible road estimates are excluded',async()=>{
 for(const change of [{confidence:.4},{distance:5000},{distance:0}]){
  const result=await estimateRoads(points(),{endpoint:'http://127.0.0.1:5000',fetcher:async url=>responseFor(url,change)});
  assert.equal(result.distance_km,null);assert.equal(result.rejected_chunks,1);
 }
 for(const mutate of [data=>data.tracepoints[3]=null,data=>data.tracepoints[3].location=[-85,12]]){
  const result=await estimateRoads(points(),{endpoint:'http://127.0.0.1:5000',fetcher:async url=>{
   const data=await responseFor(url).json();mutate(data);return new Response(JSON.stringify(data));
  }});assert.equal(result.distance_km,null);
 }
});
test('A local service failure returns a fallback without pretending the GPS was adjusted',async()=>{
 const result=await estimateRoads(points(),{endpoint:'http://127.0.0.1:5000',fetcher:async()=>{throw Error('offline');}});
 assert.equal(result.status,'unavailable');assert.equal(result.distance_km,null);assert.deepEqual(result.segments,[]);
});
test('Relay keeps the legacy route shape when disabled and keeps GPS available if OSRM fails',async()=>{
 const {createWorker}=require('../deployment/traccar-relay-worker.cjs'),raw=points();
 const settings={SUPABASE_URL:'https://queue.invalid',SUPABASE_SECRET_KEY:'key',TRACCAR_USER:'user',TRACCAR_PASSWORD:'secret'};
 const job={operation:'route',payload:{deviceId:2,from:new Date(start).toISOString(),to:new Date(start+100000).toISOString()}};
 const fetcher=async url=>{if(String(url).startsWith('http://127.0.0.1:5000'))throw Error('offline');return new Response(JSON.stringify(raw));};
 assert.deepEqual(await createWorker(settings,{fetcher}).execute(job),raw);
 const enabled=await createWorker({...settings,OSRM_URL:'http://127.0.0.1:5000'},{fetcher}).execute(job);
 assert.deepEqual(enabled.positions,raw);assert.equal(enabled.road_match.status,'unavailable');
});
