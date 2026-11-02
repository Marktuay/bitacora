const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../api/_config');
const original=C.sb,token='a'.repeat(64),deviceId='11111111-1111-4111-8111-111111111111';
let credential=null,positions=[],unavailable=false,active=true;
Object.assign(process.env,{SUPABASE_URL:'https://gps-project.example.invalid',SUPABASE_SECRET_KEY:'test-key',BITACORA_GPS_PROVIDER:'supabase',TRACCAR_BASE_URL:'http://PC-MUST-NOT-BE-USED.invalid'});
C.sb=async(path,options={})=>{
 const u=new URL(path,process.env.SUPABASE_URL);
 if(path.startsWith('/rest/v1/km_mobile_devices'))return active&&u.searchParams.get('token_hash')==='eq.'+crypto.createHash('sha256').update(token).digest('hex')?[{id:deviceId,company:'blokon',activated_at:'2026-09-01',traccar_unique_id:'bkm-'+deviceId}]:[];
 if(path.startsWith('/rest/v1/km_gps_credentials'))return credential?[credential]:[];
 if(path==='/rest/v1/rpc/km_rotate_gps_token'){credential={enabled:true,token_hash:'b'.repeat(64)};return {unique_id:'bkm-'+deviceId,token:'c'.repeat(64)};}
 if(path==='/rest/v1/rpc/km_ingest_position'){
  if(unavailable)throw Error('Storage unavailable');
  const b=JSON.parse(options.body);assert.equal(b.p_token_hash,credential.token_hash);assert.equal(b.p_unique_id,'bkm-'+deviceId);
  const duplicate=positions.some(p=>JSON.stringify(p)===JSON.stringify(b.p_position));if(!duplicate)positions.push(b.p_position);
  return {ok:true,duplicate};
 }
 throw Error('Unexpected external request: '+u.pathname);
};
async function ingest(data){let status,result;await require('../lib/mobile-api').handler({method:'POST',url:'/api/traccar?action=mobile-position',headers:{},body:data},{set statusCode(x){status=x},setHeader(){},end(b){result=JSON.parse(b)}});return {status,result};}
const point=()=>({id:token,lat:'12.10',lon:'-86.20',timestamp:String(Math.floor(Date.now()/1000)),speed:'20',accuracy:'5'});
test('GPS antiguo llega a Supabase, convierte nudos y reintenta sin duplicar',async()=>{
 const p=point();const a=await ingest(p);assert.equal(a.status,200);assert.equal(a.result.accepted,true);assert.equal(positions[0].speed_kmh,37.04);
 assert.equal((await ingest(p)).result.duplicate,true);assert.equal(positions.length,1);
 unavailable=true;assert.equal((await ingest({...p,lat:'12.11'})).status,503);assert.equal(positions.length,1);unavailable=false;
 assert.equal((await ingest({...p,lat:'12.11'})).status,200);assert.equal(positions.length,2);
});
test('GPS inválido y dispositivo revocado nunca se aceptan',async()=>{
 assert.equal((await ingest({...point(),lat:'999'})).status,400);
 assert.equal((await ingest({...point(),timestamp:''})).status,400);
 active=false;assert.equal((await ingest(point())).status,401);active=true;
 credential.enabled=false;assert.equal((await ingest(point())).status,401);credential.enabled=true;
});
test.after(()=>{C.sb=original;});
