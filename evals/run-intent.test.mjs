import test from 'node:test';
import assert from 'node:assert/strict';
import {deterministicChecks,summarize,judgeCase,runBaseline} from './run-intent.mjs';
test('absence of evidence remains not observed',()=>{
 const c=deterministicChecks({expected:{startDate:'2026-11-27',skill:'Intermediate'}},{weatherEvidence:[]});
 assert.equal(c.length,2);assert.ok(c.every(x=>x.status==='not_observed'));
});
test('structured date checks match the actual tool parameters',()=>{
 const c=deterministicChecks({expected:{startDate:'2026-11-27',endDate:'2026-11-28'}},{weatherEvidence:[{data:{startDate:'2026-11-27',endDate:'2025-11-28'}}]});
 assert.deepEqual(c.map(x=>x.status),['pass','fail']);
});
test('summary separates unknown checks from observed score',()=>{
 const s=summarize([{category:'intent',agentUsage:{input:1,output:2},judgeUsage:{input:3,output:4},judgedChecks:[{status:'pass'},{status:'fail'},{status:'not_observed'}],deterministicChecks:[{status:'not_observed'}]}]).intent;
 assert.equal(s.passRate,0.5);assert.equal(s.coverage,2/3);assert.equal(s.deterministic.not_observed,1);
});
test('judge validates strict criterion completeness and records usage',async()=>{
 const args={test:{input:{query:'test'},expected:{askForYear:false}},result:{status:'clarify',message:'Which year?'},apiKey:'mock',usage:{input:0,output:0}};
 const x=await judgeCase({...args,fetchFn:async()=>new Response(JSON.stringify({status:'completed',usage:{input_tokens:10,output_tokens:5},output:[{content:[{type:'output_text',text:JSON.stringify({checks:[{criterion:'askForYear',status:'fail',reason:'Asked for year'}]})}]}]}))});
 assert.equal(x[0].status,'fail');assert.equal(args.usage.input,10);
});
test('end-to-end runner with injected fake model and judge, no network',async()=>{
 const r=await runBaseline({limit:1,apiKey:'fake',modelFactory:()=>({next:async()=>({type:'final',status:'clarify',message:'Which year?',candidate_ids:[]})}),judge:async({test})=>Object.keys(test.expected).map(criterion=>({criterion,status:'not_observed',reason:'test'}))});
 assert.equal(r.completedCases,1);assert.equal(r.rows[0].result.status,'clarify');assert.equal(r.summary.context_assumptions.coverage,0);
});
