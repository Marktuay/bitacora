const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../assets/gps-comparison'),'utf8');
test('Filtering calculates missing GPS automatically, with bounded concurrency and stable saved values',async()=>{
 const calls=[],status=[],rows=[{id:'saved',km_traccar:8.3},{id:'zero',km_traccar:0},...['a','b','c'].map(id=>({id,km_traccar:null}))];let active=0,peak=0,updates=0;
 const window={BITACORA:{api:async(url,opts)=>{const body=JSON.parse(opts.body);assert.equal(url,'/api/traccar?action=compare');assert.equal(body.company,'newcentury');calls.push(body.id);active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return {entry:{id:body.id,km_traccar:4.2}};}}};vm.runInNewContext(source,{window});
 await window.KMGpsComparison.complete({company:'newcentury',items:rows,onUpdate:()=>updates++,onStatus:(message,busy)=>status.push({message,busy})});
 assert.deepEqual(calls,['a','b','c']);assert.equal(peak,2);assert.equal(updates,3);assert.equal(rows[0].km_traccar,8.3);assert.equal(rows[1].km_traccar,0);assert.equal(status.at(-1).busy,false);
});
test('Failed GPS remains missing and a response for an old filter never alters the current table',async()=>{
 const rows=[{id:'a',km_traccar:null},{id:'b',km_traccar:null}];let current=true,updates=0;
 const window={BITACORA:{api:async()=>{current=false;return {entry:{km_traccar:99}}}}};vm.runInNewContext(source,{window});
 await window.KMGpsComparison.complete({company:'newcentury',items:rows,isCurrent:()=>current,onUpdate:()=>updates++});assert.equal(updates,0);assert.equal(rows[0].km_traccar,null);
 window.BITACORA.api=async()=>{throw Error('offline')};current=true;let message;
 await window.KMGpsComparison.complete({company:'newcentury',items:rows,onStatus:m=>message=m});assert.match(message,/sin GPS disponible/);assert.equal(rows[1].km_traccar,null);
});
test('A freshly synced trip completes automatically after its GPS settling period',async()=>{
 const rows=[{id:'new',km_traccar:null}];let calls=0,updates=0;const waits=[];
 const window={BITACORA:{api:async()=>++calls<3?{pending:true,retry_after_seconds:calls===1?90:2}:{entry:{km_traccar:15.34}}}};vm.runInNewContext(source,{window});
 await window.KMGpsComparison.complete({company:'newcentury',items:rows,delay:async ms=>waits.push(ms),onUpdate:()=>updates++});
 assert.equal(calls,3);assert.deepEqual(waits,[15000,2000]);assert.equal(rows[0].km_traccar,15.34);assert.equal(updates,1);
});
test('Changing filters cancels a pending retry and unavailable GPS has a bounded retry count',async()=>{
 let calls=0,current=true;const rows=[{id:'new',km_traccar:null}];
 const window={BITACORA:{api:async()=>{calls++;return {pending:true}}}};vm.runInNewContext(source,{window});
 await window.KMGpsComparison.complete({company:'newcentury',items:rows,isCurrent:()=>current,delay:async()=>{current=false}});
 assert.equal(calls,1);assert.equal(rows[0].km_traccar,null);
 calls=0;let finalBusy;await window.KMGpsComparison.complete({company:'newcentury',items:rows,delay:async()=>{},onStatus:(m,busy)=>finalBusy=busy});
 assert.equal(calls,8);assert.equal(finalBusy,false);assert.equal(rows[0].km_traccar,null);
});
