import test from 'node:test';
import assert from 'node:assert/strict';
import {parseActivitySearch,createActivitySearch} from '../integrations/activity-search.mjs';
import {createHarness} from '../dist/harness.mjs';
const sport='Trail running';
const intent={sports:[sport]};
const url='https://parks.example.test/trail';
const row={name:'Test trail',state:'California',sports:[sport],description:'Synthetic example in a test',source_url:url,lat:null,lon:null,check:'Verify access'};
const payload=rows=>({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{url}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({candidates:rows})}]}]});
test('requires a completed real search and exact HTTPS source from provider',()=>{
 assert.equal(parseActivitySearch(payload([row]),intent).status,'candidates_found');
 assert.equal(parseActivitySearch(payload([{...row,source_url:'https://fake.test'}]),intent).status,'no_candidates');
 assert.equal(parseActivitySearch(payload([{...row,state:'Nevada'}]),intent).status,'no_candidates');
 assert.equal(parseActivitySearch({status:'completed',output:payload([row]).output.slice(1)},intent).status,'unavailable');
 assert.equal(parseActivitySearch(payload([{...row,sports:['Surf']}]),intent).status,'no_candidates');
 assert.equal(parseActivitySearch(payload([row,row]),intent).candidates.length,1);
 assert.equal(parseActivitySearch(payload([row]),intent).candidates[0].lat,null);
});
test('search uses native required web tool, never sends API key in body',async()=>{
 let body;
 const tool=createActivitySearch({apiKey:'test-secret',model:'test-model',fetchFn:async(u,req)=>{body=JSON.parse(req.body);return new Response(JSON.stringify(payload([row])))}});
 assert.equal((await tool(intent)).candidates.length,1);
 assert.equal(body.tool_choice,'required');assert.deepEqual(body.tools,[{type:'web_search'}]);assert.ok(!JSON.stringify(body).includes('test-secret'));
});
const raw={destination:'Sea Ranch',destinationScope:'specific',sports:[sport],skillBySport:[],dateStatus:'unspecified'};
test('live harness replaces fixtures, uses exact normalized destination, keeps source URLs, discloses default',async()=>{
 const model={extractIntent:async()=>raw,next:async({events,toolDefinitions})=>{
 assert.ok(toolDefinitions.some(t=>t.name==='search_activity_locations'));assert.ok(!toolDefinitions.some(t=>t.name==='find_candidates'));
 return events.length?{type:'final',status:'results',message:'Exploratory match.',candidate_ids:['web-0']}:{type:'tool',name:'search_activity_locations',args:{}}
 }};
 const res=await createHarness({model,fixtures:{},activitySearchTool:async i=>{assert.equal(i.destination,'Sea Ranch');return parseActivitySearch(payload([row]),i)}}).run({query:'I want to run at SeaRanch'});
 assert.equal(res.status,'results');assert.equal(res.candidates[0].sourceUrl,url);assert.equal(res.candidates[0].verified,false);assert.match(res.message,/intermediate/);
});
test('unknown candidate ID cannot become a result even when web search fails',async()=>{
 const model={extractIntent:async()=>raw,next:async({events})=>events.length?{type:'final',status:'results',message:'Made up',candidate_ids:['web-0']}:{type:'tool',name:'search_activity_locations',args:{}}};
 const res=await createHarness({model,fixtures:{},activitySearchTool:async()=>({status:'unavailable',candidates:[]})}).run({query:'Sea Ranch run'});
 assert.equal(res.status,'insufficient');assert.deepEqual(res.candidates,[]);
});
test('ordinary discovery preserves sourced leads even if final conditions cannot be verified',async()=>{
 const model={extractIntent:async()=>raw,next:async({events})=>events.length?{type:'final',status:'insufficient',message:'Access is not verified.',candidate_ids:[]}:{type:'tool',name:'search_activity_locations',args:{}}};
 const res=await createHarness({model,fixtures:{},activitySearchTool:async i=>parseActivitySearch(payload([row]),i)}).run({query:'Sea Ranch run'});
 assert.equal(res.status,'results');assert.equal(res.candidates.length,1);assert.match(res.message,/not a confirmed itinerary/);
});
test('weather request for discovered location without sourced coordinates returns unavailable safely',async()=>{
 const model={extractIntent:async()=>({...raw,dateStatus:'resolved',startDate:'2026-11-27',endDate:'2026-11-28'}),next:async({events})=>events.length===0?{type:'tool',name:'search_activity_locations',args:{}}:events.length===2?{type:'tool',name:'get_weather_forecast',args:{candidate_id:'web-0'}}:{type:'final',status:'results',message:'Provisional.',candidate_ids:['web-0']}};
 const res=await createHarness({model,fixtures:{},activitySearchTool:async i=>parseActivitySearch(payload([row]),i),weatherTool:async()=>{throw Error('Must not call NOAA with null coordinates')},clock:()=>new Date('2026-11-26T20:00:00Z')}).run({query:'Sea Ranch run'});
 assert.equal(res.status,'results');assert.equal(res.weatherEvidence[0].data.status,'unavailable');
});
test('discovery receives explicit transfer limit',async()=>{
 let body;const tool=createActivitySearch({apiKey:'test-secret',model:'test-model',fetchFn:async(u,req)=>{body=JSON.parse(req.body);return Response.json(payload([row]))}});
 await tool({...intent,maxTransferMinutes:60});
 assert.equal(JSON.parse(body.input).maxTransferMinutes,60);
 assert.match(body.instructions,/BOTH requested sports/);
});
test('failed mandatory transfer offers separate exploratory leads, never accepted results',async()=>{
 const model={extractIntent:async()=>({...raw,maxTransferMinutes:60}),next:async({events})=>events.length?{type:'final',status:'insufficient',message:'Transfer unverified',candidate_ids:[]}:{type:'tool',name:'search_activity_locations',args:{}}};
 const res=await createHarness({model,fixtures:{},activitySearchTool:async i=>parseActivitySearch(payload([row]),i)}).run({query:'Run with max transfer 60 minutes'});
 assert.equal(res.status,'insufficient');assert.deepEqual(res.candidates,[]);assert.equal(res.exploratoryCandidates.length,1);assert.match(res.message,/travel limit has not been verified/);
});
test('transfer evidence must link returned sites and cover requested sports',async()=>{
 const spots=[{...row,name:'Ski venue',sports:['Ski / snowboard'],lat:39,lon:-120},{...row,name:'Trail A',lat:39.1,lon:-120},{...row,name:'Trail B',lat:39.2,lon:-120}];
 for(const testCase of [{ids:['web-0','web-1'],seconds:1800,expected:'results'},{ids:['web-0','web-2'],seconds:1800,expected:'insufficient'},{ids:['web-0','web-1'],seconds:3600,expected:'insufficient'},{ids:['web-0','web-1'],seconds:3600,expected:'results',query:'Ski and run with maximum 60 minutes transfer'}]){
  const model={extractIntent:async()=>({...raw,sports:['Ski / snowboard',sport],maxTransferMinutes:60}),next:async({events})=>events.length===0?{type:'tool',name:'search_activity_locations',args:{}}:events.length===2?{type:'tool',name:'get_drive_estimate',args:{from_candidate_id:'web-0',to_candidate_id:'web-1'}}:{type:'final',status:'results',message:'Provisional.',candidate_ids:testCase.ids}};
  const res=await createHarness({model,fixtures:{},activitySearchTool:async i=>parseActivitySearch(payload(spots),i),routeTool:async()=>({status:'estimate_available',durationSeconds:testCase.seconds,distanceMeters:10000})}).run({query:testCase.query||'Ski and run less than 60 minutes apart'});
  assert.equal(res.status,testCase.expected);if(testCase.expected==='insufficient')assert.equal(res.exploratoryCandidates.length,3);
 }
});
