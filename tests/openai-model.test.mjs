import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIModel,defaultModel} from '../models/openai-model.mjs';
import {createHarness} from '../dist/harness.mjs';
import {fixtures} from '../dist/fixtures.mjs';
const final=(status,message,candidate_ids=[])=>['finish_plan',{status,message,candidate_ids}];
const fakeCall=(name,args,id)=>({type:'function_call',id:'fc_'+id,call_id:'call_'+id,name,arguments:JSON.stringify(args),status:'completed'});
function fakeResponses(actions){
  let n=0;const requests=[];
  const fetchFn=async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer test-key');
    const request=JSON.parse(options.body);requests.push(request);
    assert.equal(request.store,false);assert.equal(request.parallel_tool_calls,false);assert.equal(request.tool_choice,'required');assert.ok(request.tools.every(t=>t.strict));
    assert.ok(request.tools.some(t=>t.name==='finish_plan'));assert.equal(request.model,defaultModel);
    const index=n++;const action=actions[index];assert.ok(action);
    return {ok:true,json:async()=>({status:'completed',output:[{type:'reasoning',id:'rs_'+index,summary:[],encrypted_content:'test-encrypted-reasoning'},fakeCall(...action,index)]})};
  };
  return {fetchFn,requests};
}
const build=({fetchFn,onError,...tools})=>createHarness({fixtures,model:createOpenAIModel({apiKey:'test-key',model:defaultModel,fetchFn,onError}),...tools});
test('OpenAI adapter requires API credentials before network',()=>assert.throws(()=>createOpenAIModel({apiKey:'',fetchFn:()=>assert.fail('network')}),/OPENAI_API_KEY/));
test('full native function calling loop across fixture, weather MCP adapter and routing adapter',async()=>{
  const fake=fakeResponses([
    ['find_candidates',{scenario:'tahoe'}],
    ['get_weather_forecast',{candidate_id:'tahoe-0'}],
    ['get_drive_estimate',{from_candidate_id:'tahoe-0',to_candidate_id:'tahoe-2'}],
    ['check_evidence',{candidate_ids:['tahoe-0']}],
    final('insufficient','The estimated transfer exceeds your limit, and activity locations are not verified.')
  ]);
  const result=await build({...fake,maxSteps:6,maxCalls:4,
    weatherTool:async args=>{assert.equal(args.startDate,'2026-11-27');assert.equal(args.latitude,39.17);return {status:'forecast_available',periods:[],sourceUrl:'https://api.weather.gov/fixture'}},
    routeTool:async args=>{assert.equal(args.from.latitude,39.17);return {status:'estimate_available',durationSeconds:5933.1,distanceMeters:129519.5}}
  }).run({query:'Ski and trail run Tahoe; max 60 min',preferences:{startDate:'2026-11-27',endDate:'2026-11-29',maxTransferMinutes:60}});
  assert.equal(result.status,'insufficient');assert.equal(result.metrics.toolCalls,4);assert.equal(result.metrics.modelSteps,5);
  assert.equal(result.routeEvidence[0].comparison,'exceeds_limit');assert.equal(result.weatherEvidence.length,1);assert.equal(fake.requests.length,5);
  const first=fake.requests[0];assert.ok(first.tools.some(t=>t.name==='get_weather_forecast'));assert.ok(first.tools.some(t=>t.name==='get_drive_estimate'));
  assert.equal(JSON.parse(first.input[0].content).preferences.maxTransferMinutes,60);
  const last=fake.requests.at(-1).input;
  assert.equal(last.filter(x=>x.type==='function_call_output').length,4);
  assert.equal(last.filter(x=>x.type==='reasoning').length,4);
  assert.equal(last.find(x=>x.type==='function_call_output'&&x.call_id==='call_2')?.output.includes('exceeds_limit'),true);
  assert.equal(last.at(-1).call_id,'call_3');
});
test('clarifications need no tool execution and sessions do not leak history',async()=>{
  const fake=fakeResponses([final('clarify','Which sports?'),final('unsupported','California only.')]);
  const harness=build(fake);
  const [one,two]=await Promise.all([harness.run({query:'Trip'}),harness.run({query:'Hawaii'})]);
  assert.equal(one.status,'clarify');assert.equal(two.status,'unsupported');assert.equal(one.metrics.toolCalls,0);
  assert.equal(fake.requests[1].input.length,1);assert.equal(JSON.parse(fake.requests[1].input[0].content).query,'Hawaii');
  assert.ok(!fake.requests[0].tools.some(t=>t.name==='get_weather_forecast'));
});
test('unknown model function and fabricated candidate IDs never execute',async()=>{
  const a=await build(fakeResponses([['book_trip',{}]])).run({query:'trip'});
  assert.equal(a.status,'insufficient');assert.equal(a.metrics.toolCalls,0);
  const b=await build(fakeResponses([final('results','Try this',['made-up'])])).run({query:'trip'});
  assert.equal(b.status,'insufficient');assert.equal(b.candidates.length,0);
});
test('malformed JSON, parallel calls, incomplete response and provider failure degrade safely',async()=>{
  const bad=[{status:'completed',output:[{...fakeCall('find_candidates',{},0),arguments:'bad json'}]},{status:'completed',output:[fakeCall('find_candidates',{scenario:'tahoe'},0),fakeCall(...final('clarify','?'),1)]},{status:'incomplete',output:[]}];
  for(const data of bad){
    const r=await build({fetchFn:async()=>({ok:true,json:async()=>data})}).run({query:'trip'});assert.equal(r.status,'insufficient');assert.equal(r.metrics.toolCalls,0);
  }
  const errors=[];const r=await build({fetchFn:async()=>({ok:false,status:401,json:()=>assert.fail('do not log body')}),onError:m=>errors.push(m)}).run({query:'trip'});
  assert.equal(r.status,'insufficient');assert.deepEqual(errors,['OpenAI HTTP 401']);
});
test('model tool calls remain subject to the harness budget',async()=>{
  const fake=fakeResponses([['find_candidates',{scenario:'tahoe'}],['find_candidates',{scenario:'tahoe'}]]);
  const r=await build({...fake,maxCalls:1}).run({query:'trip'});
  assert.equal(r.status,'insufficient');assert.equal(r.metrics.toolCalls,1);assert.ok(r.trace.some(x=>x.type==='limit'));
});
test('weather call without explicit travel dates is rejected by harness',async()=>{
  const fake=fakeResponses([['find_candidates',{scenario:'tahoe'}],['get_weather_forecast',{candidate_id:'tahoe-0'}]]);
  const r=await build({...fake,weatherTool:()=>assert.fail('must not call')}).run({query:'weather in Tahoe'});
  assert.equal(r.status,'insufficient');assert.equal(r.metrics.toolCalls,1);
});

test('429 errors report only allowlisted error codes, never provider messages',async()=>{
  for(const [code,expected] of [['insufficient_quota','OpenAI HTTP 429 (insufficient_quota)'],['project_spend_limit_exceeded','OpenAI HTTP 429 (project_spend_limit_exceeded)'],['anything-sensitive','OpenAI HTTP 429']]){
    const messages=[];
    const r=await build({fetchFn:async()=>({ok:false,status:429,json:async()=>({error:{code,message:'SECRET: never print'}})}),onError:m=>messages.push(m)}).run({query:'trip'});
    assert.equal(r.status,'insufficient');assert.deepEqual(messages,[expected]);
  }
});
