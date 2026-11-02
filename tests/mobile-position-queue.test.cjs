const {test,after}=require('node:test');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../api/_config');
const saved={sb:C.sb,base:process.env.TRACCAR_BASE_URL,ingest:process.env.TRACCAR_INGEST_URL,provider:process.env.BITACORA_GPS_PROVIDER};
Object.assign(process.env,{SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEY:'test',BITACORA_GPS_PROVIDER:'traccar'});
delete process.env.TRACCAR_BASE_URL;delete process.env.TRACCAR_INGEST_URL;
const token='e'.repeat(64),tokenHash=crypto.createHash('sha256').update(token).digest('hex');
const device={id:'11111111-1111-4111-8111-111111111111',company:'blokon',employee_id:'e',vehicle_id:'v',active:true,token_hash:tokenHash,traccar_device_id:14,traccar_unique_id:'bkm-11111111-1111-4111-8111-111111111111'};
let relayPosts=0,relayReads=0;
C.sb=async(path,options={})=>{
 const u=new URL(path,'http://test'),table=u.pathname.split('/').at(-1);
 if(table==='km_mobile_devices')return [device];
 if(table==='km_traccar_relay_jobs'){
  if(options.method==='POST'){relayPosts++;return null;}
  relayReads++;return [];
 }
 throw Error('Unexpected table '+table);
};
test('Mobile GPS position is durably queued and acknowledged without waiting for the PC relay',async()=>{
 let status,data;
 await require('../lib/mobile-api').handler({
  method:'POST',url:'/api/traccar?action=mobile-position',headers:{},
  body:{id:token,lat:'12.1300',lon:'-86.2500',timestamp:String(Math.floor(Date.now()/1000)),accuracy:'5'}
 },{setHeader(){},set statusCode(s){status=s},end(raw){data=JSON.parse(raw)}});
 assert.equal(status,200);assert.equal(data.accepted,true);assert.equal(data.queued,true);
 assert.equal(relayPosts,1);assert.equal(relayReads,0);
});
after(()=>{
 C.sb=saved.sb;
 if(saved.base===undefined)delete process.env.TRACCAR_BASE_URL;else process.env.TRACCAR_BASE_URL=saved.base;
 if(saved.ingest===undefined)delete process.env.TRACCAR_INGEST_URL;else process.env.TRACCAR_INGEST_URL=saved.ingest;
 if(saved.provider===undefined)delete process.env.BITACORA_GPS_PROVIDER;else process.env.BITACORA_GPS_PROVIDER=saved.provider;
});
