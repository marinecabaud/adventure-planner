import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorker} from '../worker/index.mjs';
const calls=[];
const app=makeWorker('<h1>Adventure Planner</h1>',{
 modelFactory:({apiKey})=>({createSession:()=>({async next({events}){calls.push(apiKey==='test-secret');if(events.length===0)return {type:'tool',name:'find_candidates',args:{scenario:'tahoe'}};if(events.length===2)return {type:'tool',name:'get_weather_forecast',args:{candidate_id:'tahoe-0'}};if(events.length===4)return {type:'tool',name:'get_drive_estimate',args:{from_candidate_id:'tahoe-0',to_candidate_id:'tahoe-1'}};return {type:'final',status:'insufficient',message:'No verified itinerary.',candidate_ids:[]}}})}),
 weatherTool:async args=>({status:'forecast_available',source:'fixture for test',...args}),
 routeTool:async()=>({status:'estimate_available',durationSeconds:3600,distanceMeters:50000})
});
const env={OPENAI_API_KEY:'test-secret'};
function req(body={},extra={}){return new Request('https://example.test/api/plan',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'test-owner',...extra},body:JSON.stringify(body)})}
test('serves existing interface without exposing credentials',async()=>{const res=await app.fetch(new Request('https://example.test/'),env);assert.equal(res.status,200);assert.equal(await res.text(),'<h1>Adventure Planner</h1>')});
test('requires platform identity and rejects cross-origin POST',async()=>{assert.equal((await app.fetch(req({}, {'oai-authenticated-user-id':''}),env)).status,401);assert.equal((await app.fetch(req({}, {origin:'https://evil.test'}),env)).status,403)});
test('validates date and transfer input',async()=>{assert.equal((await app.fetch(req({query:'Tahoe',preferences:{startDate:'2026-02-30',endDate:'2026-03-01'}}),env)).status,400);assert.equal((await app.fetch(req({query:'Tahoe',preferences:{maxTransferMinutes:-4}}),env)).status,400)});
test('missing key is a clear server configuration error',async()=>{assert.equal((await app.fetch(req({query:'Tahoe'}),{})).status,503)});
test('runs harness with both live-adapter interfaces and returns safe trace/evidence',async()=>{const res=await app.fetch(req({query:'Tahoe ski and trail run',preferences:{startDate:'2026-11-27',endDate:'2026-11-28',maxTransferMinutes:45}}),env);assert.equal(res.status,200);const text=await res.text();assert.ok(!text.includes('test-secret'));const r=JSON.parse(text);assert.equal(r.metrics.toolCalls,3);assert.equal(r.weatherEvidence[0].data.status,'forecast_available');assert.equal(r.routeEvidence[0].comparison,'exceeds_limit');assert.ok(calls.every(Boolean));assert.equal(r.status,'insufficient')});
test('safe adapter errors',async()=>{const broken=makeWorker('',{modelFactory:({onError})=>({next:async()=>{onError('OpenAI HTTP 429 (insufficient_quota)');throw Error('test-secret')}})});const r=await broken.fetch(req({query:'Tahoe'}),env);assert.equal(r.status,502);assert.ok(!(await r.text()).includes('test-secret'))});
