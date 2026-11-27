import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensions,gradeStructure,parseJudge,summarize} from './run-recommendation-quality.mjs';
const testcase={query:'Where can I kitesurf in spring?',sports:['Kitesurf'],expected:'results',weather:'forbidden'};
const result={status:'results',normalizedIntent:{sports:['Kitesurf']},candidates:[{id:'web-0',evidence:'web_discovery',sourceUrl:'https://example.com',verified:false}],trace:[{type:'tool',detail:'search_activity_locations'}]};
const url='https://example.com/evidence';
const payload=checks=>({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{url}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({checks})}]}]});
const makeChecks=(status='pass',urls=[url])=>dimensions.map(id=>({id,status,reason:'Test rationale',urls}));
test('valid live discovery passes deterministic checks; bad status and fixture search fail',()=>{
 assert.ok(gradeStructure(testcase,result).every(x=>x.status==='pass'));
 const bad=gradeStructure(testcase,{...result,status:'insufficient',trace:[{type:'tool',detail:'find_candidates'}]});
 assert.equal(bad.find(x=>x.id==='actionable_discovery').status,'fail');assert.equal(bad.find(x=>x.id==='no_fixture_search').status,'fail');
});
test('weather and hard transfer limits are not silently ignored',()=>{
 const t={...testcase,expected:'constraint',maxTransferMinutes:60,sports:['Kitesurf','Surf']};
 const bad=gradeStructure(t,result);
 assert.equal(bad.find(x=>x.id==='mandatory_constraint_handled').status,'fail');
 assert.equal(bad.find(x=>x.id==='transfer_limit_normalized').status,'fail');
});
test('judge cannot give factual pass without actual searched source',()=>{
 const checks=parseJudge(payload(makeChecks('pass',['https://not-searched.test'])),testcase,result);
 assert.equal(checks.find(x=>x.id==='activity').status,'unknown');
 assert.equal(checks.find(x=>x.id==='source_quality').status,'unknown');
 assert.throws(()=>parseJudge({status:'completed',output:payload(makeChecks()).output.slice(1)},testcase,result));
});
test('not applicable only when criterion does not apply; grade unknown separately',()=>{
 const checks=parseJudge(payload(makeChecks('not_applicable')),testcase,result);
 assert.equal(checks.find(x=>x.id==='season').status,'unknown');
 assert.equal(checks.find(x=>x.id==='ranking').status,'not_applicable');
 const s=summarize([{structure:gradeStructure(testcase,result),quality:checks}]);
 assert.equal(s.quality.unknown,6);assert.equal(s.qualityScore,null);assert.equal(s.coverage,0);
});
test('partial score is distinct from pass and unknown is not a pass',()=>{
 const q=makeChecks('partial').map(x=>({...x,status:x.id==='geography'?'pass':x.id==='activity'?'unknown':'partial'}));
 const s=summarize([{quality:q,structure:[]}]);assert.equal(s.quality.pass,1);assert.equal(s.quality.partial,5);assert.equal(s.quality.unknown,1);assert.equal(s.qualityScore,3.5/6);
});
