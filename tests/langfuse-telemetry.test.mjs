import test from 'node:test';
import assert from 'node:assert/strict';
import {createLangfuseTrace} from '../integrations/langfuse-telemetry.mjs';
import {makeWorker} from '../worker/index.mjs';
const env={OPENAI_API_KEY:'test-model-key',LANGFUSE_PUBLIC_KEY:'pk-lf-test',LANGFUSE_SECRET_KEY:'sk-lf-test',LANGFUSE_BASE_URL:'https://us.cloud.langfuse.com'};
const request=()=>new Request('https://example.test/api/plan',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'private-user'},body:JSON.stringify({query:'private user prompt',preferences:{origin:'private origin'}})});
test('worker exports nested OTLP trace with actual decisions, usage, tool and final outcome; excludes private data',async()=>{
 let exported;const pending=[];
 const app=makeWorker('',{telemetryFactory:env=>createLangfuseTrace(env,{fetchFn:async(url,opts)=>{exported={url,opts};return new Response('{}')}}),modelFactory:({onUsage})=>({createSession:()=>({async next({events}){onUsage({input_tokens:100,output_tokens:25});return events.length?{type:'final',status:'insufficient',message:'private final answer',candidate_ids:[]}:{type:'tool',name:'find_candidates',args:{scenario:'kite'}}}})})});
 const r=await app.fetch(request(),env,{waitUntil:p=>pending.push(p)});
 const result=await r.json();await Promise.all(pending);
 assert.equal(r.status,200);assert.equal(result.status,'insufficient');assert.equal(result.telemetryStatus,'exported');assert.match(result.traceId,/^[0-9a-f]{32}$/);
 assert.equal(exported.url,'https://us.cloud.langfuse.com/api/public/otel/v1/traces');assert.equal(exported.opts.headers['x-langfuse-ingestion-version'],'4');
 assert.equal(exported.opts.headers.Authorization,'Basic '+btoa('pk-lf-test:sk-lf-test'));
 const body=exported.opts.body;
 for(const secret of ['private user prompt','private origin','private final answer','private-user','test-model-key','pk-lf-test','sk-lf-test'])assert.ok(!body.includes(secret));
 const spans=JSON.parse(body).resourceSpans[0].scopeSpans[0].spans;
 const root=spans.find(s=>!s.parentSpanId);assert.equal(spans.length,4);assert.ok(spans.every(s=>s.traceId===result.traceId));assert.ok(spans.filter(s=>s!==root).every(s=>s.parentSpanId===root.spanId));
 const attr=(s,k)=>s.attributes.find(a=>a.key===k)?.value.stringValue;
 assert.equal(JSON.parse(attr(root,'langfuse.observation.output')).status,'insufficient');
 const gen=spans.find(s=>s.name==='LLM decision 1');
 assert.deepEqual(JSON.parse(attr(gen,'langfuse.observation.usage_details')),{input:100,output:25,total:125});
 assert.equal(spans.find(s=>s.name==='find_candidates').status.code,1);
});
test('bad region or absent credentials do not export or alter the response',async()=>{
 for(const config of [{...env,LANGFUSE_BASE_URL:'https://untrusted.test'},{...env,LANGFUSE_SECRET_KEY:undefined}]){
  let called=false;const trace=createLangfuseTrace(config,{fetchFn:async()=>{called=true;throw Error('unexpected')}});
  trace.finish({httpStatus:200,result:{status:'clarify'}});assert.equal(await trace.export(),false);assert.equal(called,false);
 }
});
test('failed export is best effort and does not throw',async()=>{
 const t=createLangfuseTrace(env,{fetchFn:async()=>new Response('untrusted failure body',{status:403})});t.finish({httpStatus:502,result:{},errorCode:'model_error'});assert.equal(await t.export(),false);assert.equal(t.exportStatus,'http_403');
});

test('diagnostic categories identify network errors without exporting sensitive exception details',async()=>{
 const trace=createLangfuseTrace(env,{fetchFn:async()=>{throw new TypeError('Network connection lost; private diagnostic')}});trace.finish({httpStatus:200,result:{status:'clarify'}});
 assert.equal(await trace.export(),false);assert.equal(trace.exportStatus,'fetch_network');
});


test('production wrapper forwards intent extraction, returns normalized fields and traces only safe metadata',async()=>{
 let exported;
 const app=makeWorker('',{telemetryFactory:env=>createLangfuseTrace(env,{fetchFn:async(_url,opts)=>{exported=opts.body;return new Response('{}')}}),modelFactory:({onUsage})=>({
  async extractIntent({referenceDate}){onUsage({input_tokens:61,output_tokens:21});return {destination:'private destination',destinationScope:'specific',sports:['Ski / snowboard'],ambiguousCycling:false,dateStatus:'resolved',dateIntent:'specific dates',startDate:referenceDate,endDate:referenceDate,explicitSkill:null,skillBySport:[],origin:'private origin',maxOriginDriveMinutes:null,maxTransferMinutes:null,responseLanguage:'en'}},
  createSession:()=>({async next({state}){assert.equal(state.normalizedIntent.skill,'Intermediate');assert.equal(state.preferences.startDate,state.normalizedIntent.startDate);return {type:'final',status:'insufficient',message:'No verified itinerary.',candidate_ids:[]}}})
 })});
 const res=await app.fetch(request(),env); const result=await res.json();
 assert.equal(res.status,200);assert.equal(result.normalizedIntent.skill,'Intermediate');assert.match(result.message,/assume intermediate/i);
 assert.ok(result.trace.some(e=>e.type==='intent'));assert.equal(result.telemetryStatus,'exported');
 assert.ok(!exported.includes('private destination'));assert.ok(!exported.includes('private user prompt'));
 const spans=JSON.parse(exported).resourceSpans[0].scopeSpans[0].spans;
 const extraction=spans.find(x=>x.name==='Intent extraction');assert.ok(extraction);
 const usage=extraction.attributes.find(a=>a.key==='langfuse.observation.usage_details');assert.deepEqual(JSON.parse(usage.value.stringValue),{input:61,output:21,total:82});
});
