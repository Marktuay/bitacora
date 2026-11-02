const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGateway}=require('../deployment/traccar-gateway.cjs');
test('Gateway rejects anonymous access and administrative endpoints; forwards authorized GPS only',async()=>{
 const token='a'.repeat(64);let calls=0;
 const server=createGateway({token,user:'local',password:'secret',fetcher:async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:5055');assert.equal(options.headers.Authorization,'Basic '+Buffer.from('local:secret').toString('base64'));return new Response('{}');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/ingest',{method:'POST',body:'id=test'})).status,401);assert.equal(calls,0);
  const headers={'x-gateway-token':token};assert.equal((await fetch(base+'/api/users',{headers})).status,404);assert.equal(calls,0);
  assert.equal((await fetch(base+'/api/reports/route?deviceId=2&from=invalid&to=invalid',{headers})).status,400);
  assert.equal((await fetch(base+'/ingest',{method:'POST',headers,body:'id=test&lat=12&lon=-86'})).status,200);assert.equal(calls,1);
 }finally{await new Promise(r=>server.close(r));}
});
