const {test,after}=require('node:test'),assert=require('node:assert/strict');
const C=require('../api/_config'),original=C.sb;
const jobs=new Map();let online=false,writes=0;
C.sb=async(p,o={})=>{
 const u=new URL(p,'http://test');
 if(o.method==='POST'){
  const j=JSON.parse(o.body);if(!jobs.has(j.id)){jobs.set(j.id,{...j,status:'queued'});writes++;}return null;
 }
 const j=jobs.get(u.searchParams.get('id').slice(3));
 if(online){j.status='done';j.response={accepted:true};j.payload={};}
 return [j];
};
const relay=require('../lib/traccar-relay');
test('Offline PC leaves GPS pending; replay keeps one job and confirms only after delivery',async()=>{
 const payload={id:'pilot',lat:'12',lon:'-86',timestamp:'1790000000'};
 await assert.rejects(relay.call('position',payload,{waitMs:0}),e=>e.status===503);assert.equal(writes,1);
 assert.equal([...jobs.values()][0].status,'queued');
 online=true;assert.deepEqual(await relay.call('position',payload,{waitMs:0}),{accepted:true});assert.equal(writes,1);
 assert.deepEqual([...jobs.values()][0].payload,{});
});
test('Worker forwards to Traccar, and removes temporary coordinates only after acknowledgment',async()=>{
 const {createWorker}=require('../deployment/traccar-relay-worker.cjs');let captured,patch;
 const worker=createWorker({SUPABASE_URL:'https://queue.invalid',SUPABASE_SECRET_KEY:'key',TRACCAR_USER:'local',TRACCAR_PASSWORD:'secret'},
  {fetcher:async(url,o)=>{if(String(url).startsWith('http://127.0.0.1:5055')){captured=String(o.body);return new Response('{}');}patch=JSON.parse(o.body);return new Response('',{status:200});}});
 assert.equal(await worker.processJob({id:'a'.repeat(64),operation:'position',payload:{id:'gps-device',lat:'12',lon:'-86',timestamp:'1790000000'}}),true);
 assert.equal(new URLSearchParams(captured).get('id'),'gps-device');assert.deepEqual(patch,{status:'done',response:{accepted:true},payload:{},lease_until:null});
});
test('Worker outage preserves location payload for retry instead of confirming',async()=>{
 const {createWorker}=require('../deployment/traccar-relay-worker.cjs');let patch;
 const worker=createWorker({SUPABASE_URL:'https://queue.invalid',SUPABASE_SECRET_KEY:'key',TRACCAR_USER:'local',TRACCAR_PASSWORD:'secret'},
  {fetcher:async(url,o)=>{if(String(url).startsWith('http://127.0.0.1:5055'))return new Response('{}',{status:503});patch=JSON.parse(o.body);return new Response('');}});
 assert.equal(await worker.processJob({id:'a'.repeat(64),operation:'position',payload:{id:'gps-device',lat:'12',lon:'-86'}}),false);
 assert.equal(patch.status,'queued');assert.equal(Object.hasOwn(patch,'payload'),false);assert.equal(Object.hasOwn(patch,'response'),false);
});
after(()=>{C.sb=original;});
