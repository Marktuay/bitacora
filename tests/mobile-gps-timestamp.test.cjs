const {test,after}=require('node:test'),assert=require('node:assert/strict');
const C=require('../api/_config'),R=require('../lib/traccar-relay');
const saved={sb:C.sb,call:R.call,enqueue:R.enqueue,direct:R.direct};
Object.assign(process.env,{SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEY:'test',BITACORA_GPS_PROVIDER:'traccar'});
C.sb=async()=>[{id:'device',traccar_unique_id:'device-gps',traccar_device_id:6,active:true}];
let forwarded;
R.direct=()=>false;R.enqueue=async(op,p)=>{assert.equal(op,'position');forwarded=p;return {accepted:true,queued:true};};
async function ingest(timestamp){let status,data;forwarded=null;
 await require('../lib/mobile-api').handler({method:'POST',url:'/api/traccar?action=mobile-position',headers:{},
  body:{id:'a'.repeat(64),lat:'12.13',lon:'-86.25',accuracy:'5',timestamp:String(timestamp)}},
  {setHeader(){},set statusCode(x){status=x},end(x){data=JSON.parse(x)}});
 return {status,data};
}
test('GPS ingest preserves milliseconds and remains compatible with older second timestamps',async()=>{
 const now=Date.now();
 for(const time of [now,Math.floor(now/1000)]){
  assert.equal((await ingest(time)).status,200);
  assert.equal(forwarded.timestamp,String(time));
 }
});
test('Future timestamps are rejected in seconds and milliseconds',async()=>{
 const future=Date.now()+600000;
 for(const time of [future,Math.floor(future/1000)]){
  assert.equal((await ingest(time)).status,400);assert.equal(forwarded,null);
 }
});
after(()=>{C.sb=saved.sb;R.call=saved.call;R.enqueue=saved.enqueue;R.direct=saved.direct;});
