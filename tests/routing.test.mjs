import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getDriveEstimate} from '../integrations/routing-api.mjs';
import {createHarness} from '../dist/harness.mjs';
import {fixtures} from '../dist/fixtures.mjs';
const args={from:{latitude:39.17,longitude:-120.14},to:{latitude:38.9,longitude:-121.08}};
const response=(data,ok=true)=>async()=>({ok,json:async()=>data});
test('OSRM lon/lat ordering, units and source',async()=>{
  const data=await getDriveEstimate(args,{fetchFn:async u=>{assert.match(u,/-120\.14000,39\.17000;-121\.08000,38\.90000/);return response({code:'Ok',routes:[{duration:4560,distance:102000}]})()}});
  assert.equal(data.status,'estimate_available');assert.equal(data.durationSeconds,4560);assert.equal(data.distanceMeters,102000);assert.ok(data.sourceUrl.startsWith('https://router.project-osrm.org/'));
});
test('invalid coordinates prevent HTTP',async()=>assert.equal((await getDriveEstimate({...args,to:{latitude:0,longitude:0}},{fetchFn:()=>assert.fail('network')})).status,'invalid_request'));
test('no route never fabricates duration',async()=>{const r=await getDriveEstimate(args,{fetchFn:response({code:'NoRoute'},false)});assert.equal(r.status,'no_route');assert.equal(r.durationSeconds,undefined)});
test('network or malformed result becomes unavailable',async()=>{
  for(const fetchFn of [async()=>{throw Error('offline')},response({code:'Ok',routes:[{duration:-1,distance:1}]}),response({code:'Error'},false)])assert.equal((await getDriveEstimate(args,{fetchFn})).status,'unavailable');
});
function harness(routeTool,from='tahoe-0',to='tahoe-2'){
  let i=0;
  const actions=[{type:'tool',name:'find_candidates',args:{scenario:'tahoe'}},{type:'tool',name:'get_drive_estimate',args:{from_candidate_id:from,to_candidate_id:to}},{type:'final',status:'insufficient',message:'Area estimate only'}];
  return createHarness({fixtures,routeTool,model:{next:async ctx=>{assert.ok(ctx.toolDefinitions.some(t=>t.name==='get_drive_estimate'));return actions[i++]}}});
}
test('harness supplies registered area coordinates and compares exact seconds',async()=>{
  for(const [seconds,expected] of [[3600,'within_limit'],[3600.1,'exceeds_limit']]){
    const result=await harness(async a=>{assert.deepEqual(a,args);return {status:'estimate_available',durationSeconds:seconds,distanceMeters:100000}}).run({query:'Tahoe',preferences:{maxTransferMinutes:60}});
    assert.equal(result.metrics.toolCalls,2);assert.equal(result.routeEvidence[0].comparison,expected);
  }
});
test('unavailable estimates and absent limits stay unknown',async()=>{
  for(const [tool,preferences] of [[async()=>({status:'no_route'}),{maxTransferMinutes:60}],[async()=>({status:'estimate_available',durationSeconds:10,distanceMeters:10}),{}],[async()=>({status:'estimate_available',durationSeconds:-1,distanceMeters:10}),{maxTransferMinutes:60}],[async()=>{throw Error('offline')},{maxTransferMinutes:60}]]){
    const result=await harness(tool).run({query:'Tahoe',preferences});assert.equal(result.routeEvidence[0].comparison,'unknown');
  }
});
test('unknown or identical candidate IDs rejected before routing',async()=>{
  for(const to of ['invented','tahoe-0']){
    const result=await harness(()=>assert.fail('must not call'),'tahoe-0',to).run({query:'Tahoe'});assert.equal(result.routeEvidence.length,0);assert.equal(result.metrics.toolCalls,1);
  }
});
