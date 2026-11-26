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
