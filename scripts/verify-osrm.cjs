const assert=require('node:assert/strict');
const {estimateRoads}=require('../lib/road-match');
async function main(){
 const endpoint='http://127.0.0.1:5000';let ready=false;
 for(let i=0;i<40;i++){
  try{const r=await fetch(endpoint,{signal:AbortSignal.timeout(1000)});if((await r.json()).code==='InvalidUrl'){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(ready,'OSRM must respond before activation');
 const start=Date.parse('2026-10-03T12:00:00Z');
 const points=Array.from({length:8},(_,i)=>({latitude:12,longitude:-86+i*.0003,accuracy:5,fixTime:new Date(start+i*10000).toISOString()}));
 const result=await estimateRoads(points,{endpoint,budgetMs:5000});
 assert.equal(result.status,'matched');assert.equal(result.partial,false);assert.ok(result.confidence_min>=.9);
 assert.ok(result.distance_km>.2&&result.distance_km<.26);assert.equal(result.matched_points,8);
 const gap=points.map(p=>({...p}));for(let i=4;i<gap.length;i++)gap[i].fixTime=new Date(start+200000+(i-4)*10000).toISOString();
 const partial=await estimateRoads(gap,{endpoint,budgetMs:5000});assert.equal(partial.partial,true);assert.ok(partial.distance_km<result.distance_km);
 console.log('PASS real OSRM: complete street match, confidence, activation probe and missing-signal exclusion');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
