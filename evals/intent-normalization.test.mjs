import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIntent,referenceDateAt} from '../dist/intent.mjs';
import {createHarness} from '../dist/harness.mjs';
import {createOpenAIModel} from '../models/openai-model.mjs';
import {fixtures} from '../dist/fixtures.mjs';
import {deterministicChecks} from './run-intent.mjs';
const now='2026-11-26T12:00:00-08:00';
const raw={destination:'Tahoe',destinationScope:'specific',sports:['Ski / snowboard'],ambiguousCycling:false,dateStatus:'resolved',dateIntent:'specific dates',startDate:'2026-11-27',endDate:'2026-11-28',explicitSkill:null,skillBySport:[],origin:null,maxOriginDriveMinutes:null,maxTransferMinutes:null,responseLanguage:'en'};
test('California local reference date across UTC midnight',()=>assert.equal(referenceDateAt('2026-11-27T03:00:00Z'),'2026-11-26'));
test('apply and disclose default, preserve explicit preference',()=>{
 for(const [prefs,level,source] of [[{},'Intermediate','default'],[{skill:'Advanced'},'Advanced','explicit preference']]){
 const i=normalizeIntent(raw,prefs,'2026-11-26');assert.equal(i.skill,level);assert.equal(i.skillSource,source);assert.equal(i.discloseSkillAssumption,source==='default');
 }
});
test('mixed sport skills remain separate',()=>{
 const i=normalizeIntent({...raw,sports:['Ski / snowboard','Trail running'],skillBySport:[{sport:'Ski / snowboard',skill:'Beginner'},{sport:'Trail running',skill:'Advanced'}]}, {},'2026-11-26');
 assert.deepEqual(i.skillBySport,{'Ski / snowboard':'Beginner','Trail running':'Advanced'});assert.equal(i.skillSource,'explicit');assert.equal(i.discloseSkillAssumption,false);
});
test('reject invalid calendar date; no forecast on distant or seasonal dates',()=>{
 assert.equal(normalizeIntent({...raw,startDate:'2027-02-30',endDate:'2027-02-30'}, {},'2026-11-26').dateStatus,'invalid');
 assert.equal(normalizeIntent({...raw,startDate:'2027-11-27',endDate:'2027-11-28'}, {},'2026-11-26').forecastEligible,false);
 assert.equal(normalizeIntent({...raw,dateStatus:'seasonal'}, {},'2026-11-26').startDate,null);
});
test('normalized dates are actually passed to weather adapter, disclosure is observable',async()=>{
 const calls=[];let requested;const actions=[{type:'tool',name:'find_candidates',args:{scenario:'tahoe'}},{type:'tool',name:'get_weather_forecast',args:{candidate_id:'tahoe-0'}},{type:'final',status:'insufficient',message:'Conditions not verified.'}];
 const r=await createHarness({model:{extractIntent:async x=>{requested=x.referenceDate;return raw},next:async ({state})=>{assert.equal(state.preferences.skill,'Intermediate');return actions.shift()}},fixtures,clock:()=>new Date(now),weatherTool:async x=>{calls.push(x);return {status:'unavailable'}}}).run({query:'Ski Tahoe November 27 and 28'});
 assert.equal(requested,'2026-11-26');assert.equal(calls[0].startDate,'2026-11-27');assert.equal(calls[0].endDate,'2026-11-28');assert.match(r.message,/assume intermediate/i);assert.equal(r.normalizedIntent.startDate,'2026-11-27');
 assert.deepEqual(deterministicChecks({expected:{skill:'Intermediate',startDate:'2026-11-27'}},r).map(x=>x.status),['pass','pass']);
});
test('ambiguous dates clarify without planning; no fabricated dates',async()=>{
 const i=await createHarness({model:{extractIntent:async()=>({...raw,dateStatus:'ambiguous'}),next:()=>{throw Error('must not call planner')}},fixtures,clock:()=>new Date(now)}).run({query:'ski Tahoe 12/05'});
 assert.equal(i.status,'clarify');assert.equal(i.normalizedIntent.startDate,null);assert.match(i.message,/assume intermediate/i);
});
test('model extracts strict structured output and passes the clock',async()=>{
 const m=createOpenAIModel({apiKey:'mock',fetchFn:async(_u,o)=>{
 const b=JSON.parse(o.body);assert.equal(JSON.parse(b.input).referenceDate,'2026-11-26');assert.equal(b.text.format.strict,true);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(raw)}]}]}));
 }});
 assert.deepEqual(await m.extractIntent({query:'Ski Tahoe Nov 27–28',preferences:{},referenceDate:'2026-11-26'}),raw);
});
